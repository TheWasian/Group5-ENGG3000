"""Measure ultrasonic echo-time stability at several inter-reading delays."""

from __future__ import annotations

import argparse
import configparser
import csv
import statistics
from pathlib import Path
from time import sleep
from typing import Callable


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PLATFORMIO_CONFIG = PROJECT_ROOT / "platformio.ini"
OUTPUT_DIR = PROJECT_ROOT / "output"
BURST_SETTLE_TIME_S = 1
ECHO_TIMEOUT_S = 0.03
MIN_Y_AXIS_RANGE_US = 200


def read_platformio_value(option: str, config_path: Path = PLATFORMIO_CONFIG) -> str:
    """Read an option from the first PlatformIO environment."""
    config = configparser.ConfigParser()
    config.read(config_path)

    for section in config.sections():
        if section.startswith("env:") and config.has_option(section, option):
            return config.get(section, option).strip()

    raise ValueError(f"No {option} found in {config_path}")


def prompt_positive_int(prompt: str, maximum: int) -> int:
    """Prompt for an integer within the firmware-supported range."""
    while True:
        try:
            value = int(input(prompt))
        except ValueError:
            value = 0
        if 1 <= value <= maximum:
            return value
        print(f"Enter a whole number from 1 to {maximum}.")


def prompt_delay_bounds() -> list[int]:
    """Prompt for delay bounds and increment, then generate test intervals."""
    while True:
        try:
            lower_bound = int(input("Lower delay bound (ms): "))
            upper_bound = int(input("Upper delay bound (ms): "))
            delay_step = int(input("Delay increment (ms): "))
        except ValueError:
            lower_bound = -1
            upper_bound = -1
            delay_step = 0
        if (
            0 <= lower_bound <= upper_bound <= 60000
            and 1 <= delay_step <= 60000
        ):
            delays = list(range(lower_bound, upper_bound + 1, delay_step))
            if delays[-1] != upper_bound:
                delays.append(upper_bound)
            return delays
        print(
            "Enter bounds from 0 to 60000 ms, with the lower bound no greater "
            "than the upper bound, and an increment greater than zero."
        )


def estimate_burst_duration(sample_count: int, delay_ms: int) -> float:
    """Estimate one burst duration using the ESP32 echo timeout and delay."""
    return sample_count * ECHO_TIMEOUT_S + max(0, sample_count - 1) * delay_ms / 1000


def format_duration(seconds: float) -> str:
    """Format seconds as a compact minutes-and-seconds duration."""
    total_seconds = max(0, round(seconds))
    minutes, seconds_remainder = divmod(total_seconds, 60)
    return f"{minutes:02d}:{seconds_remainder:02d}"


def request_room_test(
    connection: object,
    sample_count: int,
    delay_ms: int,
    progress_text: str,
) -> list[int]:
    """Request one room test burst and return raw echo durations in microseconds."""
    connection.reset_input_buffer()
    connection.write(f"ROOM_TEST {sample_count} {delay_ms}\n".encode("ascii"))
    durations: list[int] = []

    while True:
        raw_line = connection.readline()
        if not raw_line:
            raise TimeoutError(
                f"Timed out during the {delay_ms} ms room test interval"
            )

        line = raw_line.decode("utf-8", errors="replace").strip()
        print(f"\r\033[2KReceived: {line}")
        print(progress_text, end="", flush=True)
        if line == "ROOM_TEST_DONE":
            if len(durations) != sample_count:
                raise ValueError(
                    f"Received {len(durations)} readings; expected {sample_count}"
                )
            return durations
        if not line.startswith("ROOM_TEST,"):
            continue

        fields = line.split(",")
        if len(fields) != 4:
            continue
        try:
            durations.append(int(fields[3]))
        except ValueError:
            continue


def format_progress(completed: int, total: int, remaining_seconds: float) -> str:
    """Format room-test progress and its estimated remaining time."""
    percentage = completed / total * 100
    bar_width = 30
    filled_width = round(bar_width * completed / total)
    bar = "#" * filled_width + "-" * (bar_width - filled_width)
    return (
        f"Progress: [{bar}] {percentage:6.2f}% | "
        f"Estimated remaining: {format_duration(remaining_seconds)}"
    )


def print_progress(completed: int, total: int, remaining_seconds: float) -> str:
    """Redraw the progress bar in one terminal line."""
    progress_text = format_progress(completed, total, remaining_seconds)
    print(f"\r\033[2K{progress_text}", end="", flush=True)
    if completed == total:
        print()
    return progress_text


def print_above_progress(message: str, progress_text: str) -> None:
    """Print a status message above the fixed progress line."""
    print(f"\r\033[2K{message}")
    print(progress_text, end="", flush=True)


def save_results(results: dict[int, list[int]], output_path: Path) -> None:
    """Save every room test reading to CSV."""
    with output_path.open("w", newline="", encoding="utf-8") as output_file:
        writer = csv.writer(output_file)
        writer.writerow(["delay_ms", "sample_number", "echo_time_us", "timed_out"])
        for delay_ms, durations in results.items():
            for sample_number, duration in enumerate(durations, start=1):
                writer.writerow(
                    [delay_ms, sample_number, duration, duration == 0]
                )


def render_results(axes: object, results: dict[int, list[int]]) -> None:
    """Render room-test readings and summary statistics on existing axes."""
    axes.clear()
    try:
        import matplotlib.pyplot as plt  # noqa: F401
    except ImportError as error:
        raise SystemExit(
            "matplotlib is required; install it with: python -m pip install matplotlib"
        ) from error

    delays: list[int] = []
    means: list[float] = []
    deviations: list[float] = []
    valid_counts: list[int] = []

    for delay_ms, durations in sorted(results.items()):
        valid = [duration for duration in durations if duration > 0]
        if not valid:
            continue

        delays.append(delay_ms)
        means.append(statistics.mean(valid))
        deviations.append(statistics.stdev(valid) if len(valid) > 1 else 0.0)
        valid_counts.append(len(valid))
        axes.scatter([delay_ms] * len(valid), valid, alpha=0.45)

    if delays:
        axes.errorbar(
            delays,
            means,
            yerr=deviations,
            fmt="ko-",
            capsize=4,
            label="Mean +/- standard deviation",
        )

    axes.set_title("Room Echo Test: Echo-Time Stability")
    axes.set_xlabel("Delay between readings (ms)")
    axes.set_ylabel("First echo return time (microseconds)")
    axes.grid(True, alpha=0.3)
    if delays:
        axes.legend()
    y_min, y_max = axes.get_ylim()
    if y_max - y_min < MIN_Y_AXIS_RANGE_US:
        y_midpoint = (y_min + y_max) / 2
        half_range = MIN_Y_AXIS_RANGE_US / 2
        axes.set_ylim(y_midpoint - half_range, y_midpoint + half_range)
    axes.figure.subplots_adjust(left=0.1, right=0.96, top=0.93, bottom=0.2)


def render_standard_deviation(axes: object, results: dict[int, list[int]]) -> None:
    """Render standard deviation of echo times for each delay."""
    axes.clear()
    delays: list[int] = []
    deviations: list[float] = []

    for delay_ms, durations in sorted(results.items()):
        valid = [duration for duration in durations if duration > 0]
        if not valid:
            continue

        delays.append(delay_ms)
        deviations.append(statistics.stdev(valid) if len(valid) > 1 else 0.0)

    if delays:
        axes.plot(delays, deviations, "go-")

    axes.set_title("Room Echo Test: Standard Deviation")
    axes.set_xlabel("Delay between readings (ms)")
    axes.set_ylabel("Standard deviation (microseconds)")
    axes.grid(True, alpha=0.3)
    axes.figure.subplots_adjust(left=0.1, right=0.96, top=0.93, bottom=0.12)


def plot_results(
    results: dict[int, list[int]],
    output_path: Path,
    rerun: Callable[[], dict[int, list[int]]] | None = None,
) -> None:
    """Plot room-test readings and optionally provide a rerun button."""
    try:
        import matplotlib.pyplot as plt
        from matplotlib.widgets import Button
    except ImportError as error:
        raise SystemExit(
            "matplotlib is required; install it with: python -m pip install matplotlib"
        ) from error

    figure, axes = plt.subplots(figsize=(10, 6))
    figure.subplots_adjust(bottom=0.16 if rerun is not None else 0.1)
    render_results(axes, results)
    deviation_figure, deviation_axes = plt.subplots(figsize=(10, 6))
    render_standard_deviation(deviation_axes, results)

    if rerun is not None:
        button_axes = figure.add_axes((0.78, 0.03, 0.16, 0.06))
        rerun_button = Button(button_axes, "Run Again")

        def run_again(event: object) -> None:
            rerun_button.label.set_text("Running...")
            figure.canvas.draw_idle()
            updated_results = rerun()
            results.clear()
            results.update(updated_results)
            render_results(axes, results)
            render_standard_deviation(deviation_axes, results)
            figure.savefig(output_path, dpi=150)
            deviation_figure.savefig(
                output_path.with_name(f"{output_path.stem}_standard_deviation.png"),
                dpi=150,
            )
            rerun_button.label.set_text("Run Again")
            figure.canvas.draw_idle()

        rerun_button.on_clicked(run_again)

    figure.savefig(output_path, dpi=150)
    deviation_output_path = output_path.with_name(
        f"{output_path.stem}_standard_deviation.png"
    )
    deviation_figure.savefig(deviation_output_path, dpi=150)
    print(f"Saved room echo graph to {output_path}")
    print(f"Saved standard deviation graph to {deviation_output_path}")
    plt.show()


def run_room_sweep(
    connection: object, sample_count: int, delays: list[int]
) -> dict[int, list[int]]:
    """Run the configured room-test sweep on an open serial connection."""
    results: dict[int, list[int]] = {}
    burst_estimates = [
        estimate_burst_duration(sample_count, delay_ms) for delay_ms in delays
    ]
    total_estimate = sum(burst_estimates) + BURST_SETTLE_TIME_S * (len(delays) - 1)
    print(f"Estimated total test time: {format_duration(total_estimate)}")
    progress_text = print_progress(0, len(delays), total_estimate)

    for burst_number, delay_ms in enumerate(delays):
        if burst_number > 0:
            print_above_progress(
                f"Waiting {BURST_SETTLE_TIME_S:g} seconds before the next burst...",
                progress_text,
            )
            sleep(BURST_SETTLE_TIME_S)
        print_above_progress(
            f"Running {sample_count} readings with {delay_ms} ms between readings...",
            progress_text,
        )
        results[delay_ms] = request_room_test(
            connection, sample_count, delay_ms, progress_text
        )
        remaining_estimate = sum(burst_estimates[burst_number + 1:])
        remaining_estimate += BURST_SETTLE_TIME_S * (
            len(delays) - burst_number - 2
        )
        progress_text = print_progress(
            burst_number + 1, len(delays), remaining_estimate
        )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", help="Override the serial port from platformio.ini")
    parser.add_argument("--baud", type=int, help="Override the baud rate from platformio.ini")
    parser.add_argument(
        "--csv",
        type=Path,
        default=OUTPUT_DIR / "room_echo_test.csv",
        help="Path for raw room test readings",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_DIR / "room_echo_test.png",
        help="Path for the room echo graph",
    )
    args = parser.parse_args()

    try:
        port = args.port or read_platformio_value("port")
        baud_rate = args.baud or int(read_platformio_value("monitor_speed"))
    except ValueError as error:
        raise SystemExit(error) from error

    sample_count = prompt_positive_int("Readings per burst: ", 100)
    delays = prompt_delay_bounds()
    serial_timeout = max(5.0, max(delays) / 1000 + 5)

    try:
        import serial
    except ImportError as error:
        raise SystemExit(
            "pyserial is required; install it with: python -m pip install pyserial"
        ) from error

    try:
        with serial.Serial(port, baud_rate, timeout=serial_timeout) as connection:
            print(f"Connected to {port} at {baud_rate} baud.")
            sleep(2)
            results = run_room_sweep(connection, sample_count, delays)
            args.csv.parent.mkdir(parents=True, exist_ok=True)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            save_results(results, args.csv)
            print(f"Saved raw room test readings to {args.csv}")

            def rerun() -> dict[int, list[int]]:
                updated_results = run_room_sweep(connection, sample_count, delays)
                save_results(updated_results, args.csv)
                print(f"Saved raw room test readings to {args.csv}")
                return updated_results

            plot_results(results, args.output, rerun)
    except serial.SerialException as error:
        raise SystemExit(f"Could not open or read serial port {port!r}: {error}") from error
    except (KeyboardInterrupt, EOFError):
        print("\nRoom echo test cancelled.")
        return
    except (TimeoutError, ValueError) as error:
        raise SystemExit(error) from error

if __name__ == "__main__":
    main()
