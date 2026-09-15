"""Collect ultrasonic calibration data from an ESP32 and plot the results."""

from __future__ import annotations

import argparse
import configparser
import csv
import statistics
from pathlib import Path
from time import sleep


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PLATFORMIO_CONFIG = PROJECT_ROOT / "platformio.ini"
OUTPUT_DIR = PROJECT_ROOT / "output"


def read_platformio_value(option: str, config_path: Path = PLATFORMIO_CONFIG) -> str:
    """Read an option from the first PlatformIO environment."""
    config = configparser.ConfigParser()
    config.read(config_path)

    for section in config.sections():
        if section.startswith("env:") and config.has_option(section, option):
            return config.get(section, option).strip()

    raise ValueError(f"No {option} found in {config_path}")


def parse_measurements(line: str) -> list[float]:
    """Parse one ESP32 response line into distance measurements in centimetres."""
    values = [value.strip() for value in line.strip().split(",") if value.strip()]
    if not values:
        raise ValueError("The response did not contain any measurements")
    return [float(value) for value in values]


def request_measurements(connection: object, sample_count: int) -> list[float]:
    """Request and read one burst of measurements from the ESP32."""
    connection.reset_input_buffer()
    connection.write(f"{sample_count}\n".encode("ascii"))

    while True:
        raw_line = connection.readline()
        if not raw_line:
            raise TimeoutError("Timed out waiting for the ESP32 response")

        line = raw_line.decode("utf-8", errors="replace").strip()
        try:
            measurements = parse_measurements(line)
        except ValueError:
            print(f"Ignoring invalid serial data: {line!r}")
            continue

        if len(measurements) != sample_count:
            print(
                f"Ignoring response with {len(measurements)} samples; "
                f"expected {sample_count}."
            )
            continue
        return measurements


def prompt_positive_float(prompt: str) -> float:
    """Prompt until the user enters a positive floating-point value."""
    while True:
        try:
            value = float(input(prompt))
        except ValueError:
            print("Enter a number greater than zero.")
            continue
        if value > 0:
            return value
        print("Enter a number greater than zero.")


def prompt_positive_int(prompt: str) -> int:
    """Prompt until the user enters a positive integer."""
    while True:
        try:
            value = int(input(prompt))
        except ValueError:
            print("Enter a whole number greater than zero.")
            continue
        if value > 0:
            return value
        print("Enter a whole number greater than zero.")


def collect_distances(connection: object, sample_count: int) -> dict[float, list[float]]:
    """Collect bursts until the user submits an empty distance prompt."""
    results: dict[float, list[float]] = {}
    print("Enter each measured real distance in centimetres. Press Enter when finished.")

    while True:
        distance_text = input("Real distance (cm): ").strip()
        if not distance_text:
            if results:
                return results
            print("Enter at least one distance before finishing.")
            continue

        try:
            real_distance = float(distance_text)
        except ValueError:
            print("Enter a number greater than zero.")
            continue
        if real_distance <= 0:
            print("Enter a number greater than zero.")
            continue

        print(f"Requesting {sample_count} samples at {real_distance:g} cm...")
        measurements = request_measurements(connection, sample_count)
        results[real_distance] = measurements
        valid_count = sum(measurement >= 0 for measurement in measurements)
        print(f"Received {valid_count}/{sample_count} valid measurements.")


def save_csv(results: dict[float, list[float]], output_path: Path) -> None:
    """Save the raw calibration readings for later analysis."""
    with output_path.open("w", newline="", encoding="utf-8") as output_file:
        writer = csv.writer(output_file)
        writer.writerow(["real_distance_cm", "sample_number", "measured_distance_cm"])
        for real_distance, measurements in results.items():
            for sample_number, measurement in enumerate(measurements, start=1):
                writer.writerow([real_distance, sample_number, measurement])


def plot_results(results: dict[float, list[float]], output_path: Path | None = None) -> None:
    """Plot every received sample and the mean measured distance per real distance."""
    try:
        import matplotlib.pyplot as plt
    except ImportError as error:
        raise SystemExit(
            "matplotlib is required; install it with: python3 -m pip install matplotlib"
        ) from error

    real_distances: list[float] = []
    means: list[float] = []
    errors: list[float] = []

    figure, axes = plt.subplots(figsize=(9, 6))
    for real_distance, measurements in sorted(results.items()):
        valid_measurements = [measurement for measurement in measurements if measurement >= 0]
        if not valid_measurements:
            continue

        axes.scatter(
            [real_distance] * len(valid_measurements),
            valid_measurements,
            alpha=0.65,
            label=f"{real_distance:g} cm samples",
        )
        mean = sum(valid_measurements) / len(valid_measurements)
        spread = max(valid_measurements) - min(valid_measurements)
        real_distances.append(real_distance)
        means.append(mean)
        errors.append(spread / 2)

    if real_distances:
        axes.errorbar(
            real_distances,
            means,
            yerr=errors,
            fmt="ko-",
            capsize=4,
            label="Mean and half-range",
        )

    axes.plot(real_distances, real_distances, "r--", label="Ideal measurement")
    axes.set_title("Ultrasonic Sensor Calibration")
    axes.set_xlabel("Real distance (cm)")
    axes.set_ylabel("Measured distance (cm)")
    axes.grid(True, alpha=0.3)
    axes.legend()
    figure.tight_layout()

    if output_path is not None:
        figure.savefig(output_path, dpi=150)
        print(f"Saved graph to {output_path}")
    plt.show()


def plot_standard_deviation(
    results: dict[float, list[float]], output_path: Path | None = None
) -> None:
    """Plot the sample standard deviation of measurements at each real distance."""
    try:
        import matplotlib.pyplot as plt
    except ImportError as error:
        raise SystemExit(
            "matplotlib is required; install it with: python3 -m pip install matplotlib"
        ) from error

    real_distances: list[float] = []
    standard_deviations: list[float] = []

    for real_distance, measurements in sorted(results.items()):
        valid_measurements = [measurement for measurement in measurements if measurement >= 0]
        if not valid_measurements:
            continue

        real_distances.append(real_distance)
        standard_deviations.append(
            statistics.stdev(valid_measurements) if len(valid_measurements) > 1 else 0.0
        )

    figure, axes = plt.subplots(figsize=(9, 6))
    axes.plot(real_distances, standard_deviations, "bo-")
    axes.set_title("Ultrasonic Sensor Standard Deviation")
    axes.set_xlabel("Real distance (cm)")
    axes.set_ylabel("Standard deviation (cm)")
    axes.grid(True, alpha=0.3)
    figure.tight_layout()

    if output_path is not None:
        figure.savefig(output_path, dpi=150)
        print(f"Saved standard deviation graph to {output_path}")
    plt.show()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", help="Override the serial port from platformio.ini")
    parser.add_argument("--baud", type=int, help="Override the baud rate from platformio.ini")
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_DIR / "ultrasonic_calibration.png",
        help="Path for the generated graph (default: output/ultrasonic_calibration.png)",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=OUTPUT_DIR / "ultrasonic_calibration.csv",
        help="Path for the raw readings CSV (default: output/ultrasonic_calibration.csv)",
    )
    parser.add_argument(
        "--standard-deviation-output",
        type=Path,
        default=OUTPUT_DIR / "ultrasonic_standard_deviation.png",
        help=(
            "Path for the standard deviation graph "
            "(default: output/ultrasonic_standard_deviation.png)"
        ),
    )
    args = parser.parse_args()

    try:
        port = args.port or read_platformio_value("port")
        baud_rate = args.baud or int(read_platformio_value("monitor_speed"))
    except ValueError as error:
        raise SystemExit(error) from error

    sample_count = prompt_positive_int("Samples per distance: ")

    try:
        import serial
    except ImportError as error:
        raise SystemExit("pyserial is required; install it with: python3 -m pip install pyserial") from error

    try:
        with serial.Serial(port, baud_rate, timeout=3) as connection:
            print(f"Connected to {port} at {baud_rate} baud.")
            sleep(2)
            results = collect_distances(connection, sample_count)
    except serial.SerialException as error:
        raise SystemExit(f"Could not open or read serial port {port!r}: {error}") from error
    except (KeyboardInterrupt, EOFError):
        print("\nCalibration cancelled.")
        return
    except TimeoutError as error:
        raise SystemExit(error) from error

    args.csv.parent.mkdir(parents=True, exist_ok=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.standard_deviation_output.parent.mkdir(parents=True, exist_ok=True)
    save_csv(results, args.csv)
    print(f"Saved raw readings to {args.csv}")
    plot_results(results, args.output)
    plot_standard_deviation(results, args.standard_deviation_output)


if __name__ == "__main__":
    main()