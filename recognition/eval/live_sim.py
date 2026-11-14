"""Does the LIVE path lose accuracy relative to offline whole-clip decoding? Replays recorded session clips the way the
browser sends them (downscaled to 640 px wide, JPEG quality 80, real per-frame timestamps → frames_from_jpegs, the
service's resampler) and cuts utterance windows around the detected lip motion with different pre/post padding.
Motion onset/offset here come from the FaceMesh lip aperture (an approximation of the browser's blendshape velocity
endpointer, not the same detector). Faces stay local; prints text only.
    .venv/bin/python -m eval.live_sim --session data/webcam/<dir> [--session ...]
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np
import torch

from tacit_vsr import engine, video
from tacit_vsr.transcribe import recognize_clip, wer

from .sweep_decode import expand, items_for, strict

# (label, pre-roll ms before motion onset, post ms after motion offset); None = whole clip
WINDOWS = [("whole-clip", None, None), ("live-like 160/480", 160, 480), ("pad 400/480", 400, 480), ("pad 800/800", 800, 800)]


def motion_bounds(aperture: list[float], fps: float) -> tuple[float, float] | None:
    a = np.asarray(aperture, dtype=float)
    if len(a) < 10:
        return None
    vel = np.abs(np.diff(np.convolve(a, np.ones(3) / 3, mode="same"), prepend=a[0])) * fps
    vel = np.convolve(vel, np.ones(5) / 5, mode="same")
    thr = np.percentile(vel, 20) + 0.25 * (np.percentile(vel, 95) - np.percentile(vel, 20))
    idx = np.where(vel > thr)[0]
    return (idx[0] / fps * 1000, idx[-1] / fps * 1000) if len(idx) else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", required=True)
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    a = ap.parse_args()
    eng, crop = engine.VSREngine(a.device), video.MouthCropper()
    for s in a.session:
        session = Path(s)
        agg: dict = {}
        for path, ref, group in items_for(session):
            src = video.decode_clip(path.read_bytes(), fps=30.0)  # ~source rate, for the JPEG replay
            frames = [cv2.resize(f, (640, round(f.shape[0] * 640 / f.shape[1])), interpolation=cv2.INTER_AREA) for f in src.frames]
            jpegs = [cv2.imencode(".jpg", cv2.cvtColor(f, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes() for f in frames]
            times = [i * 1000 / 30.0 for i in range(len(jpegs))]
            full = crop(video.frames_from_jpegs(times, jpegs).frames)
            b = motion_bounds(full.aperture, 25.0)
            row = {"file": path.name, "group": group, "ref": engine.normalize_text(ref), "motion_ms": [round(x) for x in b] if b else None}
            for label, pre, post in WINDOWS:
                if pre is None:
                    sel = list(range(len(jpegs)))
                elif b is None:
                    row[label] = None; continue
                else:
                    t0, t1 = b[0] - pre, b[1] + post
                    sel = [i for i, t in enumerate(times) if t0 <= t <= t1]
                clip = video.frames_from_jpegs([times[i] for i in sel], [jpegs[i] for i in sel])
                out = recognize_clip(eng, crop, clip, time.perf_counter())
                hyp = out.get("text") or ""
                row[label] = hyp
                es, n = wer(strict(ref), strict(hyp)); en, nn = wer(expand(ref), expand(hyp))
                for g in (group, "silent_all" if group.startswith("silent") else None, "ALL"):
                    if g:
                        x = agg.setdefault((g, label), [0, 0, 0, 0, 0]); x[0] += es; x[1] += n; x[2] += en; x[3] += nn; x[4] += int(en == 0)
            print(json.dumps(row), flush=True)
        print(f"\n== {session.name} (live replay: 640 px, JPEG q80)")
        for (g, label), (es, n, en, nn, ex) in sorted(agg.items()):
            print(f"{g:16s} {label:18s} strict {es:>3d}/{n:<3d}={es / n:.3f}  norm {en:>3d}/{nn:<3d}={en / nn:.3f}  exact(norm) {ex}")


if __name__ == "__main__":
    main()
