"""Render a labelled synthetic room-test graph for visual inspection."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import room_burst_sweep as room

root = Path(__file__).resolve().parents[1]
rows = []
pauses = [0, 200, 400, 600, 800, 1000]
for pause in pauses:
    for repetition in range(3):
        for pulse in range(10):
            row = dict(phase="test", burst_pause_ms=pause)
            for i, sensor in enumerate(room.SENSORS):
                value = 5000 + i * 700 + 150 * (pulse % 3 - 1) + repetition * 10
                row[sensor + "_echo_time_us"] = None if i == 2 and pause == 400 else value
            rows.append(row)
output = root / ".verify" / "qa_room_burst_sweep.png"
fig = room.plot_results(rows, pauses, output, 10, 100, 3)
fig.axes[0].set_title("SIMULATED DATA · room echo test layout check\n10 pulses/sensor/burst × 3 repeats · fixed quiet time 100 ms")
fig.savefig(output, dpi=150, bbox_inches="tight")
assert len(fig.axes) == 1
assert len(fig.axes[0].containers) == 3
assert len(fig.axes[0].get_legend().get_texts()) == 3
plt.close(fig)
print(output)
