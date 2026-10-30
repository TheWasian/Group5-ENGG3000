"""Prompts and serial details shared by the calibration scripts."""

from __future__ import annotations

from typing import Literal


SensorMode = Literal["single", "multi"]


def select_sensor_mode() -> SensorMode:
    """Ask whether the master is using one sensor or the multi-sensor setup."""
    while True:
        choice = input("Sensor mode ([s]ingle/[m]ulti): ").strip().lower()
        if choice in {"s", "single"}:
            return "single"
        if choice in {"m", "multi"}:
            print("\nMulti-sensor connection checklist:")
            print("1. Flash calibration/src/main.cpp (logger v2) to the centre USB-connected ESP32.")
            print("2. Flash Sensor_Node_1 to node 1 and Sensor_Node_2 to node 2.")
            print("3. Connect the ultrasonic sensor and ground to all three boards.")
            print("4. Power both remote nodes and keep them within Wi-Fi range.")
            print("5. Confirm the nodes join Wi-Fi SSID Wacker5.")
            print("   Node 1 must use 192.168.4.101; node 2 must use 192.168.4.102.")
            print("6. Connect only the master ESP32 to this computer over USB.")
            print("7. Close PlatformIO Monitor and any other serial program.")
            print("8. Use only this centre board as the Wacker5 access point; power the remote nodes normally.")
            print("All three ranges are logged even when position solving is disabled or fails.")
            confirmation = input("Are all multi-sensor connections ready? [y/N]: ")
            if confirmation.strip().lower() in {"y", "yes"}:
                return "multi"
            print("Multi-sensor setup not confirmed; select a mode again.\n")
            continue
        print("Enter 's' for single sensor or 'm' for multi-sensor.")


def serial_command(mode: SensorMode, single_command: str, multi_command: str) -> bytes:
    """Return the command for the selected sensor mode."""
    command = single_command if mode == "single" else multi_command
    return f"{command}\n".encode("ascii")


def parse_multi_master_distance(line: str) -> float | None:
    """Extract the master range in centimetres from a MULTI result."""
    fields = line.split(",")
    if len(fields) < 5 or fields[0] != "MULTI":
        return None
    try:
        return float(fields[3])
    except ValueError:
        return None


def parse_multi_sensor_distances(line: str) -> dict[str, float] | None:
    """Extract left, master, and right ranges in centimetres from a MULTI result."""
    fields = line.split(",")
    if len(fields) < 5 or fields[0] != "MULTI":
        return None
    try:
        return {
            "left": float(fields[2]),
            "master": float(fields[3]),
            "right": float(fields[4]),
        }
    except ValueError:
        return None
