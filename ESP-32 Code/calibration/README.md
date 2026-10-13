# ESP32 Ultrasonic Calibration

This project measures distance with an ultrasonic sensor connected to an ESP32, collects calibration data over USB serial, and generates graphs and a correction equation for production use.

The firmware measures the time taken for the ultrasonic echo and converts it to centimetres. The Python calibration tool compares those measurements with known real distances and fits the inverse relationship:

```text
real_distance_cm = coefficient * exp(exponent * measured_distance_cm)
```

Use the fitted equation to correct future sensor readings. The coefficients are specific to the sensor, its installation, and the measurement environment, so recalibrate if any of those change.

## Project Layout

- `platformio.ini` - PlatformIO board, serial port, and baud-rate configuration.
- `src/main.cpp` - ESP32 firmware for the ultrasonic sensor.
- `scripts/calibrate_ultrasonic.py` - Interactive data collection, graphing, and exponential fitting.
- `scripts/room_echo_test.py` - Compare echo-time stability at different reading intervals.
- `scripts/serial_receiver.py` - Simple serial monitor that prints received measurements.
- `requirements.txt` - Python packages used by the scripts.
- `output/` - Generated CSV data, graphs, and the production equation.

## Hardware

The firmware uses these ESP32 pins:

| Signal | ESP32 pin |
| --- | ---: |
| Ultrasonic trigger | GPIO 10 |
| Ultrasonic echo | GPIO 3 |
| RGB LED red | GPIO 25 |
| RGB LED green | GPIO 15 |
| RGB LED blue | GPIO 16 |
| Buzzer | GPIO 17 |
| LCD MOSI | GPIO 8 |
| LCD SCLK | GPIO 9 |
| LCD DC | GPIO 14 |
| LCD reset | GPIO 21 |
| LCD CS | Not connected |
| LCD MISO | Not connected |
| LCD button | GPIO 40 |
| Ground | GND |

Connect the sensor's power according to its datasheet. ESP32 GPIO pins are not 5 V tolerant. If the ultrasonic module outputs a 5 V echo signal, use an appropriate voltage divider or level shifter before connecting it to GPIO 27.

## Software Setup

1. Install [VS Code](https://code.visualstudio.com/), the PlatformIO extension, and Python 3.
2. Open this project folder in VS Code:

   ```text
   ESP-32 Code/calibration
   ```

3. Create and activate a Python virtual environment. In PowerShell:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   - `scripts/plot_echo_times.py` - Live graph of raw echo return times.

4. Connect the ESP32 and identify its serial port.
5. Update `port` in `platformio.ini` if the port is not `COM3`:

   ```ini
   port = COM3
   ```

## Build and Upload the Firmware

   After uploading, the ESP32 starts in calibration mode and waits for a serial command.

```powershell
platformio run
platformio run --target upload
```
   The ESP32 supports these serial modes:

   - `CALIBRATE` - Select calibration mode. A following positive integer requests that many comma-separated distance readings in centimetres.
   - `PULSE` - Select live pulse-time mode. The ESP32 continuously returns one echo duration per line in microseconds.
   - `ROOM_TEST <readings> <delay_ms>` - Collect a finite burst of raw echo durations with the specified delay between readings.
   - `STOP` - Stop pulse-time streaming and enter idle mode.
      - `MULTI_CALIBRATE <readings> <delay_ms>` - The serial-connected ESP32 acts as the master, polls node 1 and node 2 over Wi-Fi, and prints three ranges followed by a trilaterated position for each frame.
      - `MULTI_TEST <readings> <delay_ms>` - Alias for the multi-sensor test command.
      - `CONFIG_SENSOR <id> <x_m> <y_m> <bearing_deg> <half_angle_deg> <max_range_m> <scale> <offset_m>` - Set sensor geometry and calibration correction for IDs 0 (master), 1 (left node), and 2 (right node).
      - `CONFIG_SOLVER <max_rms_m> <max_residual_m> <huber_limit_m> <range_noise_m> <max_uncertainty_m>` - Set trilateration acceptance constants.
      - `CONFIG_AREA <width_m> <start_y_m> <depth_m>` - Set the area accepted by the trilateration solver.

   The firmware starts in `IDLE` mode. Send `CALIBRATE` before using the legacy single-sensor request format.

The firmware is configured for an `esp32-s3-devkitc-1` board at `115200` baud. After uploading, the ESP32 waits for a sample-count request over serial.

### Multi-sensor calibration

Flash the existing `Sensor_Node_1/Sensor_Node_1.ino` and
`Sensor_Node_2/Sensor_Node_2.ino` sketches to the two remote boards. They join
the master's `Wacker5` access point at `192.168.4.1`; node 1 uses
`192.168.4.101` and node 2 uses `192.168.4.102`. The master keeps the serial
connection and performs the trilateration, so only its USB serial output needs
to be captured.

Example setup and run:

```text
CONFIG_SENSOR 0 0.40 0.30 19.29 15 4.5 1.0 0.0
CONFIG_SENSOR 1 0.75 0.30 0.0 15 4.5 1.0 0.0
CONFIG_SENSOR 2 1.10 0.30 -19.29 15 4.5 1.0 0.0
CONFIG_AREA 1.5 0.0 3.0
CONFIG_SOLVER 0.10 0.18 0.06 0.025 0.20
MULTI_CALIBRATE 20 100
```

Each result is emitted as `MULTI,sequence,left_cm,master_cm,right_cm,POS,x_m,y_m,rms_m,count,reason`.
At least two valid, geometrically consistent ranges are required for a position;
three ranges are preferred. The scale and offset values are applied in metres
before solving, allowing each sensor to use its own calibration constants.

## Serial Protocol

Send a positive integer followed by a newline. The ESP32 returns that many comma-separated distance readings in centimetres.

For example:

```text
Request: 5
Response: 37.39,37.42,37.39,37.35,37.42
```

The firmware accepts sample counts from 1 to 100. A timeout from the ultrasonic sensor is returned as `-1.00`.

To view readings manually, stop any other program using the serial port and run:

```powershell
python scripts\serial_receiver.py
```

You can override the configured port and baud rate:

```powershell
python scripts\serial_receiver.py COM4 --baud 115200
```

## Live Echo-Time Graph

Run the live graph after stopping any other program using the serial port:

```powershell
python scripts\plot_echo_times.py
```

The graph runs continuously and displays only the latest 10 seconds of echo-time data. Each received serial line is printed in the terminal. Press Enter in that terminal to stop capture and send `STOP` to the ESP32. The port and baud rate can be overridden:

```powershell
python scripts\plot_echo_times.py COM4 --baud 115200
```

The script asks whether to use single-sensor or multi-sensor mode. In
multi-sensor mode it confirms the node firmware, wiring, Wi-Fi addresses, and
master USB connection before starting. The live graph displays the master
sensor range in centimetres in that mode.

## Room Echo Test

The room test compares the stability of the first returned echo when the sensor is stationary and no object is moving in range. Stop any other program using the serial port, then run:

```powershell
python scripts\room_echo_test.py
```

The room test also asks for the sensor mode and confirms the multi-sensor setup
when selected. Multi-sensor runs use the master range from each `MULTI` record;
single-sensor runs continue to measure raw echo time in microseconds.

The script asks for the number of readings in each burst, then asks for a lower delay bound, upper delay bound, and delay increment in milliseconds. It automatically tests the requested increment between those bounds and also tests the upper bound if it is not an exact step. It estimates the total and remaining test time from these inputs, the ESP32 timeout, and the 500 ms settling pause. It prints the received serial records and creates:

- `output/room_echo_test.csv` - Raw echo durations, including timeout readings (`0` microseconds).
- `output/room_echo_test.png` - Individual valid first-return times with mean and standard deviation for each delay.
- `output/room_echo_test_standard_deviation.png` - Standard deviation of valid first-return times for each delay.

The port, baud rate, and output paths can be overridden with `COM4`, `--baud`, `--csv`, and `--output`. This test is a first-echo stability proxy: `pulseIn()` returns the first rising echo and does not measure later reverberation directly. Larger variation or more timeouts can indicate a less stable acoustic environment, but they are not a direct reverberation-time measurement.

## Collect Calibration Data

1. Upload the firmware.
2. Stop the PlatformIO serial monitor before starting the calibration script. Only one program can normally use the COM port at a time.
3. Place the sensor at several known distances. Use at least two distances, preferably many points covering the complete operating range.
4. Run:

   ```powershell
   python scripts\calibrate_ultrasonic.py
   ```

5. Enter the number of samples per distance.
6. Select single-sensor or multi-sensor mode and confirm the multi-sensor connection checklist if applicable.
7. For each test position, enter the real distance in centimetres. Press Enter on an empty prompt when all distances have been collected.
8. Keep the sensor and target aligned and stationary during each burst. Repeat calibration if readings contain many `-1` timeout values.

In multi-sensor mode, the master polls the left, master, and right sensors in
sequence and requests a one-second interval between records. The CSV stores
the three measured ranges in separate columns, and the calibration graphs
draw each sensor's data as a separate line.

The port and baud rate can be overridden on the command line:

```powershell
python scripts\calibrate_ultrasonic.py COM4 --baud 115200
```

## Generated Output

By default, the calibration run creates:

- `output/ultrasonic_calibration.csv` - Every raw reading with its real distance and sample number. Multi-sensor runs also include separate left, master, and right distance columns.
- `output/ultrasonic_calibration.png` - Measured distance versus real distance, with the ideal reference line.
- `output/ultrasonic_standard_deviation.png` - Average absolute measurement deviation at each real distance.
- `output/ultrasonic_calibration_equation.txt` - The fitted coefficient, exponent, and $R^2$ value for production use.

Output paths can be changed with `--output`, `--csv`, `--standard-deviation-output`, and `--calibration-output`.

The fit ignores non-positive measurements, including timeout readings. It requires at least two positive samples with different measured distances. A high $R^2$ indicates that the exponential model explains the collected calibration data well; it does not guarantee accuracy outside the distances tested.

## Production Correction

Open `output/ultrasonic_calibration_equation.txt` after calibration. Implement the reported equation in the production firmware or application:

```cpp
float correctedDistanceCm = coefficient * exp(exponent * measuredDistanceCm);
```

Use the exact coefficient and exponent generated for the installed sensor. Reject or separately handle invalid readings such as `-1.0` before applying the equation.

## Troubleshooting

- **Port cannot be opened:** close PlatformIO Monitor and any serial terminal, then confirm the port in `platformio.ini`.
- **No valid readings:** check trigger/echo wiring, sensor power, ground connection, target alignment, and echo-level shifting.
- **Python import error:** activate `.venv` and run `python -m pip install -r requirements.txt`.
- **Calibration fit fails:** collect more than one positive measurement and ensure the measured values are not all identical.
