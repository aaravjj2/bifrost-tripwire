// The opening is an illustrative scene. Gateway state comes from the simulator.
export function createIntro({ canvas, controls, toggle, skip, caption }) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  let sceneController;

  const start = async () => {
    try {
      const [{ buildScene }, THREE, { RoomEnvironment }] = await Promise.all([
        import('./intro-scene.js'),
        import('three'),
        import('three/addons/environments/RoomEnvironment.js'),
      ]);
      if (disposed) return;
      sceneController = buildScene({ THREE, RoomEnvironment, canvas, controls, toggle, skip, caption, motion });
    } catch {
      // The original art and the start action remain available on renderer failure.
      canvas.hidden = true;
      controls.hidden = true;
      caption.textContent = 'Job A blocked. Job B continues.';
      canvas.parentElement.dataset.renderer = 'poster';
    }
  };
  start();

  return {
    dispose() {
      disposed = true;
      sceneController?.dispose();
      controls.hidden = true;
      canvas.hidden = true;
      caption.hidden = true;
    },
  };
}
