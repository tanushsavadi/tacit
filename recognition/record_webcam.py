"""Record webcam clips for VSR evaluation. VIDEO ONLY — the audio device is never opened ("<cam>:none").
    .venv/bin/python record_webcam.py --name s1 [--modes silent,voiced] [--free 3] [--camera N]
Each prompt is recorded once per mode (silent = articulate with no sound; voiced = speak normally — still no audio is
captured; it is a control that separates "silent articulation" from "webcam domain"). Clips + manifest.jsonl go to
recognition/data/webcam/<timestamp>-<name>/ (git-ignored; contains your face — keep private).
"""
from __future__ import annotations

import argparse
import json
import random
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

PROMPTS = [
    "I would like some water please", "can you call my mother", "I am feeling much better today",
    "what time is the appointment", "please turn on the lights", "thank you for coming",
    "I need help with this", "I don't understand", "see you tomorrow morning", "how are you doing",
]


def camera_index(name_hint: str | None) -> str:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], capture_output=True, text=True).stderr
    video = out.split("AVFoundation video devices:")[1].split("AVFoundation audio devices:")[0]
    devs = re.findall(r"\[(\d+)\] (.+)", video)
    for i, n in devs:
        if (name_hint and name_hint.lower() in n.lower()) or (not name_hint and "capture screen" not in n.lower()):
            print(f"camera: [{i}] {n}")
            return i
    raise SystemExit(f"no camera found:\n{video}")


def record(cam: str, path: Path, seconds: float, prompt: str, mode: str) -> None:
    how = "ARTICULATE SILENTLY (no voice, no whisper)" if mode == "silent" else "SPEAK NORMALLY"
    print(f"\n  >>> {how}:  \"{prompt}\"")
    input("      press Enter, wait for GO …")
    p = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-framerate", "30", "-video_size", "1280x720",
                          "-i", f"{cam}:none", "-t", str(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-an", "-y", str(path)])
    time.sleep(1.0)
    print("      GO")
    p.wait()
    print(f"      saved {path.name}" if p.returncode == 0 and path.exists() else f"      FAILED (ffmpeg exit {p.returncode}) — check Camera permission for this terminal app")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="s1")
    ap.add_argument("--modes", default="silent,voiced")
    ap.add_argument("--free", type=int, default=3, help="extra prompts you choose and type yourself")
    ap.add_argument("--seconds", type=float, default=5.5)
    ap.add_argument("--camera", default=None, help="camera name substring (default: first non-screen device)")
    a = ap.parse_args()
    cam = camera_index(a.camera)
    out = Path(__file__).resolve().parent / "data" / "webcam" / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{a.name}"
    out.mkdir(parents=True, exist_ok=True)
    modes = a.modes.split(",")
    items = [(p, m) for p in PROMPTS for m in modes]
    random.shuffle(items)
    print("Face the camera, normal lighting, mouth fully visible. Audio is NOT recorded.")
    with open(out / "manifest.jsonl", "a") as man:
        for k, (prompt, mode) in enumerate(items, 1):
            f = out / f"clip{k:02d}-{mode}.mp4"
            record(cam, f, a.seconds, prompt, mode)
            man.write(json.dumps({"file": f.name, "ref": prompt, "mode": mode, "prompted": True}) + "\n"); man.flush()
        for k in range(a.free):
            text = input(f"\nYour own sentence #{k + 1} (type it, Enter; you will then articulate it silently): ").strip()
            if not text:
                continue
            f = out / f"free{k + 1:02d}-silent.mp4"
            record(cam, f, a.seconds, text, "silent")
            man.write(json.dumps({"file": f.name, "ref": text, "mode": "silent", "prompted": False}) + "\n"); man.flush()
    print(f"\nsession → {out}\nnext: .venv/bin/python -m tacit_vsr.eval_session {out}")


if __name__ == "__main__":
    main()
