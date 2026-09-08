# ESP32 three-sensor player tracker

This project uses three ESP32 boxes with one RCWL-1601 ultrasonic sensor in
each box. The centre ESP32 creates the Wi-Fi network, schedules all three sensors,
calculates the player's 2D position, and provides the result to the game PC.

## Sketches

- `Access_Point/Access_Point.ino` - centre ESP32 and position controller
- `Sensor_Node_1/Sensor_Node_1.ino` - left ESP32 (`192.168.4.101`)
- `Sensor_Node_2/Sensor_Node_2.ino` - right ESP32 (`192.168.4.102`)

Only the standard ESP32 Arduino core libraries are used (`WiFi`, `WiFiUDP`, and
`WebServer`). No third-party Arduino libraries are required.

## Before uploading

At the top of each sketch, replace the two `-1` ultrasonic pin placeholders:

```cpp
constexpr int TRIG_PIN = -1;
constexpr int ECHO_PIN = -1;
```

On the access point, also set `BUZZER_PIN` and `WARNING_LED_PIN`, or leave either
at `-1` if that output is not fitted yet. The ultrasonic pins are mandatory;
each ESP32 deliberately stops at startup until both are set to different GPIOs.

Power each RCWL-1601 from 3.3 V and common ground so its Echo signal is safe for
the ESP32's 3.3 V GPIO. Confirm your exact board markings before wiring.

## Upload and test

1. Upload the access-point sketch to the centre ESP32.
2. Upload node 1 to the left ESP32 and node 2 to the right ESP32.
3. Power the access point first, followed by both nodes.
4. Connect the PC to Wi-Fi `Wacker5` using password
   `PasswordWacker123456!`.
5. Open `http://192.168.4.1/` for the live diagnostic dashboard.
6. Launch `GameLauncher.bat`, or open `UI-Code/index.html` after connecting.
   The UI polls `http://192.168.4.1/api/hits` and starts scoring when the
   access point reports movement into one of the six game cells.

The access point provides two browser endpoints:

- `/api/hits` uses the same event contract as `MVP.ino`, with extra position,
  three-range, and node-health fields for the full three-ESP32 system.
- `/api/position` provides the original raw position, warning, individual
  ranges, node status, and fit-quality response for calibration.

Both endpoints support cross-origin requests, so the UI can be opened as a
local file while the computer is connected to the `Wacker5` access point.

The access point also prints CSV records at 115200 baud:

```text
POS,x_metres,y_metres,warning,rms_error_metres,sensors_used
```

## Coordinate calibration

The solver assumes the screen edge is `y = 0`, positive `y` points into the
3 m-deep playing area, and `x` runs from left to right. Update
`SENSOR_POSITIONS` in the access-point sketch with the measured centre of each
transducer. Its order is:

1. node 1 sensor (left, default `x = 0.0 m`)
2. access-point sensor (centre, default `x = 1.5 m`)
3. node 2 sensor (right, default `x = 3.0 m`)

Record measured-versus-known distances for each sensor, then adjust
`SENSOR_SCALE` and `SENSOR_OFFSET_M`. Positioning needs all three ranges to be
valid. The reported `rms_error_m` is useful for deciding whether a calibration
or sensor aim needs improvement.

For good geometry, aim the three sensors so their useful cones overlap through
the playing area. A perfectly straight row can estimate position, but a small
known difference in sensor depth or angle generally improves robustness. Mount
and test the boxes outside the marked 3 m x 3 m playing area.

## Safety warning

The alarm becomes active when the calculated distance from the screen is at or
below 0.50 m. It also activates conservatively if any fresh direct range is at
or below 0.50 m. Use a transistor/driver for a buzzer that needs more current
than an ESP32 GPIO can safely supply.
