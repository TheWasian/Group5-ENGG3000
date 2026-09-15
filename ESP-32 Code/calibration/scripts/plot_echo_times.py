"""Plot live ultrasonic echo return times from an ESP32."""

from __future__ import annotations

import argparse
import configparser
import statistics
import sys
import time
from collections import deque
from pathlib import Path
from threading import Event, Thread

import matplotlib.pyplot as plt
from matplotlib.widgets import Button


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PLATFORMIO_CONFIG = PROJECT_ROOT / "platformio.ini"
WINDOW_SECONDS = 10.0
MIN_Y_AXIS_RANGE_US = 30.0
MIN_DEVIATION_Y_AXIS_RANGE_US = 2.0


def read_platformio_value(option: str, config_path: Path = PLATFORMIO_CONFIG) -> str:
    """Read an option from the first PlatformIO environment."""
    config = configparser.ConfigParser()
    config.read(config_path)

    for section in config.sections():
        if section.startswith("env:") and config.has_option(section, option):
            return config.get(section, option).strip()

    raise ValueError(f"No {option} found in {config_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", help="Override the serial port from platformio.ini")
    parser.add_argument("--baud", type=int, help="Override the baud rate from platformio.ini")
    args = parser.parse_args()

    try:
        port = args.port or read_platformio_value("port")
        baud_rate = args.baud or int(read_platformio_value("monitor_speed"))
    except ValueError as error:
        raise SystemExit(error) from error

    try:
        import serial
    except ImportError as error:
        raise SystemExit(
            "pyserial is required; install it with: python -m pip install pyserial"
        ) from error

    elapsed_times: deque[float] = deque()
    echo_times: deque[float] = deque()
    deviation_values: deque[float] = deque()
    figure, axes = plt.subplots(figsize=(9, 6))
    figure.subplots_adjust(bottom=0.16)
    line, = axes.plot([], [], "b.-", markersize=4)
    deviation_axes = axes.twinx()
    deviation_line, = deviation_axes.plot([], [], "g.-", markersize=4)
    axes.set_title("Live Ultrasonic Echo Return Time")
    axes.set_xlabel("Seconds ago")
    axes.set_ylabel("Echo return time (microseconds)")
    deviation_axes.set_ylabel("10-second standard deviation (microseconds)")
    deviation_axes.tick_params(axis="y", colors="green")
    deviation_axes.spines["right"].set_color("green")
    axes.grid(True, alpha=0.3)
    axes.invert_xaxis()

    freeze_axes = figure.add_axes((0.78, 0.03, 0.16, 0.06))
    freeze_button = Button(freeze_axes, "Freeze Y")
    y_axis_frozen = False

    def toggle_y_axis(event: object) -> None:
        nonlocal y_axis_frozen
        y_axis_frozen = not y_axis_frozen
        if y_axis_frozen:
            axes.set_autoscaley_on(False)
            freeze_button.label.set_text("Auto Y")
        else:
            axes.set_autoscaley_on(True)
            axes.relim()
            axes.autoscale_view(scalex=False, scaley=True)
            freeze_button.label.set_text("Freeze Y")
        figure.canvas.draw_idle()

    freeze_button.on_clicked(toggle_y_axis)

    stop_event = Event()

    def wait_for_enter() -> None:
        sys.stdin.readline()
        stop_event.set()

    try:
        with serial.Serial(port, baud_rate, timeout=0.1) as connection:
            print(f"Listening for echo times on {port} at {baud_rate} baud.")
            print("Press Enter in this terminal to stop capture.")
            Thread(target=wait_for_enter, daemon=True).start()
            time.sleep(2)
            connection.reset_input_buffer()
            connection.write(b"PULSE\n")
            start_time = time.monotonic()

            try:
                while not stop_event.is_set():
                    raw_line = connection.readline()
                    if not raw_line:
                        plt.pause(0.01)
                        continue

                    serial_line = raw_line.decode("ascii", errors="replace").strip()
                    print(f"Received: {serial_line}", flush=True)
                    try:
                        echo_time = float(serial_line)
                    except ValueError:
                        continue

                    if echo_time <= 0:
                        continue

                    elapsed_time = time.monotonic() - start_time
                    elapsed_times.append(elapsed_time)
                    echo_times.append(echo_time)
                    while elapsed_times and elapsed_times[0] < elapsed_time - WINDOW_SECONDS:
                        elapsed_times.popleft()
                        echo_times.popleft()
                        deviation_values.popleft()

                    deviation_values.append(
                        statistics.stdev(echo_times) if len(echo_times) > 1 else 0.0
                    )

                    line.set_data(
                        [elapsed_time - sample_time for sample_time in elapsed_times],
                        echo_times,
                    )
                    deviation_line.set_data(
                        [elapsed_time - sample_time for sample_time in elapsed_times],
                        deviation_values,
                    )
                    axes.relim()
                    if not y_axis_frozen:
                        axes.set_autoscaley_on(True)
                    axes.autoscale_view(scalex=True, scaley=not y_axis_frozen)
                    if not y_axis_frozen:
                        y_min, y_max = axes.get_ylim()
                        if y_max - y_min < MIN_Y_AXIS_RANGE_US:
                            y_midpoint = (y_min + y_max) / 2
                            half_range = MIN_Y_AXIS_RANGE_US / 2
                            axes.set_ylim(
                                y_midpoint - half_range,
                                y_midpoint + half_range,
                            )
                            axes.set_autoscaley_on(True)
                            deviation_axes.relim()
                            deviation_axes.set_autoscaley_on(True)
                            deviation_axes.autoscale_view(scalex=False, scaley=True)
                            deviation_min, deviation_max = deviation_axes.get_ylim()
                            if deviation_max - deviation_min < MIN_DEVIATION_Y_AXIS_RANGE_US:
                                deviation_midpoint = (deviation_min + deviation_max) / 2
                                deviation_half_range = MIN_DEVIATION_Y_AXIS_RANGE_US / 2
                                deviation_axes.set_ylim(
                                    deviation_midpoint - deviation_half_range,
                                    deviation_midpoint + deviation_half_range,
                                )
                    plt.pause(0.001)
            except KeyboardInterrupt:
                print("\nStopping echo-time capture.")
            finally:
                connection.write(b"STOP\n")

            print(f"Collected {len(echo_times)} valid echo times.")
    except serial.SerialException as error:
        raise SystemExit(f"Could not open or read serial port {port!r}: {error}") from error
    finally:
        plt.show()


if __name__ == "__main__":
    main()
