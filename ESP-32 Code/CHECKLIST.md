# Three-ESP32 Whack-a-Mole tracker

## Upload and connect

The main **Access_Point** now includes the cone dashboard and game API in one
firmware. The old separate `Access_Point_Cones` program has been retired.

| Board | Sketch | IP | Trigger / Echo GPIO |
|---|---|---|---|
| Centre | `Access_Point/Access_Point.ino` | 192.168.4.1 | 10 / 3 |
| Player's left | `Sensor_Node_1/Sensor_Node_1.ino` | 192.168.4.101 | 10 / 3 |
| Player's right | `Sensor_Node_2/Sensor_Node_2.ino` | 192.168.4.102 | 10 / 3 |

Each board has one ultrasonic sensor. The AP keeps buzzer GPIO 18 and warning LED
GPIO 7; set an optional output to `-1` if absent. These are the pins currently in
your files. Keep all `.h` files beside the `.ino` when opening/copying a sketch.

1. Check the geometry below, select the actual board/port in Arduino IDE and
   upload `Access_Point.ino` to the centre ESP32. Nodes already running the
   current protocol-v2 sketches do not need reflashing for this integration.
   Older protocol-v1 nodes must be updated using the node sketches above.
2. Power all three boards. Connect the PC to **Wacker5**, password
   **PasswordWacker123456!**.
3. Open **http://192.168.4.1/** (or `/cones`) for the live dashboard. It is served
   from ESP flash: no internet, SD card or separate filesystem upload is needed.
4. Run `GameLauncher.bat` for the game and reload its browser page to load the
   updated backend. The game and cone page use the same AP simultaneously.

The current website (`gameLogic.js`) and the modular `main.js` backend now share
`SensorService.js`. The current index loads it before the game script. Both
entry points accept fresh two- or three-sensor positions, process each frame
once, and reject held/stale/single-sensor positions for scoring. Game rules and
the current website's visual effects remain in their existing implementations.

The PlatformIO target is `esp32-s3-devkitc-1`. The sketches use only ESP32
Arduino core libraries.
The older two-sensor `MVP.ino` and its event API remain supported by the game UI.

## Sensor spacing and aiming: edit one file

Near the top of `Access_Point/Access_Point.ino`:

```cpp
constexpr float SENSOR_GAP_LEFT_M = 0.35f;
constexpr float SENSOR_GAP_RIGHT_M = 0.35f;
constexpr float SENSOR_DISTANCE_FROM_SCREEN_M = 0.30f;
```

Values are metres. These preserve your updated 35 cm left gap, 35 cm right gap
and 30 cm screen distance. Measure between matching centre reference points,
not breadboard edges. Use metal sensor faces, or horn-mouth centres with the
setback correction below; do not mix references.
Only change them in this one sketch, then recompile/upload; both game and cone
display get their geometry from these settings.

Coordinates use the player's left/right while facing the screen. `x=0` is the
left edge of the physical 1.5 m-wide area; `y=0` is the screen and +y points
towards the player. The reference points are at `(0.40,0.30)`, `(0.75,0.30)` and
`(1.10,0.30)` m. The AP faces straight along +y. Side sensors aim at
`AIM_X_M=0.75`, `AIM_Y_M=1.30`, giving about **19.3° inward on both sides**.
Physically aim them to match, or set measured
angles using `SENSOR_BEARING_TRIM_DEG` (added to the nominal bearings).
Positive bearing turns towards the player's right.

`CONE_HALF_ANGLE_DEG=15` is an assumed beam half-angle, not a measured bearing.
Changing it does not widen a real beam. `MAX_RANGE_M=4.50` is slant range from
the sensor, not the depth of the game. The nominal beam and 50 ms measurement
cycle are described in the [RCWL-1601 specifications](https://www.adafruit.com/product/4007).
Use supply/logic levels appropriate to the actual sensor and ESP32; RCWL-1601
and similar-looking HC-SR04 modules are not electrically interchangeable.

## Sensors mounted behind horns

All three sensors have separate copies of the same housing. Edit these arrays
near the spacing settings in `Access_Point/Access_Point.ino`, in the order
**Node 1, centre AP, Node 2**:

```cpp
constexpr float SENSOR_FACE_SETBACK_M[3] = {0.0f, 0.0f, 0.0f};
constexpr float SENSOR_BEARING_TRIM_DEG[3] = {0.0f, 0.0f, 0.0f};
```

The setback is the measured axial distance from the front horn rim to the
fitted metal transducer faces (use their midpoint as the sensor centre).
If the spacing and screen distance describe horn-mouth centres, enter that
recess in metres for each sensor. If they already describe the metal faces,
leave setback at zero. Identical housings can use equal values once the fitted
recess is measured. Mixed reference measurements must first be made consistent.

The shared [Onshape model](https://cad.onshape.com/documents/96b2d6f588a1a8ec8a08cacf/w/d37ad5a438624d96a1035ca8/e/80441341eebd373975b8971e)
has a measured 70 mm separation between its Front and Plane 1 reference planes.
That does **not** establish where the fitted transducer faces sit. Defaults
remain zero pending a physical recess measurement and confirmation of the
spacing/screen-distance reference; no unverified 70 mm correction is enabled.

For actual bearing `theta`, the effective sensor origin becomes:

```text
sensor_x = reference_x - setback * sin(theta)
sensor_y = reference_y - setback * cos(theta)
```

This moves the inward-facing nodes sideways as well as backwards. Two-circle
intersection and three-range multilateration both use these corrected origins.
The cone dashboard and proximity calculations use the same origins.
`/api/config` reports them in the existing `x_m` and `y_m` fields and adds
`face_setback_m`; the game backend needs no API migration.

Keep range measurements referenced to the transducers: **do not also subtract
the setback using `SENSOR_OFFSET_M`**. That would apply a second correction.
This is a 2D point-sensor approximation, not a simulation of sound inside the
two horn passages. A horn can change directivity ([Murata FAQ](https://www.murata.com/en-us/products/sensor/ultrasonic/support/faqs));
its CAD wall angle does not establish the usable detection cone or echo bias.
Keep `CONE_HALF_ANGLE_DEG` as an estimate until you measure actual coverage.

After setting the geometry, test a fixed reflector at several known positions
with the housings installed. Compare each raw range to its distance from the
corrected sensor origin before adjusting `SENSOR_SCALE` or `SENSOR_OFFSET_M`.
Test all six floor targets and the edges of each beam. Housing echoes, different
body reflection points and intermittent detections cannot be corrected reliably
by a constant geometric offset alone.

## Where to stand to hit each hole

The original full-width grid put the near left/right hole centres outside
sufficient beam overlap. The six targets now occupy a narrower rectangle
farther from the screen, independently of the physical area and warning zone:

```cpp
constexpr float GAME_AREA_X_MIN_M = AP_X_M - 0.30f; // 0.45 m
constexpr float GAME_AREA_X_MAX_M = AP_X_M + 0.30f; // 1.05 m
constexpr float GAME_AREA_START_Y_M = 1.00f;
constexpr float GAME_AREA_END_Y_M = DEAD_ZONE_M + PLAY_AREA_DEPTH_M; // 2.00 m
```

All four settings are near the top of `Access_Point.ino`. The dashboard's
outlined zones and **Where to stand** table update automatically. Game hole
tooltips also show their physical target centres. The on-screen 2-column,
3-row hole layout is unchanged; it maps into this physical rectangle.

| Visible holes | Internal IDs | Left/right of centre sensor | From screen |
|---|---|---|---|
| 1 / 2 (near) | 0 / 1 | 15 cm left / 15 cm right | 116.7 cm |
| 3 / 4 (middle) | 2 / 3 | 15 cm left / 15 cm right | 150.0 cm |
| 5 / 6 (far) | 4 / 5 | 15 cm left / 15 cm right | 183.3 cm |

Mark these six centres on the floor to test. Left/right divides at `x=0.75 m`;
row boundaries are `y=1.333` and `1.667 m`. The grid accepts x from 0.45 to
1.05 m and y over 1.00 through 2.00 m. It uses 5 cm boundary hysteresis and two
consecutive fresh frames for a changed cell. Outside coordinates do not score
and are never clamped into a hole. All six centres have three-beam coverage in
the configured point-reflector model; the entire rectangles are not guaranteed
to have that coverage. Confirm with the actual mounting and person.

The physical area remains 1.5 m wide and 1.4 m deep after the 0.6 m dead zone,
as described in the supplied v2.1 brief. **The warning threshold is still 60 cm**
from the screen. The region from 60 cm to 1 m is trackable but has no hole.

## Cone-page hole calibration experiment

The **Stand here to calibrate a hole** panel on `/` or `/cones` is a browser-only
test. It does not alter the ESP32's hit zones, `/api/hits`, or the actual game.
Upload the updated Access Point sketch (with the regenerated `Dashboard.h`)
and reload the cone page. The node sketches need no update for this feature.

1. Mark six distinct floor spots where you want the holes to be. Stand at one
   spot and press **Calibrate hole N**, or have someone press it for you.
2. Stay still during the 3-second countdown and the capture. The page collects
   at least 15 distinct fresh frames over at least 2.5 seconds, usually taking
   another 3–5 seconds. Either two or three contributing sensors can be used.
3. Repeat for each hole. Purple circles on the map show the saved centres and
   test radii. Walk away and return: the panel shows **Test hole N** and the
   matching card/circle turns green. This is a live preview, not a game hit event.
4. Adjust **Test hit radius** to 10, 15 or 20 cm. Overlapping circles or nearly
   equal distances to two centres produce no hit. Calibrate well-separated spots.

Captures use raw valid position estimates, not held or mode-filtered positions.
The centre is the median of each coordinate. Captures with a 90th-percentile
distance from the centre above 10 cm are rejected; new centres must be at least
15 cm from the other saved centres. These are trial thresholds, not guarantees
of physical accuracy. Invalid/held/warning/stale/one-sensor frames are excluded;
duplicate HTTP responses count only once, and a frozen frame cannot keep a test
hit alive. A capture times out after 20 seconds of collection. Cancellation,
failure or an AP restart leaves previously saved centres intact.

Calibration and radius are saved in browser local storage for this page address,
not in ESP32 flash. Another browser/device or opening the file directly has its
own storage. Storage failure is shown on the page; in that case captures last
only for the current page session. Changed sensor geometry invalidates saved
calibration when configuration is reloaded. Manually recalibrate after moving
hardware or changing range scale/offsets. **Clear saved holes** resets this
experiment only. Recalibrating a hole replaces it only after a successful capture.

This feature still needs valid positions from the AP. It cannot recover missing
echoes or correct incorrect sensor geometry. A disabled capture button means no
fresh usable position; inspect the sensor diagnostics. Centres are coordinates
reported by the sensor model, not independent measurements of the floor.

Developers: edit `Access_Point/cones.html`, then run `python tools/embed_dashboard.py`
from `ESP-32 Code`. Run `node "ESP-32 Code/tests/hole_calibration_test.cjs"` from
the repository root. The local preview server's `?mode=calibration&hole=1` through
`hole=6` provide explicitly simulated positions for testing the workflow.

## Position calculation and jump suppression

Ultrasound provides ranges, so the calculation is trilateration/multilateration.
There are no measured angles for bearing-based triangulation:

```text
predicted_range[i] = sqrt((x - sensor_x[i])² + (y - sensor_y[i])²)
residual[i] = predicted_range[i] - measured_range[i]
```

For three ranges, minimise the sum of Huber losses: `e²` for `|e| <= delta`,
otherwise `2*delta*|e| - delta²`. The solver uses nine starting points and
adaptive Levenberg-Marquardt damping, accepting only steps that reduce loss.
It still rejects points outside the configured cones/area, weak geometry,
RMS residual over 10 cm, or any individual residual over 18 cm.

**Only two usable sensors are required.** All three are preferred when the fit
is consistent. If three echoes disagree, the AP checks every two-sensor pair.
A unique plausible pair can track even if the third sensor sees a wall or a
different reflector. It reports `two_ranges_fallback` and explicitly identifies
the excluded echo. Candidate positions must satisfy the contributing sensors'
cones, area limits and uncertainty checks; the unused cone does not veto them.
If several pairs suggest different locations, accept only a unique continuation
near the recent position; otherwise report `ambiguous_pairs`. The system cannot
reliably choose between equally plausible targets without more information.

For two ranges, intersect the two circles and require a unique point inside
both cones and the tracked area. This has no third-sensor consistency check.
With fewer than two ranges there is no new 2D fix. Geometry uncertainty uses
the largest-axis standard deviation of `sigma² * inverse(JᵀJ)`, with sigma at
least `ASSUMED_RANGE_NOISE_M`. Fixes above `MAX_POSITION_UNCERTAINTY_M` are
rejected. This is a local noise model, not an observed accuracy guarantee.

The previous three-reading average has been replaced by:

1. A range gate: a change over 16 cm must repeat within 10 cm on the next
   reading, or that sensor's range is excluded. The other two may still locate
   the player; a rejected third echo no longer cancels the whole frame.
   Invalid data clears range history.
2. Position confirmation: a move over 14 cm must be followed by another fix
   within 8 cm of that new position. An isolated jump leaves the marker still.
3. A grouped position mode replaces exponential averaging. The latest five
   valid positions vote in 5 cm x/y cells (rounded to the nearest cell centre).
   The most frequent cell wins; ties favour the most recently observed cell.
   The actual position nearest the winning cell's centre represents that cell,
   with ties favouring its newest reading. With no repeated cell, use the latest
   position. No coordinates are averaged or snapped to an artificial point.
   Two- and three-sensor fixes use the same filter. Votes expire after 1000 ms;
   invalid fixes, track resets and confirmed large movements clear the history.
   A five-sample window may delay smaller movements by several frames. Larger
   windows increase that delay; cell boundaries can also cause mode switching.
   Nodes still report raw ranges, and the older standalone MVP sketch is unchanged.
4. A display-only hold for at most 350 ms after a bad frame. Held fixes retain
   their original timestamp, appear amber, and **cannot score**. Position
   smoothing also cannot score the old cell when the latest fix maps elsewhere.

Relevant editable constants in the AP sketch:

| Setting | Default | Effect |
|---|---:|---|
| `RANGE_SPIKE_LIMIT_M` | 0.16 | Range change requiring confirmation |
| `RANGE_CONFIRM_TOLERANCE_M` | 0.10 | Agreement between changed ranges |
| `POSITION_JUMP_LIMIT_M` | 0.14 | Position change requiring confirmation |
| `POSITION_CONFIRM_RADIUS_M` | 0.08 | Agreement between changed fixes |
| `POSITION_MODE_WINDOW` | 5 | Number of recent positions voting, from 1 to 9 |
| `POSITION_MODE_BIN_M` | 0.05 | Width of each x/y cell in metres |
| `POSITION_MODE_HISTORY_MS` | 1000 | Maximum age of a position vote |
| `PAIR_AGREEMENT_M` | 0.10 | Distance within which pair candidates agree |
| `PAIR_PREVIOUS_RADIUS_M` | 0.25 | Maximum distance from recent track to resolve competing pairs |
| `POSITION_HOLD_MS` | 350 | Maximum visual hold; never a fresh hit |
| `HUBER_LIMIT_M` | 0.06 | Residual at which robust downweighting begins |
| `ASSUMED_RANGE_NOISE_M` | 0.025 | Range noise floor for geometry checks |
| `MAX_POSITION_UNCERTAINTY_M` | 0.20 | Maximum model uncertainty |
| `SENSOR_SCALE`, `SENSOR_OFFSET_M` | 1, 0 | Per-sensor distance calibration |

The dashboard shows accepted range arcs, rejected raw echoes, a hollow raw
position and a solid filtered position. Contributing echoes are labelled
**Used for position**. An unused conflicting echo is labelled **Echo excluded**
and drawn with a faint dashed range arc. Sensors cannot identify a person or locate a reflection within
their beam: reflections from clothing, arms, tables and walls can disagree.
Mount sensors level and aimed at the same body region. Calibrate offsets with
a stationary flat reflector at measured distances before testing a person.

## Timing, warning and API

The AP measures locally, then requests each node in turn, with 60 ms quiet
periods after measurements/replies/timeouts. Healthy frames take roughly
0.2–0.3 s; Wi-Fi, no-echo timeouts and HTTP work affect this. Node protocol v2
uses CRC32, source IP/port, random AP session IDs and matched sequences.
An ARM/READY/FIRE exchange authorises one pulse within 50 ms; duplicate or
expired triggers are ignored. Nodes reconnect without an indefinite wait.

Ranges expire after 500 ms and frames spanning over 300 ms are rejected.
The local echo call can block for at most 27 ms; HTTP continues between slots.
The buzzer/LED warning uses fresh unsmoothed positions and raw short echoes
so filtering does not hide proximity. A direct echo warns when sensor y plus
range is at most 60 cm. Missed echoes and blind spots remain possible.

| Endpoint | Result |
|---|---|
| `GET /` or `/cones` | Integrated HTML cone dashboard |
| `GET /api/config` | Physical area, `game_area`, sensor positions/angles and expiry |
| `GET /api/position` | Position and physical sensor diagnostics |
| `GET /api/hits` | Existing `wam-hits-v1` envelope (`api_version:2`), events, `current_hole`, position, diagnostics and `game_area` |
| `POST /api/game/start` | Re-arm cell stability; HTTP 204 |

API routes support CORS/OPTIONS and no-store caching. Existing position fields
remain, with additive `held`, `raw_x_m`, `raw_y_m`, `uncertainty_m` and
`in_game_area`. `valid:true, held:true` means a recent display estimate, **not**
a new measurement: clients must check `held !== true` before scoring.
The game backend does this and processes each boot/frame pair once.

`sensors_used_mask` identifies the selected sensors (bits 0/1/2 = Node 1/AP/Node 2).
`available_mask` identifies the current solver inputs after range gating.
`sensor_status[].used_for_position` identifies a currently contributing sensor;
`excluded_from_position` identifies a usable echo outside the selected subset.
Freshness and frame-span checks use the selected sensors. A held fix keeps the
previous mask in the position object but reports no currently contributing echoes.
A fresh pair may also replace a three-range fit whose readings are too far
apart in time; this is reported as `two_ranges_timing`. A pair itself must still
meet the 300 ms frame-span limit.

`game_area` contains `x_min_m`, `x_max_m`, `start_y_m`, `end_y_m`, all in world
coordinates. `ranges_m` and `sensor_status` are ordered [Node 1, AP, Node 2].
`raw_m` is corrected but ungated; `range_m` is accepted by the spike gate,
or null. `rejected` identifies a spike. `echo` means a raw echo exists even
when rejected. Invalid numeric data is null. `node_online` is [Node 1, Node 2].
The legacy `sensors` array remains a two-column game view; held fixes invalidate
those lanes. Invalid/stale/warning positions cannot fall back to legacy lanes.

## Building and verification

Geometry and tracking edits need only recompilation. When editing the HTML,
regenerate its checked-in flash header; this never copies or replaces firmware:

```text
python "ESP-32 Code/tools/embed_dashboard.py"
python "ESP-32 Code/tools/embed_dashboard.py" --check
node "ESP-32 Code/tests/game_backend_test.cjs"
bash "ESP-32 Code/tests/run_native.sh"
pio run -d "ESP-32 Code"
```

On Windows use WSL bash with g++ for native tests. PlatformIO builds the three
environments `access_point`, `node_1`, `node_2`. The build-only command does not
flash hardware. Choose a specific environment/physical port for uploading.

Validated 2026-10-05 with ESP32 Arduino core 2.0.17 and Espressif32 7.0.1:
all three firmware builds; 196 geometric grid points; six target centres with
three sensors and every two-sensor combination; jitter, spike, sustained
movement, dropout and clock-wrap tests; two-beam edge coverage, background-echo
fallback and competing-pair ambiguity; current website and modular backend
scoring, held/stale/outside-zone suppression and MVP compatibility. In a seeded
600-frame stationary simulation with 1.2 cm range noise, tracked RMS position
error was 2.14 cm versus 3.28 cm for the same solver without tracking, over 577
fresh outputs. Sixteen injected spikes were excluded while the other pair kept
providing fixes. The baseline uses the current 35/35 cm layout and pair fallback.
This simulation does not establish accuracy on the real sensor rig.

For browser QA, `python "ESP-32 Code/tests/preview_server.py"` serves a labelled
synthetic dashboard at http://127.0.0.1:8766/ and the actual game at `/game/`.
Query modes `partial`, `fallback`, `held`, `invalid`, `warning` and `offline`
exercise alternative states. This server is
only a test fixture; the actual firmware never substitutes synthetic data.
