# Wacker5 three-sensor data logger

This calibration firmware runs on the **centre ESP32**. It creates Wacker5,
measures its own sensor, requests Node 1 and Node 2 in turn, and sends all three
readings to a computer over **one USB serial connection**. It gathers data even
when position solving fails; the solver is disabled by default. It does not run
the game or the cone-page hole calibration.

## Upload and connections

| Board | Firmware | Address |
|---|---|---|
| Centre/master | This folder's `src/main.cpp` | 192.168.4.1 |
| Left / Node 1 | Existing `../Sensor_Node_1/Sensor_Node_1.ino` | 192.168.4.101 |
| Right / Node 2 | Existing `../Sensor_Node_2/Sensor_Node_2.ino` | 192.168.4.102 |

- SSID: **Wacker5**. Password: **PasswordWacker123456!**.
- Current sensor wiring on all boards: trigger **GPIO 10**, echo **GPIO 3**.
- Nodes already running those protocol-v2 sketches need no update. Power them;
  they join Wacker5 automatically. Their USB serial ports are not used for capture.
- Upload this calibration project to the **centre board only**. Run only one
  Wacker5 access point. Re-upload the game AP firmware later to return to the game.
- Use suitable sensor supply/echo logic levels for the ESP32 and your sensor.
- LCD, battery display and button support remains. The button measures only in idle
  mode so it cannot interfere with a capture. Buzzer remains disabled.
- Optional RGB output is disabled by default. Verify its GPIO assignments for your
  ESP32-S3/wiring before enabling `RGB_ENABLED`.

From this folder:

```powershell
pio run
pio run --target upload --upload-port COM4
python -m pip install -r requirements.txt
```

Replace COM4 with the centre board's actual port. Python accepts the port as its
first argument, otherwise reads the example `port = COM3` in platformio.ini.
Close Arduino/PlatformIO Serial Monitor before capture. Baud rate is **115200**.
The script waits up to 15 seconds for the logger handshake, including its existing
LCD/battery splash delay. The master provides a basic status page at 192.168.4.1;
the computer does not need to join Wacker5 when collecting over USB.

## Capture all three sensors

Continuous live graph and CSV:

```powershell
python scripts/multi_capture.py COM4
```

Three coloured lines show **raw ranges in centimetres**, with failed readings as
gaps and current statuses in the title. The graph retains the last 10 seconds;
the CSV retains every cycle. Press Enter, close the live graph or press Ctrl+C
to stop. Final live-mode statistics and PNG cover only the final 10-second window.

Finite capture, without a graph:

```powershell
python scripts/multi_capture.py COM4 --mode burst --samples 50 --no-plot
```

Compare different quiet intervals:

```powershell
python scripts/multi_capture.py COM4 --mode sweep --samples 50 --sweep 60 100 150 200
```

The sweep plots each sensor's mean with sample standard deviation, and the valid
reading percentage. Missing readings are counted, not discarded from the CSV.

Gather labelled test positions with independent reference distances:

```powershell
python scripts/multi_capture.py COM4 --mode calibrate --samples 30
```

Enter a position label, then the measured distance from **each sensor's metal faces
to the target**. Those three actual distances usually differ; do not give all
sensors the same screen distance. Leave unknown references blank. A blank position
label ends collection. The graphs compare each channel to its own references.
No correction equation is automatically fitted or applied by this multi mode.

Outputs use new timestamped names under `output/multi_*`. `--csv PATH` and
`--output PATH` select files; existing CSVs are never overwritten. Rows are flushed
after each cycle, preserving completed measurements on interruption. `--no-plot`
works in every mode. Use `--baud` to override baud rate.

## Existing script menus

Select **multi** in these scripts to use the shared new three-sensor collector:

- `plot_echo_times.py`: continuous three-range graph and CSV.
- `room_echo_test.py`: sweep quiet time for all three sensors.
- `calibrate_ultrasonic.py`: labelled samples with separate true distances.

Their single-sensor paths remain available. The legacy single-sensor calibration
still fits its earlier exponential equation; this is not applied to multi capture.
Multi menu runs use timestamped output filenames; use `multi_capture.py` for
explicit multi output paths. `serial_receiver.py` is a passive serial monitor
which recognises the new structured DATA records.

## Timing settings

Default ordering:

```text
Centre -> 100 ms quiet -> Node 1 -> 100 ms quiet -> Node 2
       -> 100 ms quiet + optional cycle pause -> next Centre
```

All three are gathered in a cycle; their ultrasonic bursts are sequential.
Echo durations, network handshakes and timeouts add to the time shown above.

- `--quiet-ms 100`: quiet after every measurement/reply/timeout, including between
  cycles. Allowed 60–60000 ms, respecting the existing node firmware's timing.
- `--frame-pause-ms 0`: additional pause after each complete cycle, 0–60000 ms.
- Sweep values change **quiet time**, not the extra cycle pause.
- Starting a run waits for quiet time. STOP also guards against a previously sent
  FIRE packet completing late. Late, duplicate and unrelated replies cannot keep
  a measurement slot alive indefinitely.

Example:

```powershell
python scripts/multi_capture.py COM4 --quiet-ms 100 --frame-pause-ms 500
```

These settings affect calibration only; the game firmware is unchanged.

## Recorded fields

Every CSV cycle contains host UTC receipt time, label, boot/session ID, frame ID,
cycle start/end times, both timing settings, three raw range columns, three status
columns, AP-clock measurement/reply times, local echo duration, optional position
fields and separate optional true/reference distances.

- `left_cm`, `master_cm`, `right_cm` are uncorrected distances.
- Remote samples are rounded millimetre ranges from the existing node protocol.
- `master_echo_us` is an actual local pulse duration; zero means timeout.
  Remote raw echo durations are **not available** and are never fabricated.
- `left_received_ms` and `right_received_ms` are the AP's packet receive times,
  not exact synchronized node measurement times. `master_measured_ms` is the local
  measurement completion time.
- Clock values wrap as uint32; boot IDs identify restarts. Python aborts and keeps
  the partial CSV if the master restarts or no fresh frames arrive.
- Missing ranges become blank cells, never zero distance. Numeric out-of-range
  readings remain recorded with their status but are excluded from statistics.
- Mean and sample SD use only valid readings. SD is unavailable with fewer than two
  valid samples. Position failure never prevents logging.

| Status | Meaning |
|---|---|
| ok | Valid range |
| no_echo | Centre sensor echo timeout |
| invalid_echo | Remote node replied but had no usable echo/range |
| out_of_range | Numeric range outside permitted bounds |
| no_ready | No ARM acknowledgement; may be disconnection or packet loss |
| no_reply | FIRE sent but no matching range reply arrived |

## Serial commands

Commands end in newline; startup mode is idle.

| Command | Purpose |
|---|---|
| HELLO | Returns LOGGER_READY,2,Wacker5,boot_id,network_ready |
| CONFIG_TIMING 100 | Quiet interval after each sensor |
| MULTI_STREAM 0 | Continuous capture with 0 ms extra cycle pause |
| MULTI_TEST 20 500 | 20 cycles, 500 ms extra pause; MULTI_CALIBRATE is an alias |
| STOP | Stop capture; returns MODE:IDLE |
| POSITION ON / POSITION OFF | Enable/disable optional solver while idle |
| CALIBRATE, then a positive count | Legacy single-sensor distances |
| PULSE | Legacy single-sensor raw echo-time stream |
| ROOM_TEST 20 100 | Legacy single-sensor echo-time test |

Multi starts with MULTI_TEST_READY, emits versioned records, and finite runs end
with MULTI_DONE,boot,frame. Other start/configuration commands are rejected during
capture; send STOP first.

```text
DATA,2,boot,frame,start_ms,end_ms,quiet_ms,pause_ms,left_cm,master_cm,right_cm,left_status,master_status,right_status,left_received_ms,master_measured_ms,right_received_ms,master_echo_us,POS,valid,x_m,y_m,rms_m,count,reason
```

Unavailable ranges are `nan` on serial and blank in CSV.

Optional solver configuration uses the existing CONFIG_SENSOR, CONFIG_AREA and
CONFIG_SOLVER commands. **CONFIG_SENSOR IDs: 0=left, 1=centre, 2=right**; these are
array indices, distinct from wireless node IDs. Default solver geometry is still
the older 35 cm spacing; configure it for your actual setup before enabling.
Scale/offset affect the optional solver only; raw CSV data remains uncorrected.
Python capture deliberately selects POSITION OFF.

Shared protocol and solver headers are read from ../Access_Point without edits.

## Verification

```powershell
python -m unittest discover -s test -p "test_*.py" -v
pio run
```

Tests cover all three channels, failed measurements, CSV preservation, statistics,
duplicate/old frames, completion, restarts, timing and sequence wrap. The optional
`test/prepare_arduino_build.py` helper prepares an Arduino CLI compile check with
Adafruit display dependencies and generated files inside `.verify/`.

Software tests do not replace a connected-board capture. If no LOGGER_READY appears,
check the centre firmware and port. If remote statuses remain no_ready, check that
the nodes use their respective existing sketches and can join the sole Wacker5 AP.
