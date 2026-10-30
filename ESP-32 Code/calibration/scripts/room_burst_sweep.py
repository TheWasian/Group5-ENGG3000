"""Repeated three-sensor bursts with a swept extra pause between bursts."""
from __future__ import annotations

import csv
import math
import statistics
import time
from datetime import datetime
from pathlib import Path

from multi_capture import COLOURS, FIELDS, LABELS, OUTPUT, SENSORS, Session, prompt_int

EXPERIMENT_FIELDS = [
    "phase", "burst_number", "repetition", "pulse_number", "pulses_per_sensor",
    "repetitions_per_setting", "burst_pause_ms", "ap_observed_burst_gap_ms",
]
EXPERIMENT_FIELDS += [s + "_echo_time_us" for s in SENSORS]
EXPERIMENT_FIELDS += [s + "_echo_source" for s in SENSORS]


def delay_values(lower, upper, step):
    if not 0 <= lower <= upper <= 60000 or not 1 <= step <= 60000:
        raise ValueError("Pause bounds must be 0–60000 ms, lower <= upper, increment 1–60000 ms.")
    values = list(range(lower, upper + 1, step))
    if values[-1] != upper:
        values.append(upper)
    return values


def echo_times(row):
    """Keep measured centre pulse width distinct from reconstructed node times."""
    for sensor in SENSORS:
        source = "measured_pulse_width" if sensor == "master" else "reconstructed_from_rounded_range"
        row[sensor + "_echo_source"] = source
        value = None
        if row[sensor + "_status"] == "ok":
            value = (row["master_echo_us"] if sensor == "master"
                     else row[sensor + "_cm"] * 2.0 / 0.0343)
        row[sensor + "_echo_time_us"] = value
    return row


def summary(rows, sensor, pauses):
    result = []
    for pause in pauses:
        selected = [r for r in rows if r["phase"] == "test" and r["burst_pause_ms"] == pause]
        values = [r[sensor + "_echo_time_us"] for r in selected
                  if r[sensor + "_echo_time_us"] is not None]
        result.append(dict(pause=pause, total=len(selected), valid=len(values),
                           mean=statistics.mean(values) if values else math.nan,
                           sd=statistics.stdev(values) if len(values) > 1 else math.nan))
    return result


def plot_results(rows, pauses, output, pulses, pulse_delay, repeats):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(13, 6.5), layout="constrained")
    for sensor, label, colour in zip(SENSORS, LABELS, COLOURS):
        stats = summary(rows, sensor, pauses)
        provenance = "measured" if sensor == "master" else "reconstructed"
        valid = sum(s["valid"] for s in stats)
        total = sum(s["total"] for s in stats)
        # One point per pause pools every valid pulse in every repeated burst.
        # NaNs keep failed settings as gaps instead of inventing zero-time echoes.
        ax.errorbar(pauses, [s["mean"] for s in stats],
                    yerr=[s["sd"] if math.isfinite(s["sd"]) else 0 for s in stats],
                    fmt="o-", color=colour, capsize=4,
                    label=f"{label} ({provenance}; {valid}/{total} valid)")
    ax.set(title=f"Room echo test · {pulses} pulses/sensor/burst × {repeats} repeats/setting\n"
                 f"Fixed quiet time between sensor readings: {pulse_delay} ms",
           xlabel="Additional pause between bursts (ms)",
           ylabel="Echo return time: mean ± sample SD (µs)")
    ax.grid(alpha=.25)
    ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1), fontsize=9)
    fig.supxlabel("All pulses included. Nodes: t ≈ 2d / 0.0343 (d in cm); centre: measured ECHO width.\n"
                  "Firmware quiet time and USB/network overhead add to the selected burst pause.", fontsize=9)
    output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output, dpi=150, bbox_inches="tight")
    return fig


def collect(session, writer, stream, rows, pulses, pulse_delay, repeats, pauses):
    session.configure(pulse_delay, 0)
    previous_end = None
    burst_number = 0

    def burst(phase, pause, repetition):
        nonlocal previous_end, burst_number
        for pulse, frame in enumerate(session.frames(pulses), 1):
            gap = ((frame["frame_start_ms"] - previous_end) & 0xFFFFFFFF
                   if pulse == 1 and previous_end is not None else None)
            previous_end = frame["frame_end_ms"]
            frame.update(phase=phase, burst_number=burst_number,
                         repetition=repetition, pulse_number=pulse,
                         pulses_per_sensor=pulses, repetitions_per_setting=repeats,
                         burst_pause_ms=pause, ap_observed_burst_gap_ms=gap)
            echo_times(frame)
            writer.writerow(frame)
            stream.flush()
            rows.append(frame)
            if pulse == 1 or pulse == pulses or pulse % 10 == 0:
                states = " | ".join(f"{name}: {frame[sensor + '_status']}"
                                    for sensor, name in zip(SENSORS, LABELS))
                print(f"  {phase} burst {burst_number}: pulse {pulse}/{pulses} — {states}", flush=True)

    # Give the very first swept pause a real preceding burst, too.
    print("Recording one conditioning burst (saved in CSV, excluded from graph).")
    burst("conditioning", None, 0)
    total = len(pauses) * repeats
    for pause in pauses:
        for repetition in range(1, repeats + 1):
            time.sleep(pause / 1000)
            burst_number += 1
            print(f"Burst {burst_number}/{total}: extra pause {pause} ms, "
                  f"repeat {repetition}/{repeats}, {pulses} pulses per sensor")
            burst("test", pause, repetition)


def run(port, baud, pulses, pulse_delay, repeats, pauses, csv_path=None, output=None, no_plot=False):
    if not 1 <= pulses <= 100 or not 1 <= repeats <= 1000:
        raise ValueError("Use 1–100 pulses per sensor and 1–1000 repetitions per setting.")
    if not 60 <= pulse_delay <= 60000:
        raise ValueError("Fixed quiet time must be 60–60000 ms for the existing node firmware.")
    if not pauses or any(not 0 <= p <= 60000 for p in pauses):
        raise ValueError("Provide burst pauses from 0–60000 ms.")
    import serial
    if not no_plot:
        import matplotlib.pyplot as plt
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    csv_path = Path(csv_path) if csv_path else OUTPUT / f"room_echo_test_{stamp}.csv"
    output = Path(output) if output else csv_path.with_suffix(".png")
    trace_path = csv_path.with_suffix(".serial.log")
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    print("All three sensors use Wacker5. Each cycle fires centre → Node 1 → Node 2.")
    print(f"Fixed quiet time: {pulse_delay} ms after each sensor; no extra pause within a burst.")
    print("Nodes report reconstructed echo times; centre reports measured echo width.")
    print(f"Raw CSV: {csv_path}")
    print(f"Serial diagnostics: {trace_path}")
    try:
        # Exclusive creation protects previous runs, even when a name is supplied.
        with csv_path.open("x", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=FIELDS + EXPERIMENT_FIELDS)
            writer.writeheader()
            stream.flush()
            with trace_path.open("x", encoding="utf-8") as trace_file, \
                    serial.Serial(port, baud, timeout=.1, write_timeout=2) as connection:
                def trace(direction, line):
                    trace_file.write(f"{datetime.now().isoformat(timespec='milliseconds')} {direction} {line}\n")
                    trace_file.flush()
                session = Session(connection, trace=trace)
                try:
                    session.ready()
                    collect(session, writer, stream, rows, pulses, pulse_delay, repeats, pauses)
                except (OSError, RuntimeError, ValueError, TimeoutError) as error:
                    trace("FAIL", str(error)+" "+session.diagnostic_context())
                    raise
                finally:
                    try:
                        session.send("STOP")
                    except (OSError, serial.SerialException):
                        pass
    except (KeyboardInterrupt, EOFError):
        print("Stopped. Completed readings remain in the CSV; graph shows available data.")
    except (OSError, RuntimeError, ValueError, TimeoutError):
        print(f"Capture failed. Any completed readings are retained in {csv_path}.")
        raise
    test_rows = [r for r in rows if r["phase"] == "test"]
    if test_rows:
        for sensor, label in zip(SENSORS, LABELS):
            for stat in summary(rows, sensor, pauses):
                print(f"{label}, {stat['pause']} ms: {stat['valid']}/{stat['total']} valid, "
                      f"mean {stat['mean']:.1f} µs, SD {stat['sd']:.1f} µs")
        if not no_plot:
            plot_results(rows, pauses, output, pulses, pulse_delay, repeats)
            print(f"Saved one combined graph: {output}")
            plt.show()
    print(f"Saved {len(rows)} three-sensor cycles (including conditioning) to {csv_path}")
    return rows


def interactive(args, port, baud, pulses):
    delay = args.pulse_delay_ms
    if delay is None:
        delay = prompt_int("Fixed quiet time between sensor readings within each burst (ms)", 100, 60, 60000)
    repeats = args.repeats
    if repeats is None:
        repeats = prompt_int("Repeat bursts at EACH pause setting", 3, 1, 1000)
    lower = args.lower_ms
    if lower is None:
        lower = prompt_int("Lower bound: additional pause between bursts (ms)", 0, 0, 60000)
    upper = args.upper_ms
    if upper is None:
        upper = prompt_int("Upper bound: additional pause between bursts (ms)", max(lower, 1000), lower, 60000)
    step = args.step_ms
    if step is None:
        step = prompt_int("Pause increment (ms)", 100, 1, 60000)
    pauses = delay_values(lower, upper, step)
    print(f"Testing {pauses} ms, {repeats} bursts each, {pulses} pulses per sensor per burst.")
    return run(port, baud, pulses, delay, repeats, pauses, args.csv, args.output, args.no_plot)
