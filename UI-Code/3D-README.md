# Three.js mole branch

This branch uses genuine 3D mesh models for the moles and holes. The existing JavaScript game services, six hole hit targets, sensor API and HTML hammer still drive the game. No firmware changes are required.

To play, double-click `UI-Code/index.html`. Keep the entire `UI-Code` folder together when sharing it. The included `backend/three/three-game.bundle.js` contains Three.js and the 3D game modules as one regular browser script, so playing does not require Live Server, Python, Node or npm. A WebGL 2 capable browser is still required for the 3D graphics.

For development, you can also run this from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [the game](http://127.0.0.1:8000/UI-Code/) or [the model gallery](http://127.0.0.1:8000/UI-Code/tests/three-preview.html). The game and model gallery also work as local files. The sensor test fixture uses fetch to load the game HTML and still needs a development server.

After editing `backend/three/*.mjs` or the vendored Three.js sources, regenerate the shipped bundle from `UI-Code`:

```sh
npm ci
npm run build
npm run check:bundle
npm test
```

The esbuild dependency is only needed for development. Include the regenerated bundle when sharing source changes; players do not need to run a build. `check:bundle` detects when it no longer matches the source. The Three.js MIT license is preserved in the bundle and `vendor/three/LICENSE`.

Live sensors still require the computer to be connected to Wacker5 and the browser to permit requests to `http://192.168.4.1`. Bundling removes the server requirement for graphics; it does not change sensor validity checks or browser network permissions.

Three.js 0.180.0 is vendored locally with its MIT license. Rendering does not require npm, a CDN, downloaded model assets, or an internet connection. The existing optional Google font still uses its normal font fallback when offline.

`backend/three/MoleModels.mjs` builds the editable models from mesh geometry and physically based materials. It includes normal, golden, freeze, bomb, ice/fire normal, and ice/fire bomb appearances, with raised soil rims, grass and stones. Bombs are 50% larger than the initial 3D version. `MoleMotion.mjs` controls rise/retreat and keeps the departing skin until hidden. `ThreeBoard.mjs` connects those models to `GameView`.

`GardenScene.mjs` builds five distinct scenery sets: a garden with trees and flowers; snowy pines, ice formations, a frozen pond and mountains; basalt, scorched trunks, volcanoes and lava; a toxic mushroom marsh; and a field of violet spires and stars. Only the current set is visible. Repeated scenery uses instanced geometry. Ice moles are deep blue, while freeze moles stay pale cyan with crystal crowns. Fire moles have red fur. Volcanoes emit silent, randomly timed bursts of lava fragments and smoke using fixed reusable instance pools; eruptions stop outside the fire theme and when reduced motion is enabled.

The moles, holes and landscape now share one perspective scene, lighting setup and full-screen canvas. `GroundLayout.mjs` projects each existing DOM hole onto the ground plane, and the terrain shader cuts a matching opening in the surface. The soil rims rise slightly above the ground and slope back into it; their top edge uses a subtly darker shade of each environment’s ground colour. The path and lava channel reroute around the full hole rims whenever the layout changes. The camera stays fixed; resizing and scrolling update the projection to preserve the scoring targets and sensor hammer mapping. The canvas passes clicks through to the game. Rendering is capped at 60 frames per second, respects reduced motion and pauses when the page is hidden. If WebGL 2 is unavailable or its context is lost, the CSS game and background remain available.

A short loading state hides the CSS fallback until the first 3D frame is ready. If loading or initializing the renderer fails, that state clears and the CSS game remains playable.

The production page uses the available viewport height for its six-hole board, with compact controls and no diagnostic panels. Sensor tracking works without the removed debug elements.

Run the model and integration checks from the repository root:

```sh
node UI-Code/tests/three-models.test.mjs
```

The gallery includes controls for the special skins, retreat, immediate replacement, themes, graphics loss and restoration. It is a development preview, separate from the game. Physical sensor accuracy must still be checked using the actual arranged sensor boards.

Fresh AP sensor frames use the hammer head’s screen position to raycast against the active, visible 3D mole via `HitTesting.mjs`. This allows an actual visual overlap to score while `current_hole` confirmation is pending. Stale, held, warning, invalid and out-of-area fixes remain rejected, as do duplicate frames. The CSS fallback retains AP hole-based scoring. Hammer geometry is recalculated when samples arrive so compact layout changes cannot leave stale coordinates.

`tests/sensor-hits.html` loads the real game with simulated API responses and controls for fresh overlap, held overlap and misses; it never sends requests to the physical controller.

`backend/SoundService.js` generates a short pop for successful normal/golden/freeze hits and a descending effect whenever a life is lost (bombs or escaped normal moles). Sound is muted on every page load; use the **Sound: Off** button beside Start to enable it. Muting silences active effects immediately. Audio is initialized from that button, with Start/Restart able to resume an enabled context. The sounds need no asset downloads and work with the regular script setup. They play through the browser, independently of the ESP32 buzzer. `tests/sound-preview.html` renders the effects into memory for silent verification.

The renderer batches fixed mole and hole parts by material, with simpler geometry for tiny grass blades. It caches target projection until a resize/scroll or a periodic layout check, and refreshes it synchronously before sensor hit tests. Off-target hammer positions are rejected by projected bounds before triangle raycasts; the hit radius and scoring rules are unchanged. The frame clock targets 60 fps, while the 2048-pixel shadow map updates at 30 fps during mole motion and stays cached for static scenery. Theme/layout changes and the end of a retreat invalidate the shadow immediately. 3D hit feedback uses the soil flash and hammer swing without scaling the invisible HTML target.

`tests/performance-preview.html` measures one- and six-mole scenes after shader warmup, reporting CPU submission times, render cadence, draw calls, triangles and layout reads. It is a development fixture requiring an HTTP server. Compare samples at the same viewport and device pixel ratio; FPS and GPU performance depend on the device.
