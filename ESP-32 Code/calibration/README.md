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
| Ultrasonic trigger | GPIO 26 |
| Ultrasonic echo | GPIO 27 |
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

   The firmware starts in `CALIBRATE` mode for compatibility. The calibration script selects this mode automatically before each request.

The firmware is configured for an `esp32dev` board at `115200` baud. After uploading, the ESP32 waits for a sample-count request over serial.

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

## Room Echo Test

The room test compares the stability of the first returned echo when the sensor is stationary and no object is moving in range. Stop any other program using the serial port, then run:

```powershell
python scripts\room_echo_test.py
```

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
6. For each test position, enter the real distance in centimetres. Press Enter on an empty prompt when all distances have been collected.
7. Keep the sensor and target aligned and stationary during each burst. Repeat calibration if readings contain many `-1` timeout values.

The port and baud rate can be overridden on the command line:

```powershell
python scripts\calibrate_ultrasonic.py COM4 --baud 115200
```

## Generated Output

By default, the calibration run creates:

- `output/ultrasonic_calibration.csv` - Every raw reading with its real distance and sample number.
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
