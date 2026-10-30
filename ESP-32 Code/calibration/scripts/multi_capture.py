"""Collect three Wacker5 sensors through the calibration master's USB port.

Raw distances are in cm. Remote echo durations are not available in the existing
node protocol; they are never reconstructed and labelled as measured times.
"""
from __future__ import annotations

import argparse
import csv
import math
import statistics
import sys
import time
from collections import Counter, deque
from datetime import datetime, timezone
from pathlib import Path
from threading import Event, Thread

from serial_receiver import read_baud_rate, read_serial_port

SENSORS = ("left", "master", "right")
LABELS = ("Node 1", "Centre AP", "Node 2")
COLOURS = ("#368de0", "#159879", "#de8b26")
STATUSES = {"ok", "no_echo", "invalid_echo", "out_of_range", "no_ready", "no_reply"}
OUTPUT = Path(__file__).resolve().parents[1] / "output"
FIELDS = ["host_utc", "label", "boot_id", "frame_id", "frame_start_ms", "frame_end_ms",
          "quiet_ms", "frame_pause_ms"]
FIELDS += [s + "_cm" for s in SENSORS] + [s + "_status" for s in SENSORS]
FIELDS += ["left_received_ms", "master_measured_ms", "right_received_ms", "master_echo_us",
           "position_valid", "x_m", "y_m", "rms_m", "sensors_used", "position_reason"]
FIELDS += ["actual_" + s + "_cm" for s in SENSORS]


def parse_frame(line: str) -> dict | None:
    if not line.startswith("DATA,"):
        return None
    p = line.strip().split(",")
    if len(p) != 25 or p[1] != "2" or p[18] != "POS":
        raise ValueError("Unsupported/malformed DATA record; upload calibration firmware v2.")
    result = {}
    for name, index in zip(FIELDS[2:8], range(2, 8)):
        value = int(p[index])
        if not 0 <= value <= 0xFFFFFFFF:
            raise ValueError("Invalid unsigned measurement metadata")
        result[name] = value
    for i, sensor in enumerate(SENSORS):
        value, status = float(p[8+i]), p[11+i]
        if status not in STATUSES or math.isinf(value) or (status == "ok" and (not math.isfinite(value) or not 2 <= value <= 450)):
            raise ValueError("Invalid sensor measurement/status")
        result[sensor + "_cm"] = value if math.isfinite(value) else None
        result[sensor + "_status"] = status
    for name, index in zip(FIELDS[14:18], range(14, 18)):
        value = int(p[index])
        if not 0 <= value <= 0xFFFFFFFF:
            raise ValueError("Invalid measurement timestamp/duration")
        result[name] = value
    for sensor, name in (("left", "left_received_ms"), ("right", "right_received_ms")):
        if result[sensor+"_status"] in {"no_ready", "no_reply"}: result[name] = None
    if p[19] not in {"0", "1"}:
        raise ValueError("Invalid position validity")
    result["position_valid"] = p[19] == "1"
    for name, index in zip(("x_m", "y_m", "rms_m"), (20, 21, 22)):
        value = float(p[index])
        if result["position_valid"] and not math.isfinite(value):
            raise ValueError("Invalid position coordinates")
        result[name] = value if result["position_valid"] else None
    result["sensors_used"] = int(p[23])
    result["position_reason"] = p[24]
    result["host_utc"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    return result


def summarise(rows: list[dict], sensor: str) -> dict:
    valid = [r[sensor+"_cm"] for r in rows if r[sensor+"_status"] == "ok"]
    return dict(total=len(rows), valid=len(valid), failed=len(rows)-len(valid),
                mean_cm=statistics.mean(valid) if valid else None,
                stdev_cm=statistics.stdev(valid) if len(valid)>1 else None,
                failures=dict(Counter(r[sensor+"_status"] for r in rows if r[sensor+"_status"] != "ok")))


class CsvLog:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.file = path.open("x", newline="", encoding="utf-8")
        self.writer = csv.DictWriter(self.file, fieldnames=FIELDS)
        self.writer.writeheader()
        self.file.flush()

    def write(self, row: dict):
        self.writer.writerow(row)
        self.file.flush()  # Completed frames survive interruption/disconnection.

    def close(self):
        self.file.close()


class Session:
    def __init__(self, connection):
        self.connection = connection
        self.boot = None
        self.last_frame = None
        self.quiet_ms, self.pause_ms = 100, 0

    def send(self, command):
        self.connection.write((command+"\n").encode("ascii"))

    def read_line(self):
        line = self.connection.readline().decode("ascii", errors="replace").strip()
        if line.startswith("ERROR:"):
            raise RuntimeError(line)
        return line

    def ready(self):
        # Supports boards that reset on USB open and boards that remain running.
        self.send("STOP")
        deadline, next_hello = time.monotonic()+15, 0
        while time.monotonic()<deadline:
            if time.monotonic()>=next_hello:
                self.send("HELLO");next_hello=time.monotonic()+1
            line = self.read_line()
            if line.startswith("LOGGER_READY,"):
                parts = line.split(",")
                if len(parts)!=5 or parts[1]!="2" or parts[2]!="Wacker5" or parts[4]!="1":
                    raise RuntimeError("Calibration logger v2 with working Wacker5 Wi-Fi/UDP is required.")
                self.boot=int(parts[3]); self.send("STOP")
                self.expect("MODE:IDLE")
                print("Calibration master ready on Wacker5; missing nodes will be logged, not hidden.")
                return
        raise TimeoutError("No LOGGER_READY response. Check COM port, 115200 baud, and upload calibration/src/main.cpp to the centre board.")

    def expect(self, expected):
        deadline=time.monotonic()+4
        while time.monotonic()<deadline:
            if self.read_line()==expected:return
        raise TimeoutError("No acknowledgement for "+expected)

    def configure(self, quiet_ms, pause_ms, position=False):
        if not 60<=quiet_ms<=60000 or not 0<=pause_ms<=60000:
            raise ValueError("Quiet time must be 60–60000 ms; extra cycle pause must be 0–60000 ms.")
        self.quiet_ms,self.pause_ms=quiet_ms,pause_ms
        self.send(f"CONFIG_TIMING {quiet_ms}");self.expect(f"TIMING,{quiet_ms}")
        self.send("POSITION ON" if position else "POSITION OFF")
        self.expect("POSITION,ON" if position else "POSITION,OFF")

    def frames(self, count=0, stop=None, pump=None):
        if not 0<=count<=100:raise ValueError("Burst length must be 1–100; use 0 for continuous.")
        self.send(f"MULTI_TEST {count} {self.pause_ms}" if count else f"MULTI_STREAM {self.pause_ms}")
        timeout=5+(3*self.quiet_ms+self.pause_ms)/1000
        deadline=time.monotonic()+timeout
        received=0
        while not count or received<count:
            if pump:pump()
            if stop and stop.is_set():return
            line=self.read_line()
            if line.startswith("LOGGER_READY,"):
                raise RuntimeError("Master restarted during capture. Partial CSV has been retained; start a new run.")
            frame=parse_frame(line)
            if frame:
                if frame["boot_id"]!=self.boot:
                    raise RuntimeError("Master session changed during capture; start a new run.")
                sequence=frame["frame_id"]
                if self.last_frame is not None:
                    advance=(sequence-self.last_frame)&0xFFFFFFFF
                    if advance==0 or advance>=0x80000000:
                        if time.monotonic()>deadline:raise TimeoutError("Only duplicate/old frames received.")
                        continue
                self.last_frame=sequence
                if frame["quiet_ms"]!=self.quiet_ms or frame["frame_pause_ms"]!=self.pause_ms:
                    raise RuntimeError("Firmware timing differs from requested settings.")
                received+=1;deadline=time.monotonic()+timeout
                yield frame
            if time.monotonic()>deadline:
                raise TimeoutError("No fresh measurement frame. Partial CSV retained; check USB and the master.")
        # Wait for explicit completion before issuing another burst/configuration.
        self.expect(f"MULTI_DONE,{self.boot},{self.last_frame}")


def print_stats(rows):
    for sensor,label in zip(SENSORS,LABELS):
        s=summarise(rows,sensor)
        mean="—" if s['mean_cm'] is None else f"{s['mean_cm']:.2f}"
        sd="—" if s['stdev_cm'] is None else f"{s['stdev_cm']:.2f}"
        print(f"{label}: {s['valid']}/{s['total']} valid, mean {mean} cm, SD {sd} cm, failures {s['failures']}")


def plot_saved(rows, output_path, mode):
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(2,1,figsize=(10,8),layout="constrained")
    if mode=="sweep":
        for sensor,label,colour in zip(SENSORS,LABELS,COLOURS):
            quiet=sorted({r['quiet_ms'] for r in rows})
            stats=[summarise([r for r in rows if r['quiet_ms']==q],sensor) for q in quiet]
            axes[0].errorbar(quiet,[s['mean_cm'] if s['mean_cm'] is not None else math.nan for s in stats],
              yerr=[s['stdev_cm'] or 0 for s in stats],fmt='o-',color=colour,label=label,capsize=4)
            axes[1].plot(quiet,[100*s['valid']/s['total'] for s in stats],'o-',color=colour,label=label)
        axes[0].set(xlabel="Quiet time after each sensor (ms)",ylabel="Range mean ± sample SD (cm)")
        axes[1].set(xlabel="Quiet time after each sensor (ms)",ylabel="Valid readings (%)",ylim=(-2,102))
    elif mode=="calibrate":
        for sensor,label,colour in zip(SENSORS,LABELS,COLOURS):
            points=[r for r in rows if r[sensor+'_status']=='ok' and r.get('actual_'+sensor+'_cm') is not None]
            x=[r['actual_'+sensor+'_cm'] for r in points];y=[r[sensor+'_cm'] for r in points]
            axes[0].scatter(x,y,label=label,color=colour,alpha=.5)
            axes[1].scatter(x,[b-a for a,b in zip(x,y)],label=label,color=colour,alpha=.5)
        axes[0].set(xlabel="Actual distance to each sensor (cm)",ylabel="Measured distance (cm)")
        axes[1].axhline(0,color='grey',ls='--');axes[1].set(xlabel="Actual distance (cm)",ylabel="Measurement error (cm)")
    else:
        for sensor,label,colour in zip(SENSORS,LABELS,COLOURS):
            values=[r[sensor+'_cm'] if r[sensor+'_status']=='ok' else math.nan for r in rows]
            axes[0].plot(range(1,len(rows)+1),values,'.-',color=colour,label=label)
            axes[1].plot(range(1,len(rows)+1),[r[sensor+'_status']=='ok' for r in rows],'.',color=colour,label=label)
        axes[0].set(xlabel="Measurement cycle",ylabel="Raw distance (cm)")
        axes[1].set(xlabel="Measurement cycle",ylabel="Valid reading (1=yes, 0=no)",yticks=[0,1])
    for ax in axes:ax.grid(alpha=.25);ax.legend()
    fig.suptitle("Wacker5 · three-sensor data capture")
    fig.savefig(output_path,dpi=140,bbox_inches='tight')
    return fig


def prompt_int(text,default,minimum,maximum):
    while True:
        try:
            value=input(f"{text} [{default}]: ").strip()
            number=int(value) if value else default
            if minimum<=number<=maximum:return number
        except ValueError:pass
        print(f"Enter {minimum}–{maximum}.")


def interactive(port,baud,mode,count=100):
    print("Three sensors, raw ranges in cm. Node 1 and Node 2 use their existing firmware.")
    quiet=prompt_int("Quiet time after EACH sensor, including across cycles (ms)",100,60,60000)
    pause=prompt_int("Additional pause BETWEEN complete cycles (ms)",0,0,60000)
    delays=None
    if mode=="sweep":
        upper=prompt_int("Upper quiet-time bound (ms)",max(quiet,200),quiet,60000)
        step=prompt_int("Quiet-time increment (ms)",20,1,60000)
        delays=list(range(quiet,upper+1,step))
        if delays[-1]!=upper:delays.append(upper)
    return run(port,baud,mode,count,quiet,pause,delays)


def run(port,baud,mode="live",count=100,quiet=100,pause=0,delays=None,csv_path=None,output_path=None,no_plot=False):
    import serial
    if mode not in {"live","burst","sweep","calibrate"}:raise ValueError("Unknown capture mode")
    if not 1<=count<=100:raise ValueError("Samples per burst must be 1–100")
    if not 60<=quiet<=60000 or not 0<=pause<=60000:raise ValueError("Invalid timing settings")
    if delays and any(not 60<=d<=60000 for d in delays):raise ValueError("Sweep quiet times must be 60–60000 ms")
    stamp=datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    csv_path=Path(csv_path) if csv_path else OUTPUT/f"multi_{mode}_{stamp}.csv"
    output_path=Path(output_path) if output_path else csv_path.with_suffix('.png')
    rows=[];stop=Event();log=None;figure=None;live_fig=None;session=None
    if not no_plot:
        import matplotlib.pyplot as plt
    print(f"Connecting to {port} at {baud}. CSV: {csv_path}")
    try:
        with serial.Serial(port,baud,timeout=.1,write_timeout=2) as connection:
            session=Session(connection)
            try:
                session.ready();session.configure(quiet,pause)
                log=CsvLog(csv_path)
                if mode=="live":
                    # CSV is unbounded; the on-screen window and memory stay bounded.
                    recent=deque();live_start=time.monotonic()
                    if not no_plot:
                        plt.ion();live_fig,ax=plt.subplots(figsize=(10,5),layout='constrained')
                        lines=[ax.plot([],[],'.-',color=c,label=l)[0] for c,l in zip(COLOURS,LABELS)]
                        ax.set(xlabel="Seconds since capture start",ylabel="Raw range (cm)",title="Wacker5 · last 10 seconds")
                        ax.legend();ax.grid(alpha=.25)
                        live_fig.canvas.mpl_connect('close_event',lambda _:stop.set())
                    def enter_stop():
                        sys.stdin.readline();stop.set()
                    Thread(target=enter_stop,daemon=True).start()
                    print("Press Enter or close the graph to stop. Failed samples remain in the CSV.")
                    def pump():
                        if not no_plot:plt.pause(.001)
                    for row in session.frames(0,stop,pump):
                        log.write(row);elapsed=time.monotonic()-live_start;recent.append((elapsed,row))
                        while recent and recent[0][0]<elapsed-10:recent.popleft()
                        if not no_plot:
                            for sensor,line in zip(SENSORS,lines):
                                line.set_data([t for t,r in recent],[r[sensor+'_cm'] if r[sensor+'_status']=='ok' else math.nan for t,r in recent])
                            ax.relim();ax.autoscale_view();ax.set_title(' | '.join(f"{l}: {row[s+'_status']}" for s,l in zip(SENSORS,LABELS)))
                            live_fig.canvas.draw_idle()
                        print(' | '.join(f"{l}: {row[s+'_cm']} cm ({row[s+'_status']})" for s,l in zip(SENSORS,LABELS)))
                    rows=[r for _,r in recent]
                    print("Statistics below cover the final 10-second window; the CSV contains the full run.")
                else:
                    settings=delays if mode=="sweep" and delays else [quiet]
                    while True:
                        actual={};label=""
                        if mode=="calibrate":
                            label=input("Test-position label (blank finishes): ").strip()
                            if not label:break
                            for sensor,name in zip(SENSORS,LABELS):
                                while True:
                                    value=input(f"Actual distance from {name}'s metal sensor faces to target (cm; blank if unknown): ").strip()
                                    try:
                                        distance=float(value) if value else None
                                        if distance is None or (math.isfinite(distance) and distance>0):break
                                    except ValueError:pass
                                    print("Enter a positive measured distance, or leave blank.")
                                actual['actual_'+sensor+'_cm']=distance
                        for delay in settings:
                            session.configure(delay,pause);batch=[]
                            for row in session.frames(count):
                                row.update(actual);row['label']=label;log.write(row);rows.append(row);batch.append(row)
                                print(f"Quiet {delay} ms · cycle {len(batch)}/{count}: "+' | '.join(f"{s}={row[s+'_cm']} ({row[s+'_status']})" for s in SENSORS))
                            print_stats(batch)
                        if mode!="calibrate":break
            finally:
                try:session.send("STOP")
                except (OSError,serial.SerialException):pass  # Do not mask the original USB failure.
    except (KeyboardInterrupt,EOFError):
        print("Capture stopped; completed frames remain in the CSV.")
    finally:
        if log:log.close()
        if live_fig is not None:plt.close(live_fig)
    if rows:
        print_stats(rows)
        if not no_plot:
            output_path.parent.mkdir(parents=True,exist_ok=True)
            figure=plot_saved(rows,output_path,mode);plt.ioff();plt.show()
    if log:print(f"Saved {csv_path}")
    return rows


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('port',nargs='?');parser.add_argument('--baud',type=int)
    parser.add_argument('--mode',choices=['live','burst','sweep','calibrate'],default='live')
    parser.add_argument('--samples',type=int,default=100)
    parser.add_argument('--quiet-ms',type=int,default=100)
    parser.add_argument('--frame-pause-ms',type=int,default=0)
    parser.add_argument('--sweep',type=int,nargs='+',help='Quiet times to test, e.g. 60 100 150 200')
    parser.add_argument('--csv',type=Path);parser.add_argument('--output',type=Path)
    parser.add_argument('--no-plot',action='store_true')
    args=parser.parse_args()
    try:
        run(args.port or read_serial_port(),args.baud or read_baud_rate(),args.mode,args.samples,
            args.quiet_ms,args.frame_pause_ms,args.sweep,args.csv,args.output,args.no_plot)
    except (OSError,RuntimeError,ValueError,TimeoutError,ImportError) as error:
        raise SystemExit(str(error)) from error


if __name__=='__main__':main()
