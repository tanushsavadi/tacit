"""Non-articulation probe for phrase mode: the still segment of each recorded clip AFTER lip motion ends (≥ 1.0 s,
starting 300 ms after the motion offset) is real footage of the user's resting face. Phrase mode must REJECT it.
Motion bounds: eval/live_sim.motion_bounds (FaceMesh lip aperture). Smiles/swallows are NOT covered (not recorded).
    .venv/bin/python -m eval.rest_probe --session data/webcam/<dir> [--session ...]
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import json
import time
from pathlib import Path

import torch

from tacit_vsr import engine, video
from tacit_vsr.transcribe import recognize_clip

from .live_sim import motion_bounds


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", required=True)
    a = ap.parse_args()
    eng, crop = engine.VSREngine("mps" if torch.backends.mps.is_available() else "cpu"), video.MouthCropper()
    total = fa = raw = 0
    for s in a.session:
        d = Path(s)
        for l in open(d / "manifest.jsonl"):
            it = json.loads(l)
            clip = video.decode_clip((d / it["file"]).read_bytes())
            b = motion_bounds(crop(clip.frames).aperture, 25.0)
            if not b:
                continue
            start = int((b[1] + 300) / 40)
            if len(clip.frames) - start < 25:
                continue
            rest = video.DecodedClip(clip.frames[start:], 25.0, len(clip.frames) - start, (len(clip.frames) - start) * 40.0, 0.0, 0.0)
            r = recognize_clip(eng, crop, rest, time.perf_counter())  # the live service's exact path, gates included
            ph = r.get("phrase") or {}
            shown = r.get("text") is not None
            total += 1; fa += int(bool(ph.get("accepted"))); raw += int(shown)
            print(f"{d.name[:16]} {it['file']:18s} rest {(len(clip.frames) - start) * 40:4d} ms  "
                  f"{('RAW SHOWN ' + repr(r['text'])) if shown else 'abstained: ' + r.get('error', '')!s:48s} "
                  f"phrase {'ACCEPT ' + repr(ph.get('phrase')) if ph.get('accepted') else '-'}")
    print(f"\nresting-face segments: {total}; open-vocabulary text SHOWN {raw}/{total}; phrase FALSE ACCEPTS {fa}/{total}")


if __name__ == "__main__":
    main()
