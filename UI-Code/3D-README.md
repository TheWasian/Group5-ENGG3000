# Three.js mole branch

This branch uses genuine 3D mesh models for the moles and holes. The existing JavaScript game services, six hole hit targets, sensor API and HTML hammer still drive the game. No firmware changes are required.

From the repository root, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [the game](http://127.0.0.1:8000/UI-Code/) or [the model gallery](http://127.0.0.1:8000/UI-Code/tests/three-preview.html). Use an HTTP server: opening `index.html` directly as a file prevents browsers from loading JavaScript modules.

Three.js 0.180.0 is vendored locally with its MIT license. Rendering does not require npm, a CDN, downloaded model assets, or an internet connection. The existing optional Google font still uses its normal font fallback when offline.

`backend/three/MoleModels.mjs` builds the editable models from mesh geometry and physically based materials. It includes normal, golden, freeze, bomb, ice/fire normal, and ice/fire bomb appearances, with raised soil rims, grass and stones. Bombs are 50% larger than the initial 3D version. `MoleMotion.mjs` controls rise/retreat and keeps the departing skin until hidden. `ThreeBoard.mjs` connects those models to `GameView`.

`GardenScene.mjs` builds five distinct scenery sets: a garden with trees and flowers; snowy pines, ice formations, a frozen pond and mountains; basalt, scorched trunks, volcanoes and lava; a toxic mushroom marsh; and a field of violet spires and stars. Only the current set is visible. Repeated scenery uses instanced geometry. Ice moles are deep blue, while freeze moles stay pale cyan with crystal crowns. Fire moles have red fur. Volcanoes emit silent, randomly timed bursts of lava fragments and smoke using fixed reusable instance pools; eruptions stop outside the fire theme and when reduced motion is enabled.

The moles, holes and landscape now share one perspective scene, lighting setup and full-screen canvas. `GroundLayout.mjs` projects each existing DOM hole onto the ground plane, and the terrain shader cuts a matching opening in the surface. The soil rims rise slightly above the ground and slope back into it; their top edge uses a subtly darker shade of each environment’s ground colour. The path and lava channel reroute around the full hole rims whenever the layout changes. The camera stays fixed; resizing and scrolling update the projection to preserve the scoring targets and sensor hammer mapping. The canvas passes clicks through to the game. Rendering is capped at 60 frames per second, respects reduced motion and pauses when the page is hidden. If WebGL 2 is unavailable or its context is lost, the CSS game and background remain available.

A short loading state hides the CSS fallback until the first 3D frame is ready. If importing or initializing the renderer fails, that state clears and the CSS game remains playable.

The production page uses the available viewport height for its six-hole board, with compact controls and no diagnostic panels. Sensor tracking works without the removed debug elements.

Run the model and integration checks from the repository root:

```sh
node UI-Code/tests/three-models.test.mjs
```

The gallery includes controls for the special skins, retreat, immediate replacement, themes, graphics loss and restoration. It is a development preview, separate from the game. Physical sensor accuracy must still be checked using the actual arranged sensor boards.
