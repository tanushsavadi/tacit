"""Feature dump for designing a stricter phrase-acceptance rule on DEVELOPMENT data only.

For every item it runs the live service's exact path (`recognize_clip`: pre-decode gate → fast beam → phrase rule v1)
and records the evidence a stricter rule could use:
  - free open-vocabulary hypothesis and its attention/CTC log-prob per token (absolute evidence),
  - word agreement between the free hypothesis and the best phrase,
  - phrase v1 margin / garbage gap / decision,
  - lip-motion statistics (aperture/width range, aperture oscillation peaks ≈ syllable-like movements).
Item kinds:
  utt_in    whole clip, reference IS in the phrase list (must be accepted correctly or rejected)
  utt_out   whole clip, reference NOT in the list (must be rejected) — own sentences + CREMA-D
  rest      still face after the last lip motion (≥ 1 s)            (must be rejected)
  tail      the last 0.9 s of motion + settling (mouth closing/relaxing, not a sentence) (must be rejected)
  head      0.9 s around motion onset (lips parting, first syllable only)                  (must be rejected)
`tail`/`head` are the closest proxies in existing recordings to short non-sentence mouth motion. They are NOT smiles:
smile/swallow/nod recordings do not exist yet, so no human non-speech false-positive rate is claimed from this.
    .venv/bin/python -m eval.phrase_rule_probe --session data/webcam/<s> [...] [--cremad] [--out FILE]
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch

from tacit_vsr import config, engine, video
from tacit_vsr.phrases import PHRASES
from tacit_vsr.transcribe import recognize_clip

from .live_sim import motion_bounds
from .sweep_decode import items_for

NORM_SET = {engine.normalize_text(p) for p in PHRASES}


def aperture_peaks(aperture: list[float], fps: float = 25.0) -> int:
    """Count syllable-like opening peaks: local maxima of the smoothed aperture with ≥ 0.03 IOD prominence."""
    a = np.convolve(np.asarray(aperture, float), np.ones(3) / 3, mode="same")
    peaks, last_min, rising = 0, a[0] if len(a) else 0.0, False
    for i in range(1, len(a)):
        if a[i] > a[i - 1]:
            rising = True
        elif rising and a[i] < a[i - 1]:
            if a[i - 1] - last_min >= 0.03:
                peaks += 1
                last_min = a[i]
            rising = False
        last_min = min(last_min, a[i])
    return peaks


def sub(clip: video.DecodedClip, a: int, b: int) -> video.DecodedClip:
    a, b = max(0, a), min(len(clip.frames), b)
    return video.DecodedClip(clip.frames[a:b], 25.0, b - a, (b - a) * 40.0, 0.0, 0.0)


def row(eng, crop, clip, kind: str, ref: str | None, meta: dict) -> dict:
    r = recognize_clip(eng, crop, clip, time.perf_counter())
    tr = crop(clip.frames)
    ph = r.get("phrase") or {}
    g = r.get("gate") or {}
    free = r.get("text")
    fw, pw = set((free or "").split()), set((ph.get("phrase") or "").split())
    return {**meta, "kind": kind, "ref": ref, "frames": len(clip.frames), "error": r.get("error"), "free": free,
            "n_tokens": r.get("n_tokens"), "att": g.get("att_per_token"), "ctc": g.get("ctc_per_token"),
            "nbest_margin": g.get("nbest_margin_per_token"), "aperture_range": r.get("aperture_range"),
            "width_range": r.get("width_range"), "peaks": aperture_peaks(tr.aperture) if tr.aperture else 0,
            "phrase": ph.get("phrase"), "v1_accept": bool(ph.get("accepted")), "margin": ph.get("margin"),
            "gap": ph.get("garbageGap"), "overlap": len(fw & pw) / max(len(pw), 1) if pw else 0.0,
            "correct": bool(ref and ph.get("phrase") == ref)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", default=[])
    ap.add_argument("--cremad", action="store_true")
    ap.add_argument("--out", default=str(config.DATA_DIR / "eval" / "phrase_rule_probe.jsonl"))
    a = ap.parse_args()
    eng, crop = engine.VSREngine("mps" if torch.backends.mps.is_available() else "cpu"), video.MouthCropper()
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    out = open(a.out, "w")
    sets = [(Path(s).name, Path(s)) for s in a.session] + ([("cremad", None)] if a.cremad else [])
    for set_name, session in sets:
        for path, ref, group in items_for(session):
            clip = video.decode_clip(path.read_bytes())
            nref = engine.normalize_text(ref)
            meta = {"set": set_name, "file": path.name, "group": group}
            rows = [row(eng, crop, clip, "utt_in" if nref in NORM_SET else "utt_out", nref, meta)]
            if session is not None:  # sub-segments only from the user's own webcam sessions
                tr = crop(clip.frames)
                b = motion_bounds(tr.aperture, 25.0) if tr.aperture else None
                if b:
                    on, off = int(b[0] / 40), int(b[1] / 40)
                    if len(clip.frames) - (off + 8) >= 25:
                        rows.append(row(eng, crop, sub(clip, off + 8, len(clip.frames)), "rest", None, meta))
                    rows.append(row(eng, crop, sub(clip, off - 15, off + 8), "tail", None, meta))
                    rows.append(row(eng, crop, sub(clip, on - 4, on + 19), "head", None, meta))
            for r in rows:
                out.write(json.dumps(r) + "\n"); out.flush()
                print(f"{set_name[:14]} {path.name:18s} {r['kind']:7s} {r['frames']:3d}f free {r['free']!r:42.42s} att {r['att']} "
                      f"phrase {r['phrase']!r} v1 {'ACCEPT' if r['v1_accept'] else '-'} ovl {r['overlap']:.2f} peaks {r['peaks']}", flush=True)


if __name__ == "__main__":
    main()
