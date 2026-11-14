"""Record webcam clips for VSR evaluation. VIDEO ONLY — the audio device is never opened ("<cam>:none").
    .venv/bin/python record_webcam.py --name s1 [--modes silent,voiced] [--free 3] [--camera N]
    .venv/bin/python record_webcam.py --name t1 --modes none --free 5   only your own sentences, silent
    .venv/bin/python record_webcam.py --check      lighting/framing check only (records 2 s, keeps nothing)
    .venv/bin/python record_webcam.py --name adapt1 --modes silent --prompts prompts/adapt_v1.txt --free 0 [--limit 50]
    .venv/bin/python record_webcam.py --name ctrl1 --modes none --free 0 --nonspeech 2   smile/swallow/listen controls
    .venv/bin/python record_webcam.py --name diag1 --prompts prompts/diagnostic_v1.txt --paired --free 0
        paired diagnostic: each sentence spoken normally and mouthed silently back to back (random order per pair)
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
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

PROMPTS = [
    "I would like some water please", "can you call my mother", "I am feeling much better today",
    "what time is the appointment", "please turn on the lights", "thank you for coming",
    "I need help with this", "I don't understand", "see you tomorrow morning", "how are you doing",
]


VALID_MODES = ("silent", "voiced")
# Non-speech controls (mode "nonspeech", ref ""): the recogniser must NOT show text for these.
NONSPEECH = {
    "smile": "SMILE (no words): a natural smile, hold it, relax",
    "swallow": "SWALLOW (no words), then rest your face",
    "listen": "LISTEN (no words): nod or react as if someone is talking to you",
}


def read_prompts(path: str) -> list[str]:
    """One prompt per line; blank lines and '#' comments ignored."""
    return [l.strip() for l in open(path, encoding="utf8") if l.strip() and not l.lstrip().startswith("#")]


def parse_modes(text: str) -> list[str]:
    """'silent,voiced' → ['silent', 'voiced']; '' / 'none' → [] (no predefined prompts). Unknown modes are an error
    (an empty or misspelt mode used to record every prompt with a blank label)."""
    t = text.strip().lower()
    if t in ("", "none"):
        return []
    modes = [m.strip() for m in t.split(",")]
    bad = [m for m in modes if m not in VALID_MODES]
    if bad:
        raise ValueError(f"unknown mode(s) {bad}; use any of {list(VALID_MODES)}, or '' / none for no predefined prompts")
    return list(dict.fromkeys(modes))


def plan(modes: list[str], free: int, prompts: list[str] = PROMPTS, nonspeech: int = 0) -> list[tuple[str, str]]:
    """(prompt, mode) pairs for the predefined prompts plus `nonspeech` repetitions of each non-speech control
    (prompt = control key, mode "nonspeech"); shuffled by the caller. Raises if nothing would be recorded."""
    if free < 0 or nonspeech < 0:
        raise ValueError("--free and --nonspeech must be ≥ 0")
    items = [(p, m) for p in prompts for m in modes] + [(k, "nonspeech") for k in NONSPEECH for _ in range(nonspeech)]
    if not items and free == 0:
        raise ValueError("nothing to record: give --modes and/or --free N")
    return items


def plan_pairs(prompts: list[str], rng: random.Random | None = None) -> list[tuple[str, str, int]]:
    """(prompt, mode, pair) with each prompt's voiced and silent takes ADJACENT (same light, seconds apart). Pair order is
    shuffled and the order inside each pair is random, so neither mode is systematically first (fatigue/practice)."""
    if not prompts:
        raise ValueError("no prompts to pair")
    rng = rng or random.Random()
    order = list(prompts)
    rng.shuffle(order)
    out = []
    for k, p in enumerate(order, 1):
        modes = ["voiced", "silent"]
        rng.shuffle(modes)
        out += [(p, m, k) for m in modes]
    return out


def remaining(items: list[tuple[str, str]], manifest_lines: list[str]) -> list[tuple[str, str]]:
    """Items not yet recorded in an existing session (matched on prompt text + mode), for --resume."""
    done = {(json.loads(l).get("ref"), json.loads(l).get("mode")) for l in manifest_lines if l.strip()}
    return [(p, m) for p, m in items if (p, m) not in done]


def camera_index(name_hint: str | None) -> str:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], capture_output=True, text=True).stderr
    video = out.split("AVFoundation video devices:")[1].split("AVFoundation audio devices:")[0]
    devs = re.findall(r"\[(\d+)\] (.+)", video)
    for i, n in devs:
        if (name_hint and name_hint.lower() in n.lower()) or (not name_hint and "capture screen" not in n.lower()):
            print(f"camera: [{i}] {n}")
            return i
    raise SystemExit(f"no camera found:\n{video}")


def record(cam: str, path: Path, seconds: float, prompt: str, mode: str, lead: float = 1.5) -> None:
    """`lead` s after starting the camera "GO" is shown; the clip is extended by the same margin beyond the original 1 s,
    so the first word is not lost to camera start-up (diag1: one take opened mid-word, one began with a black frame)."""
    if mode == "nonspeech":
        print(f"\n  >>> {prompt}")
    else:
        how = "ARTICULATE SILENTLY (no voice, no whisper)" if mode == "silent" else "SPEAK NORMALLY"
        print(f"\n  >>> {how}:  \"{prompt}\"")
    input("      press Enter, wait for GO …")
    p = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-pixel_format", "nv12", "-framerate", "30", "-video_size", "1280x720",
                          "-i", f"{cam}:none", "-t", str(seconds + max(0.0, lead - 1.0)), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-an", "-y", str(path)])
    time.sleep(lead)
    print("      GO")
    p.wait()
    print(f"      saved {path.name}" if p.returncode == 0 and path.exists() else f"      FAILED (ffmpeg exit {p.returncode}) — check Camera permission for this terminal app")


# Mouth-ROI grey level of the CREMA-D clips that decode at ~5% WER: 130-160. The first s1 session (backlit by a
# window) measured 40-47 and decoded at 58% WER even when VOICED; post-hoc brightening did not recover it.
MIN_BRIGHTNESS = 90.0
MIN_IOD_PX = 35.0


def capture_check(cam: str) -> bool:
    """Record 2 s, measure the mouth crop the model will see, print PASS/WARN with advice. The clip is deleted."""
    import os
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    from tacit_vsr import video
    with tempfile.TemporaryDirectory() as td:
        f = Path(td) / "check.mp4"
        print("lighting check: look at the camera and say nothing for 2 s …")
        err = ""
        for _ in range(3):  # opening the camera right after another open (device listing) can fail transiently
            r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-pixel_format", "nv12", "-framerate", "30", "-video_size", "1280x720",
                                "-i", f"{cam}:none", "-t", "2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-an", "-y", str(f)],
                               capture_output=True, text=True)
            if r.returncode == 0 and f.exists() and f.stat().st_size > 0:
                break
            err = r.stderr.strip().splitlines()[-1:] or [f"exit {r.returncode}"]
            time.sleep(1.0)
        else:
            print(f"FAIL  camera capture failed ({err[0]}) — check Camera permission for this terminal app / close other camera users")
            return False
        track = video.MouthCropper()(video.decode_clip(f.read_bytes()).frames)
    if track.roi is None:
        print("FAIL  no face found — sit facing the camera, whole face in view")
        return False
    ok = True
    b, iod = track.roi_brightness or 0.0, track.iod_px or 0.0
    if b < MIN_BRIGHTNESS:
        ok = False
        print(f"WARN  mouth too dark: brightness {b:.0f} (need ≥ {MIN_BRIGHTNESS:.0f}; good clips 130-160). Put the light IN FRONT of you "
              "(face the window or a lamp); never sit with a bright window behind you.")
    else:
        print(f"PASS  mouth brightness {b:.0f}")
    if iod < MIN_IOD_PX:
        ok = False
        print(f"WARN  face too small: {iod:.0f} px between the eyes (need ≥ {MIN_IOD_PX:.0f}) — move closer to the camera")
    else:
        print(f"PASS  face size {iod:.0f} px between the eyes")
    if track.face_fraction < 0.95:
        ok = False
        print(f"WARN  face tracked in only {track.face_fraction:.0%} of frames — keep your whole face in view")
    return ok


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="s1")
    ap.add_argument("--modes", default="silent,voiced", help="comma list of silent,voiced; '' or none = no predefined prompts")
    ap.add_argument("--free", type=int, default=3, help="extra prompts you choose and type yourself")
    ap.add_argument("--seconds", type=float, default=5.5)
    ap.add_argument("--camera", default=None, help="camera name substring (default: first non-screen device)")
    ap.add_argument("--check", action="store_true", help="lighting/framing check only")
    ap.add_argument("--skip-check", action="store_true", help="record even if the lighting check warns")
    ap.add_argument("--prompts", default=None, help="prompt file (one sentence per line) instead of the 10 built-in prompts")
    ap.add_argument("--limit", type=int, default=0, help="record a random subset of N prompts from --prompts")
    ap.add_argument("--resume", default=None, help="continue an interrupted session dir: records only the prompts not yet "
                    "in its manifest (same --prompts/--modes as the original run)")
    ap.add_argument("--paired", action="store_true", help="record every prompt voiced AND silent back to back "
                    "(paired diagnostic; ignores --modes)")
    ap.add_argument("--nonspeech", type=int, default=0, help="also record N repetitions of each non-speech control "
                    f"({', '.join(NONSPEECH)})")
    a = ap.parse_args()
    if a.resume and a.paired:
        raise SystemExit("error: --resume does not support --paired sessions")
    if a.resume and not (Path(a.resume) / "manifest.jsonl").exists():
        raise SystemExit(f"error: no manifest.jsonl in {a.resume}")
    if not a.check:  # validate before touching the camera or creating a session folder
        try:
            modes = parse_modes(a.modes)
            prompts = read_prompts(a.prompts) if a.prompts else PROMPTS
            if a.limit:
                prompts = random.sample(prompts, min(a.limit, len(prompts)))
            pairs = plan_pairs(prompts) if a.paired else None
            items = [(p, m) for p, m, _ in pairs] if pairs else plan(modes, a.free, prompts, a.nonspeech)
        except ValueError as e:
            raise SystemExit(f"error: {e}")
        print(f"plan: {len(items)} predefined clips ({', '.join(modes) or 'none'}{', non-speech controls' if a.nonspeech else ''}) "
              f"+ {a.free} of your own sentences (silent)")
    cam = camera_index(a.camera)
    while not capture_check(cam):
        if a.check or a.skip_check:
            break
        if input("Fix the lighting/position, then press Enter to re-check (or type 'skip' to record anyway): ").strip() == "skip":
            break
    if a.check:
        return
    if a.resume:
        out = Path(a.resume).resolve()
        lines = (out / "manifest.jsonl").read_text().splitlines()
        items = remaining(items, lines)
        start = len([l for l in lines if l.strip()])
        print(f"resuming {out.name}: {start} clips already recorded, {len(items)} to go")
    else:
        out = Path(__file__).resolve().parent / "data" / "webcam" / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{a.name}"
        start = 0
    out.mkdir(parents=True, exist_ok=True)
    if not a.paired:
        random.shuffle(items)
    print("Face the camera, normal lighting, mouth fully visible. Audio is NOT recorded.")
    with open(out / "manifest.jsonl", "a") as man:
        for k, (prompt, mode) in enumerate(items, start + 1):
            f = out / f"clip{k:02d}-{mode}.mp4"
            if mode == "nonspeech":
                record(cam, f, a.seconds, NONSPEECH[prompt], mode)
                man.write(json.dumps({"file": f.name, "ref": "", "mode": "nonspeech", "kind": prompt, "prompted": True}) + "\n")
            else:
                record(cam, f, a.seconds, prompt, mode)
                man.write(json.dumps({"file": f.name, "ref": prompt, "mode": mode, "prompted": True,
                                      **({"prompts": Path(a.prompts).name} if a.prompts else {}),
                                      **({"pair": pairs[k - 1][2]} if a.paired else {})}) + "\n")
            man.flush()
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
