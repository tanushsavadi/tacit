"""Live-vs-offline preprocessing A/B on recorded sessions: same clip, same model, only the frame path differs.
offline = mp4 decoded straight to 25 fps; jpeg* = 30 fps frames re-encoded as JPEG (what the browser uploads) and
resampled by the service (frames_from_jpegs). Text-only output.
    .venv/bin/python -m eval.preproc_ab --session data/webcam/<dir> [...]
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import time
from pathlib import Path

import cv2
import torch

from tacit_vsr import engine, video
from tacit_vsr.transcribe import recognize_clip, wer

from .sweep_decode import expand, items_for

VARIANTS = [("offline", None, None), ("1280 q95", 1280, 95), ("640 q95", 640, 95), ("640 q80 (live)", 640, 80)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", required=True)
    a = ap.parse_args()
    eng, crop = engine.VSREngine("mps" if torch.backends.mps.is_available() else "cpu"), video.MouthCropper()
    agg: dict = {}
    for s in a.session:
        for path, ref, group in items_for(Path(s)):
            data = path.read_bytes()
            src = video.decode_clip(data, fps=30.0)
            row = []
            for name, width, q in VARIANTS:
                if width is None:
                    clip = video.decode_clip(data)
                else:
                    fr = [cv2.resize(f, (width, round(f.shape[0] * width / f.shape[1])), interpolation=cv2.INTER_AREA) if f.shape[1] != width else f for f in src.frames]
                    jp = [cv2.imencode(".jpg", cv2.cvtColor(f, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])[1].tobytes() for f in fr]
                    clip = video.frames_from_jpegs([i * 1000 / 30 for i in range(len(jp))], jp)
                hyp = recognize_clip(eng, crop, clip, time.perf_counter()).get("text") or ""
                e, n = wer(expand(ref), expand(hyp))
                x = agg.setdefault(name, [0, 0, 0]); x[0] += e; x[1] += n; x[2] += int(e == 0)
                row.append(f"{name}: {hyp!r}")
            print(f"{Path(s).name[-12:]} {path.name:18s} {group:15s} REF {engine.normalize_text(ref)!r} | " + " | ".join(row), flush=True)
    print()
    for name, (e, n, ex) in agg.items():
        print(f"{name:16s} norm WER {e}/{n} = {e / n:.3f}  exact {ex}")


if __name__ == "__main__":
    main()
