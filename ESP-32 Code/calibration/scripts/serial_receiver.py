"""Read comma-separated distance data from an ESP32 over serial."""

from __future__ import annotations

import argparse
import configparser
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PLATFORMIO_CONFIG = PROJECT_ROOT / "platformio.ini"


def read_baud_rate(config_path: Path = PLATFORMIO_CONFIG) -> int:
    """Read the monitor baud rate from the first PlatformIO environment."""
    config = configparser.ConfigParser()
    config.read(config_path)

    for section in config.sections():
        if section.startswith("env:") and config.has_option(section, "monitor_speed"):
            return config.getint(section, "monitor_speed")

    raise ValueError(f"No monitor_speed found in {config_path}")


def read_serial_port(config_path: Path = PLATFORMIO_CONFIG) -> str:
    """Read the serial port from the first PlatformIO environment."""
    config = configparser.ConfigParser()
    config.read(config_path)

    for section in config.sections():
        if section.startswith("env:") and config.has_option(section, "port"):
            return config.get(section, "port").strip()

    raise ValueError(f"No port found in {config_path}")


def parse_serial_line(line: str) -> list[int]:
    """Convert a line such as ``37.39,-1.00,37.39`` to integer values."""
    values = [value.strip() for value in line.strip().split(",") if value.strip()]
    return [int(float(value)) for value in values]


def receive_serial_data(port: str, baud_rate: int) -> None:
    """Print each received line as a Python-style integer array."""
    try:
        import serial
    except ImportError as error:
        raise SystemExit("pyserial is required; install it with: python3 -m pip install pyserial") from error

    try:
        with serial.Serial(port, baud_rate, timeout=1) as connection:
            print(f"Listening on {port} at {baud_rate} baud. Press Ctrl+C to stop.")

            while True:
                raw_line = connection.readline()
                if not raw_line:
                    continue

                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                try:
                    values = parse_serial_line(line)
                except ValueError:
                    print(f"Ignoring invalid data: {line!r}")
                    continue

                print(values)
    except serial.SerialException as error:
        raise SystemExit(f"Could not open or read serial port {port!r}: {error}") from error
    except KeyboardInterrupt:
        print("\nStopped.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", help="Override the serial port from platformio.ini")
    parser.add_argument("--baud", type=int, help="Override the baud rate from platformio.ini")
    args = parser.parse_args()

    try:
        port = args.port if args.port is not None else read_serial_port()
        baud_rate = args.baud if args.baud is not None else read_baud_rate()
    except ValueError as error:
        raise SystemExit(error) from error

    receive_serial_data(port, baud_rate)


if __name__ == "__main__":
    main()
