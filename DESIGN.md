# Tripwire design and assets

## Opening storyboard

The current revision adds layered metal housing, a brushed surface bump texture,
shutter ribs, a stop indicator, and moving call markers. A moving key light reveals
the housing as its layers settle together. These assets are authored in the scene
source and disposed with the renderer when the demo takes over.

The opening now uses an original Three.js scene authored in `intro-scene.js`.
Its 4.8-second sequence opens close on the gate, pulls the camera back, lowers
the shutter over Job A's lane, and extends Job B's light path through the gate.
The final pose remains still. Captions explain the changing subject. The scene
illustrates the product. The execution selector chooses the browser simulator
or the local service with actual embedded-Bifrost dispatch and SmolLM2 inference.

| Beat | Time | Visible change |
| --- | --- | --- |
| Establish | 0–1.2 seconds | Gate in close-up, camera begins its pullback. |
| Selective stop | 1.2–2.5 seconds | Shutter closes over A. The coral path terminates at the shutter. |
| Continue | 2.5–4.8 seconds | B's violet path extends through the open lane and the camera settles. |
| Rest | After 4.8 seconds | The final gate pose remains visible with Replay intro available. |

Pause freezes the camera, shutter, and beams together. Resume continues from
that same position. Skip settles to the final pose. Start demo interrupts any
beat, releases the renderer's resources, and switches to the compact Run control
view. Reduced motion opens on the final still pose. Renderer failure retains the
original poster and the Start demo control. The animation pauses when the tab
becomes hidden. Resize reframes the same pose without restarting the sequence.

The scene uses the workspace's installed Three.js version and generated geometry,
with no external model download. The original image remains the fallback.
Only the gateway artwork participates in the demo-entry view transition. The root
page is excluded so the run controls remain clickable during the handoff.
[Extruded geometry](https://threejs.org/docs/pages/ExtrudeGeometry.html) ·
[WebGL renderer](https://threejs.org/docs/pages/WebGLRenderer.html)

## Opening verification

Chrome on Windows reported ANGLE / Intel Iris Xe / Direct3D11 for the desktop
recording. Playback, pause/resume, replay, skip, interruption by Start demo,
and the subsequent A denial flow passed. At 390 × 667 and 320 × 568,
viewport and touch emulation passed for reduced motion, resize, skip, and
demo entry. An intentionally unavailable WebGL context retained the poster
and the working demo action. The production build passed. Physical phone
coverage and measured frame pacing remain unverified.

## References studied

- Apple’s iPhone 18 Pro opening uses a single dramatic product subject, then switches to a large heading and a feature close-up. Tripwire takes the same pacing principle into its own flow. A single optical-gate still establishes selective blocking, then the gateway console takes over on Start demo. [iPhone lineup](https://www.apple.com/iphone/) · [iPhone 18 Pro opening and highlights](https://www.apple.com/iphone-18-pro/)
- Softlight puts its initial proposition above a software workflow example. For Tripwire, the first working view brings both jobs and both workers together with their event feed. [Landdding design listing](https://landdding.com/l/softlight-com-81c91cf8) · [Softlight original site](https://softlight.com/)
- Oversight Supply’s Vortex detail and PrettySites’ gallery were checked for hero treatment. Mobbin was checked for app patterns. The evidence drawer follows the state-driven motion principle documented by Radix. [Vortex](https://supply.madebyoversight.com/sections/portfolio-vortex) · [PrettySites](https://prettysites.io/) · [Mobbin](https://mobbin.com/) · [Radix animation](https://www.radix-ui.com/primitives/docs/guides/animation)
- The research pass also opened the remaining requested sources. Godly redirects to Recent. [Landbook](https://land-book.com/) · [Recent](https://recent.design/) · [Godly](https://godly.website/) · [Siteinspire](https://siteinspire.com/) · [Minimal Gallery](https://minimal.gallery/) · [Jiro](https://jiro.build/) · [Oversight Supply](https://supply.madebyoversight.com/) · [Font In Logo](https://fontinlogo.com/)

## Runtime assets

| Asset | Origin and treatment | Files |
| --- | --- | --- |
| Optical gate | Original still from ImageGen. The 1400 px and 720 px variants are encoded locally in WebP. Poly Haven and Fab were checked for model sourcing before choosing a custom still for this specific optical gate. [Poly Haven models](https://polyhaven.com/models) · [Fab](https://www.fab.com/) | `assets/tripwire-gate.webp` · `assets/tripwire-gate-small.webp` |
| Geist Sans variable | Self-hosted WOFF2 from Vercel’s official Geist 1.9.2 distribution. SIL Open Font License 1.1. [Type specimen](https://vercel.com/font) · [Publisher repository](https://github.com/vercel/geist-font) · [Versioned package](https://registry.npmjs.org/geist/-/geist-1.9.2.tgz) | `assets/Geist-Variable.woff2` · `public/GEIST-LICENSE.txt` |
| Lucide icons | Existing editable SVGs used for stop, completion, progress, evidence dismissal and download. [License and notices](https://lucide.dev/license) | `assets/*.svg` · `public/LUCIDE-LICENSE.txt` |

## ImageGen prompt

> Create a single photorealistic premium industrial product photography still for a developer tool called Tripwire. Render an imaginary selective optical gate as a real, heavy precision-engineered machined titanium and smoky translucent glass rectangular apparatus with a large open rectangular passage, resting on a charcoal studio floor, at a strong three-quarter view, crisp chamfered edges, fine brushed metal, tight seams and one or two exposed dark fasteners. One narrow warm electric coral/orange horizontal fiber-optic light path terminates cleanly against the glass inside the gate, while a parallel cool icy lilac light path clearly runs through the opening and continues beyond the gate. Make those beams very fine, clean and restrained. The gate and light traces take up 80 percent of the frame, centered, readable with defined bright silver highlights against a clean monochrome midnight indigo-black seamless backdrop (#0c0e1a), subtle natural reflections on the floor. Use deliberate luxury industrial editorial product lighting with bright cool softbox key at upper left and light icy violet edge light, clean blacks, elegant metal. The subject must stand out bright and readable at 600 CSS px wide and fill most of the center in a 4:3 crop. One scene in landscape, used as visual on the right of a site with text over a separate solid region, so do not reserve blank area in image; keep extremities within 9 percent of frame. No typography, no letters, no interface, no logos, no stars, no galaxy, no robot, no motherboard, no decorative graphics. A simple singular physical object.
