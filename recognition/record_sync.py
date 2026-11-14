"""Synchronized webcam + AirPods-motion recorder for camera / AirPods / fusion experiments (separate from w3/w4).

Clock design: AVFoundation capture timestamps (kept with ffmpeg -copyts), CMDeviceMotion.timestamp and Python
time.monotonic() all count mach host time since boot on macOS, so no cross-clock conversion should be needed.
This is VERIFIED per session, not assumed: (1) motion offset = min(arrival − t) must be small and non-drifting;
(2) first video pts vs ffmpeg launch time must be small; (3) the opening sync nods are visible in both streams and
sync_check.py cross-correlates them to measure the residual lag.

    .venv/bin/python record_sync.py --name f1 [--words yes,no,hello,water,help] [--reps 8]
Video only (audio never opened). Output: recognition/data/sync/<ts>-<name>/{video.mkv,motion.csv,events.json} (git-ignored).
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "airpods" / ".build" / "TacitAirPods.app"  # unchanged w3/w4 probe, launched via LaunchServices


def say(text: str) -> None:
    subprocess.Popen(["say", "-r", "230", text], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def tink() -> None:
    subprocess.Popen(["afplay", "/System/Library/Sounds/Tink.aiff"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def camera_index() -> str:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], capture_output=True, text=True).stderr
    video = out.split("AVFoundation video devices:")[1].split("AVFoundation audio devices:")[0]
    for i, n in re.findall(r"\[(\d+)\] (.+)", video):
        if "capture screen" not in n.lower() and "iphone" not in n.lower():
            return i
    raise SystemExit("no built-in camera found")


class Motion:
    def __init__(self, out: Path):
        self.tmp = Path(tempfile.mkdtemp(prefix="tacit-sync-"))
        self.csv = open(out, "w")
        self.n, self.offsets, self.status = 0, [], ""
        (self.tmp / "out").touch(); (self.tmp / "err").touch()
        self.proc = subprocess.Popen(["open", "-n", "-W", "--stdout", str(self.tmp / "out"), "--stderr", str(self.tmp / "err"),
                                      str(APP), "--args", "--parent-pid", str(os.getpid())])
        threading.Thread(target=self._tail, daemon=True).start()

    def _tail(self) -> None:
        pos = epos = 0
        buf = ""
        while True:
            with open(self.tmp / "out") as f:
                f.seek(pos); chunk = f.read(); pos = f.tell()
            now = time.monotonic()
            buf += chunk
            *lines, buf = buf.split("\n")
            for l in lines:
                self.csv.write(l + "\n")
                if l and not l.startswith("t,"):
                    t = float(l.split(",", 1)[0]); self.n += 1
                    self.offsets.append((t, now - t))
            with open(self.tmp / "err") as f:
                f.seek(epos); e = f.read(); epos = f.tell()
            if e.strip():
                self.status = e.strip().splitlines()[-1]; print(f"[airpods] {e.strip()}")
            time.sleep(0.01)

    def close(self) -> None:
        self.proc.terminate(); self.csv.flush(); self.csv.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="f1")
    ap.add_argument("--words", default="yes,no,hello,water,help")
    ap.add_argument("--reps", type=int, default=8)
    ap.add_argument("--window", type=float, default=2.5)
    a = ap.parse_args()
    if not APP.exists():
        raise SystemExit(f"missing {APP}: run airpods/tools/build-app.sh")
    out = ROOT / "recognition" / "data" / "sync" / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{a.name}"
    out.mkdir(parents=True, exist_ok=True)
    words = [w.strip() for w in a.words.split(",") if w.strip()]
    events: list[dict] = []
    motion = Motion(out / "motion.csv")
    for _ in range(300):
        if motion.n >= 25:
            break
        time.sleep(0.1)
    else:
        motion.close(); raise SystemExit(f"no AirPods motion (last status: {motion.status or 'none'})")
    cam = camera_index()
    ff_launch = time.monotonic()
    ff = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-framerate", "30", "-video_size", "1280x720",
                           "-i", f"{cam}:none", "-copyts", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-an", "-y",
                           str(out / "video.mkv")], stdin=subprocess.PIPE)
    time.sleep(2.0)
    print("\nFace the camera, both AirPods in, head otherwise still. Audio is NOT recorded.")
    say("three sharp nods on the ticks")
    print("SYNC: one sharp nod on each of the 3 ticks"); time.sleep(2.0)
    for _ in range(3):
        tink(); events.append({"kind": "sync_nod", "t0": time.monotonic()}); time.sleep(1.5)
    classes = words + ["neutral", "other"]
    others = ["swallow", "small nod", "look left and back", "smile"]
    k = o = 0
    try:
        for r in range(a.reps):
            for c in random.sample(classes, len(classes)):
                cue = others[o % len(others)] if c == "other" else ("still" if c == "neutral" else c)
                o += c == "other"; k += 1
                print(f"\ntrial {k}/{a.reps * len(classes)}   >>> {cue.upper()} <<<   (silently articulate words; no voice)")
                say(cue); time.sleep(1.5); tink()
                t0 = time.monotonic(); time.sleep(a.window)
                events.append({"kind": "trial", "label": c, "cue": cue, "t0": t0, "t1": time.monotonic()})
                time.sleep(0.7)
    finally:
        ff.stdin.write(b"q"); ff.stdin.flush(); ff.wait(timeout=10)
        motion.close()
        offs = motion.offsets
        drift = None
        if len(offs) > 100:  # slope of (arrival − t) against t; ~0 if the clocks share a base and do not drift
            import numpy as np
            t, d = np.array(offs).T
            lo = np.array([d[i:i + 50].min() for i in range(0, len(d) - 50, 50)]); tt = np.array([t[i] for i in range(0, len(d) - 50, 50)])
            drift = float(np.polyfit(tt, lo, 1)[0]) if len(lo) > 2 else None
        meta = {"name": a.name, "words": words, "reps": a.reps, "events": events, "ffmpeg_launch_monotonic": ff_launch,
                "motion_samples": motion.n, "motion_offset_min_s": min((x[1] for x in offs), default=None),
                "motion_offset_drift_s_per_s": drift, "clock": "time.monotonic (mach host time); video pts via -copyts",
                "created": datetime.now(timezone.utc).isoformat()}
        (out / "events.json").write_text(json.dumps(meta, indent=1))
        print(f"\nsaved → {out}\nmotion offset min {meta['motion_offset_min_s']} s, drift {drift} s/s\n"
              f"next: .venv/bin/python -m tacit_vsr.sync_check {out}")


if __name__ == "__main__":
    main()
