# ESP32 six-sensor player tracker

This project uses three ESP32 boxes with two RCWL-1601 ultrasonic sensors in
each box. The centre ESP32 creates the Wi-Fi network, schedules all six sensors,
calculates the player's 2D position, and provides the result to the game PC.

## Sketches

- `Access_Point/Access_Point.ino` - centre ESP32 and position controller
- `Sensor_Node_1/Sensor_Node_1.ino` - left ESP32 (`192.168.4.101`)
- `Sensor_Node_2/Sensor_Node_2.ino` - right ESP32 (`192.168.4.102`)

Only the standard ESP32 Arduino core libraries are used (`WiFi`, `WiFiUDP`, and
`WebServer`). No third-party Arduino libraries are required.

## Before uploading

At the top of each sketch, replace the four `-1` ultrasonic pin placeholders:

```cpp
constexpr int TRIG_PIN_1 = -1;
constexpr int ECHO_PIN_1 = -1;
constexpr int TRIG_PIN_2 = -1;
constexpr int ECHO_PIN_2 = -1;
```

On the access point, also set `BUZZER_PIN` and `WARNING_LED_PIN`, or leave either
at `-1` if that output is not fitted yet. The ultrasonic pins are mandatory;
each ESP32 deliberately stops at startup until all four are set.

Power each RCWL-1601 from 3.3 V and common ground so its Echo signal is safe for
the ESP32's 3.3 V GPIO. Confirm your exact board markings before wiring.

## Upload and test

1. Upload the access-point sketch to the centre ESP32.
2. Upload node 1 to the left ESP32 and node 2 to the right ESP32.
3. Power the access point first, followed by both nodes.
4. Connect the PC to Wi-Fi `Wacker5` using password
   `PasswordWacker123456!`.
5. Open `http://192.168.4.1/` for the live diagnostic dashboard.
6. The game can fetch `http://192.168.4.1/api/position` about 10 times per
   second. The response contains `x_m`, `y_m`, `warning`, individual ranges,
   node status, and fit quality.

The access point also prints CSV records at 115200 baud:

```text
POS,x_metres,y_metres,warning,rms_error_metres,sensors_used
```

## Coordinate calibration

The solver assumes the screen edge is `y = 0`, positive `y` points into the
3 m-deep playing area, and `x` runs from left to right. Update
`SENSOR_POSITIONS` in the access-point sketch with the measured centre of each
transducer. Its order is:

1. node 1 sensor 1
2. node 1 sensor 2
3. access-point sensor 1
4. access-point sensor 2
5. node 2 sensor 1
6. node 2 sensor 2

Record measured-versus-known distances for each sensor, then adjust
`SENSOR_SCALE` and `SENSOR_OFFSET_M`. Positioning needs at least three valid
ranges. The reported `rms_error_m` is useful for deciding whether a calibration
or sensor aim needs improvement.

For good geometry, aim the six sensors so their useful cones overlap through
the playing area. A perfectly straight row can estimate position, but a small
known difference in sensor depth or angle generally improves robustness. Mount
and test the boxes outside the marked 3 m x 3 m playing area.

## Safety warning

The alarm becomes active when the calculated distance from the screen is at or
below 0.50 m. It also activates conservatively if any fresh direct range is at
or below 0.50 m. Use a transistor/driver for a buzzer that needs more current
than an ESP32 GPIO can safely supply.
