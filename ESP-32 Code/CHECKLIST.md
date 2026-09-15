# Three-ESP32 Whack-a-Mole tracker

## Upload and connect

The main **Access_Point** now includes the cone dashboard and game API in one
firmware. The old separate `Access_Point_Cones` program has been retired.

| Board | Sketch | IP | Trigger / Echo GPIO |
|---|---|---|---|
| Centre | `Access_Point/Access_Point.ino` | 192.168.4.1 | 27 / 26 |
| Player's left | `Sensor_Node_1/Sensor_Node_1.ino` | 192.168.4.101 | 26 / 27 |
| Player's right | `Sensor_Node_2/Sensor_Node_2.ino` | 192.168.4.102 | 26 / 27 |

Each board has one ultrasonic sensor. The AP keeps buzzer GPIO 4 and warning LED
GPIO 5; set an optional output to `-1` if absent. These are the pins currently in
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

The PlatformIO target is classic `esp32dev`; select a different board definition
if your hardware requires it. The sketches use only ESP32 Arduino core libraries.
The older two-sensor `MVP.ino` and its event API remain supported by the game UI.

## Sensor spacing and aiming: edit one file

Near the top of `Access_Point/Access_Point.ino`:

```cpp
constexpr float SENSOR_GAP_LEFT_M = 0.36f;
constexpr float SENSOR_GAP_RIGHT_M = 0.48f;
constexpr float SENSOR_DISTANCE_FROM_SCREEN_M = 0.30f;
```

Values are metres. These preserve your updated 36 cm left gap, 48 cm right gap
and 30 cm screen distance. Measure between sensor centres, not breadboard edges.
Only change them in this one sketch, then recompile/upload; both game and cone
display get their geometry from these settings.

Coordinates use the player's left/right while facing the screen. `x=0` is the
left edge of the physical 1.5 m-wide area; `y=0` is the screen and +y points
towards the player. The sensors are at `(0.39,0.30)`, `(0.75,0.30)` and
`(1.23,0.30)` m. The AP faces straight along +y. Side sensors aim at
`AIM_X_M=0.75`, `AIM_Y_M=1.30`, giving about **19.8° inward on the left** and
**25.6° inward on the right**. Physically aim them to match, or set measured
bearings in `SENSORS`. Positive bearing turns towards the player's right.

`CONE_HALF_ANGLE_DEG=15` is an assumed beam half-angle, not a measured bearing.
Changing it does not widen a real beam. `MAX_RANGE_M=4.50` is slant range from
the sensor, not the depth of the game. The nominal beam and 50 ms measurement
cycle are described in the [RCWL-1601 specifications](https://www.adafruit.com/product/4007).
Use supply/logic levels appropriate to the actual sensor and ESP32; RCWL-1601
and similar-looking HC-SR04 modules are not electrically interchangeable.

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
RMS residual over 10 cm, or any individual residual over 18 cm. A conflicting
third echo cannot be silently discarded to manufacture a two-range position.

For two ranges, intersect the two circles and require a unique point inside
both cones and the tracked area. This has no third-sensor consistency check.
With fewer than two ranges there is no new 2D fix. Geometry uncertainty uses
the largest-axis standard deviation of `sigma² * inverse(JᵀJ)`, with sigma at
least `ASSUMED_RANGE_NOISE_M`. Fixes above `MAX_POSITION_UNCERTAINTY_M` are
rejected. This is a local noise model, not an observed accuracy guarantee.

The previous three-reading average has been replaced by:

1. A range gate: a change over 16 cm must repeat within 10 cm on the next
   reading, or that frame is rejected. Invalid data clears range history.
2. Position confirmation: a move over 14 cm must be followed by another fix
   within 8 cm of that new position. An isolated jump leaves the marker still.
3. Time-based exponential smoothing: a 0.35 s time constant near stationary
   and 0.12 s for smaller ongoing movement. Confirmed large movement updates
   directly instead of being slowly dragged through intermediate holes.
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
| `POSITION_STATIONARY_TAU_S` | 0.35 | Raise for more stationary smoothing/lag |
| `POSITION_MOVING_TAU_S` | 0.12 | Smoothing during smaller movements |
| `POSITION_HOLD_MS` | 350 | Maximum visual hold; never a fresh hit |
| `HUBER_LIMIT_M` | 0.06 | Residual at which robust downweighting begins |
| `ASSUMED_RANGE_NOISE_M` | 0.025 | Range noise floor for geometry checks |
| `MAX_POSITION_UNCERTAINTY_M` | 0.20 | Maximum model uncertainty |
| `SENSOR_SCALE`, `SENSOR_OFFSET_M` | 1, 0 | Per-sensor distance calibration |

The dashboard shows accepted range arcs, rejected raw echoes, a hollow raw
position and a solid filtered position. A matched echo is labelled **Position
in cone**. Sensors cannot identify a person or locate a reflection within
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

Validated 2026-09-14 with ESP32 Arduino core 2.0.17 and Espressif32 7.0.1:
all three firmware builds; 196 geometric grid points; six target centres with
three sensors and every two-sensor combination; jitter, spike, sustained
movement, dropout and clock-wrap tests; held/stale/outside-zone scoring
suppression and MVP compatibility. In a seeded 600-frame stationary simulation
with 1.2 cm range noise, tracked RMS position error was 1.64 cm versus 2.69 cm
for the same solver without tracking; 16 injected spikes were rejected.
This simulation does not establish accuracy on the real sensor rig.

For browser QA, `python "ESP-32 Code/tests/preview_server.py"` serves a labelled
synthetic dashboard at http://127.0.0.1:8766/. Query modes `partial`, `held`,
`invalid`, `warning` and `offline` exercise alternative states. This server is
only a test fixture; the actual firmware never substitutes synthetic data.
