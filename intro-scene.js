export function buildScene({ THREE, RoomEnvironment, canvas, controls, toggle, skip, caption, motion }) {
  const duration = 4800;
  const surface = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x0b0d18);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0d18, 12, 30);
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 70);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(environment, .06);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1.1;
  environment.dispose();
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xe4eaff, 2.5);
  key.position.set(-3, 7, 5);
  scene.add(key, new THREE.HemisphereLight(0x9d9bff, 0x141526, .5));
  const rim = new THREE.DirectionalLight(0x9b83ff, 4);
  rim.position.set(5, 2, -4);
  scene.add(rim);
  const gate = new THREE.Group();
  scene.add(gate);

  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = 256;
  grainCanvas.height = 256;
  const grainContext = grainCanvas.getContext('2d');
  grainContext.fillStyle = '#808080';
  grainContext.fillRect(0, 0, 256, 256);
  for (let line = 0; line < 256; line++) {
    const shade = 110 + Math.round(35 * Math.sin(line * 13.37));
    grainContext.fillStyle = `rgb(${shade},${shade},${shade})`;
    grainContext.fillRect(0, line, 256, 1);
  }
  const grain = new THREE.CanvasTexture(grainCanvas);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(3, 3);

  function roundedRect(path, x, y, width, height, r) {
    path.moveTo(x + r, y);
    path.lineTo(x + width - r, y);
    path.quadraticCurveTo(x + width, y, x + width, y + r);
    path.lineTo(x + width, y + height - r);
    path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    path.lineTo(x + r, y + height);
    path.quadraticCurveTo(x, y + height, x, y + height - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
  }

  const shape = new THREE.Shape();
  roundedRect(shape, -2.05, -1.38, 4.1, 2.76, .24);
  const hole = new THREE.Path();
  roundedRect(hole, -1.61, -.98, 3.22, 1.96, .12);
  shape.holes.push(hole);
  const housing = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: .48, bevelEnabled: true, bevelSize: .07, bevelThickness: .07, bevelSegments: 3, curveSegments: 12 }),
    new THREE.MeshStandardMaterial({ color: 0xa9b1c1, metalness: .95, roughness: .21, bumpMap: grain, bumpScale: .012 }),
  );
  housing.position.z = -.24;
  gate.add(housing);
  const backplate = new THREE.Mesh(housing.geometry, new THREE.MeshStandardMaterial({ color: 0x41485e, metalness: .92, roughness: .18 }));
  backplate.position.z = -.48;
  backplate.scale.set(1.035, 1.035, .35);
  gate.add(backplate);

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x23283b, metalness: .85, roughness: .32 });
  const divider = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.95, .5), darkMetal);
  gate.add(divider);
  const shutter = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.92, .16),
    new THREE.MeshPhysicalMaterial({ color: 0x36303e, metalness: .7, roughness: .2, clearcoat: 1 }),
  );
  shutter.position.set(-.8, 2.15, .17);
  gate.add(shutter);
  const ribs = new THREE.Group();
  for (let line = 0; line < 17; line++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(1.38, .014, .012), darkMetal);
    rib.position.set(0, -.85 + line * .106, .09);
    ribs.add(rib);
  }
  shutter.add(ribs);

  const indicator = new THREE.Mesh(
    new THREE.TorusGeometry(.095, .012, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xff785d }),
  );
  indicator.position.set(-.8, 0, .272);
  gate.add(indicator);

  for (const x of [-1.85, 1.85]) {
    for (const y of [-1.17, 1.17]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .025, 12), darkMetal);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(x, y, .31);
      gate.add(screw);
    }
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshBasicMaterial({ color: 0x0b0d18 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.49;
  scene.add(floor);

  function beam(color, x) {
    const group = new THREE.Group();
    for (const [radius, opacity] of [[.009, 1], [.028, .12], [.06, .025]]) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 1, 12),
        new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
    }
    group.position.x = x;
    scene.add(group);
    return group;
  }
  const blocked = beam(0xff785d, -.8);
  const allowed = beam(0xa697ff, .8);
  const packets = [0xffa18b, 0xc0b5ff].map((color, index) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 12), new THREE.MeshBasicMaterial({ color }));
    mesh.position.set(index === 0 ? -.8 : .8, 0, 4.4);
    scene.add(mesh);
    return mesh;
  });
  const contact = new THREE.PointLight(0xff674f, 0, 3);
  contact.position.set(-.8, 0, .5);
  scene.add(contact);

  const smooth = (v) => {
    const p = THREE.MathUtils.clamp(v, 0, 1);
    return p * p * (3 - 2 * p);
  };
  let elapsed = motion.matches ? duration : 0;
  let frame;
  let lastTime;
  let paused = motion.matches || document.hidden;
  let failed = false;
  const startCamera = new THREE.Vector3(2.9, 1.1, 5.4);
  const endCamera = new THREE.Vector3(4.6, 2.05, 7.2);
  const target = new THREE.Vector3();

  function render() {
    const progress = smooth(elapsed / duration);
    const closing = smooth((elapsed - 1200) / 850);
    const travel = smooth((elapsed - 2100) / 1500);
    camera.position.lerpVectors(startCamera, endCamera, progress);
    // A wider framing keeps the entire gate visible on narrow viewports.
    camera.position.multiplyScalar(Math.max(1, 1.4 / camera.aspect));
    target.set(.3 - progress * .3, .35 - progress * .35, 0);
    camera.lookAt(target);
    gate.rotation.y = -.12 + progress * .12;
    backplate.position.z = -.48 - .35 * (1 - smooth(elapsed / 1100));
    key.position.x = -3 + 5 * smooth(elapsed / 2000);
    shutter.position.y = 2.15 * (1 - closing);
    shutter.visible = closing > 0;
    const blockedLength = 4 * smooth((elapsed - 600) / 1600);
    blocked.scale.set(1, 1, Math.max(.001, blockedLength));
    blocked.position.z = 4.4 - blockedLength / 2;
    const allowedLength = 4 + 4 * travel;
    allowed.scale.set(1, 1, allowedLength);
    allowed.position.z = 4.4 - allowedLength / 2;
    packets[0].position.z = 4.4 - blockedLength;
    packets[1].position.z = 4.4 - allowedLength;
    indicator.visible = closing > .98;
    contact.intensity = closing * 5;
    caption.textContent = elapsed < 1200
      ? 'One gateway. Two independent runs.'
      : elapsed < 2500
        ? 'Job A’s lane closes at the gate.'
        : 'Job A blocked. Job B continues.';
    canvas.dataset.phase = elapsed < 1200 ? 'establish' : elapsed < 2500 ? 'blocking' : 'continuing';
    renderer.render(scene, camera);
  }

  function updateControls() {
    toggle.textContent = elapsed >= duration ? 'Replay intro' : paused ? 'Resume intro' : 'Pause intro';
    skip.hidden = elapsed >= duration;
    canvas.dataset.playback = elapsed >= duration ? 'ended' : paused ? 'paused' : 'playing';
  }

  function tick(time) {
    frame = undefined;
    if (paused || failed) return;
    if (lastTime !== undefined) elapsed = Math.min(duration, elapsed + time - lastTime);
    lastTime = time;
    render();
    if (elapsed < duration) frame = requestAnimationFrame(tick);
    else updateControls();
  }

  function pause() {
    paused = true;
    cancelAnimationFrame(frame);
    lastTime = undefined;
    updateControls();
  }

  function play() {
    paused = false;
    lastTime = undefined;
    updateControls();
    frame = requestAnimationFrame(tick);
  }

  function finish() {
    pause();
    elapsed = duration;
    render();
    updateControls();
    if (document.activeElement === skip) toggle.focus();
  }

  function togglePlayback() {
    if (elapsed >= duration) {
      if (motion.matches) return;
      elapsed = 0;
      play();
    } else if (paused) play();
    else pause();
  }

  function onMotion() {
    controls.hidden = motion.matches;
    if (motion.matches) finish();
  }
  function onVisibility() {
    if (document.hidden) pause();
  }
  function onContextLost(event) {
    event.preventDefault();
    failed = true;
    pause();
    surface.dataset.renderer = 'poster';
    controls.hidden = true;
  }
  const resize = new ResizeObserver(() => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height || failed) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  });
  resize.observe(canvas);
  toggle.addEventListener('click', togglePlayback);
  skip.addEventListener('click', finish);
  motion.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);
  surface.dataset.renderer = 'webgl';
  controls.hidden = motion.matches;
  updateControls();
  if (!paused) play();

  return {
    dispose() {
      pause();
      failed = true;
      resize.disconnect();
      toggle.removeEventListener('click', togglePlayback);
      skip.removeEventListener('click', finish);
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((object) => {
        object.geometry?.dispose();
        if (object.material) object.material.dispose();
      });
      envTarget.dispose();
      grain.dispose();
      renderer.dispose();
      surface.dataset.renderer = 'poster';
    },
  };
}
