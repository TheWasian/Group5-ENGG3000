import csv
import io
import math
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import room_burst_sweep as room
from test_multi_capture import EmulatedMaster, wire
from multi_capture import parse_frame


class RoomBurstTests(unittest.TestCase):
    def test_bounds_include_upper_and_validate(self):
        self.assertEqual(room.delay_values(0, 250, 100), [0, 100, 200, 250])
        self.assertEqual(room.delay_values(10, 10, 100), [10])
        for args in [(-1, 100, 10), (100, 0, 10), (0, 100, 0), (0, 60001, 1)]:
            with self.assertRaises(ValueError):
                room.delay_values(*args)

    def test_echo_sources_units_and_failures(self):
        row = room.echo_times(parse_frame(wire(left="34.3")))
        self.assertAlmostEqual(row["left_echo_time_us"], 2000)
        self.assertEqual(row["master_echo_time_us"], 6414)
        self.assertIsNone(row["right_echo_time_us"])
        self.assertEqual(row["left_echo_source"], "reconstructed_from_rounded_range")
        self.assertEqual(row["master_echo_source"], "measured_pulse_width")

    def test_repeats_keep_pulse_delay_fixed_and_save_all_readings(self):
        fake = EmulatedMaster()
        serial = types.SimpleNamespace(Serial=lambda *a, **kw: fake, SerialException=OSError)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            path = Path(folder) / "room.csv"
            with patch.dict(sys.modules, serial=serial), patch.object(room.time, "sleep") as wait, patch("sys.stdout", io.StringIO()):
                rows = room.run("FAKE", 115200, 3, 120, 2, [0, 200], csv_path=path, no_plot=True)
            self.assertEqual(wait.call_args_list, [((0.0,),), ((0.0,),), ((.2,),), ((.2,),)])
            self.assertEqual(len(rows), 15)  # conditioning + 4 bursts, 3 cycles each
            self.assertEqual([r["phase"] for r in rows[:3]], ["conditioning"] * 3)
            self.assertEqual([r["burst_pause_ms"] for r in rows[3:]], [0] * 6 + [200] * 6)
            self.assertEqual([r["pulse_number"] for r in rows], [1, 2, 3] * 5)
            self.assertEqual([r["repetition"] for r in rows[3:]], [1]*3 + [2]*3 + [1]*3 + [2]*3)
            self.assertTrue(all(r["quiet_ms"] == 120 and r["frame_pause_ms"] == 0 for r in rows))
            self.assertEqual(fake.written.count(b"MULTI_TEST 3 0\n"), 5)
            self.assertEqual(fake.written.count(b"CONFIG_TIMING 120\n"), 1)
            self.assertEqual(fake.written[-1], b"STOP\n")
            with path.open(newline="", encoding="utf-8") as stream:
                saved = list(csv.DictReader(stream))
            self.assertEqual(len(saved), 15)
            self.assertEqual(saved[-1]["right_echo_time_us"], "")
            self.assertEqual(saved[-1]["right_status"], "no_ready")

    def test_statistics_pool_every_pulse_exclude_conditioning_and_failures(self):
        rows = [dict(phase=phase, burst_pause_ms=0, left_echo_time_us=value)
                for phase, value in [("conditioning", 99999), ("test", 100),
                                     ("test", 200), ("test", 300), ("test", None)]]
        stat, missing = room.summary(rows, "left", [0, 200])
        self.assertEqual(stat["mean"], 200)
        self.assertEqual(stat["sd"], 100)
        self.assertEqual((stat["total"], stat["valid"]), (4, 3))
        self.assertTrue(math.isnan(missing["mean"]))

    def test_partial_csv_and_stop_on_failure(self):
        class BrokenMaster(EmulatedMaster):
            def write(self, data):
                super().write(data)
                if data.startswith(b"MULTI_TEST"):
                    self.lines = self.lines[:1] + ["ERROR:disconnected"]
        fake = BrokenMaster()
        serial = types.SimpleNamespace(Serial=lambda *a, **kw: fake, SerialException=OSError)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            path = Path(folder) / "partial.csv"
            with patch.dict(sys.modules, serial=serial), patch("sys.stdout", io.StringIO()):
                with self.assertRaises(RuntimeError):
                    room.run("FAKE", 115200, 3, 100, 2, [0, 200], csv_path=path, no_plot=True)
            with path.open(newline="", encoding="utf-8") as stream:
                self.assertEqual(len(list(csv.DictReader(stream))), 1)
            self.assertEqual(fake.written[-1], b"STOP\n")

    def test_gap_uses_ap_clock_and_handles_wrap(self):
        class Session:
            frame = 0
            def configure(self, *args): pass
            def frames(self, count):
                self.frame += 1
                row = parse_frame(wire(self.frame))
                row["frame_start_ms"] = 40 if self.frame > 1 else 0xFFFFFF00
                row["frame_end_ms"] = 80 if self.frame > 1 else 0xFFFFFFF0
                yield row
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=room.FIELDS + room.EXPERIMENT_FIELDS)
        rows = []
        with patch.object(room.time, "sleep"), patch("sys.stdout", io.StringIO()):
            room.collect(Session(), writer, stream, rows, 1, 100, 1, [0])
        self.assertIsNone(rows[0]["ap_observed_burst_gap_ms"])
        self.assertEqual(rows[1]["ap_observed_burst_gap_ms"], 56)


if __name__ == "__main__":
    unittest.main()
