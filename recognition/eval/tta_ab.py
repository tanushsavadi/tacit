"""Flip test-time augmentation A/B (development data). Same mouth crop per clip; only the encoder input differs:
  base   production: encode(x) → fast beam (beam 10, CTC 0.1, no LM)
  flip   mean(encode(x), encode(horizontal flip of x)) → same decoder
Auto-AVSR trains with horizontal-flip augmentation, so the flipped mouth is in-distribution. Pre-registered decision
rule (written before the first run): adopt only if WER improves on CREMA-D (independent speakers) AND does not worsen
the own SILENT clips; otherwise keep production. Text-only output; faces stay local.
    .venv/bin/python -m eval.tta_ab --session data/webcam/<s> [...] [--cremad]
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import json
import statistics
import time
from pathlib import Path

import torch

from tacit_vsr import config, engine, video
from tacit_vsr.transcribe import wer

from .sweep_decode import items_for, strict


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", default=[])
    ap.add_argument("--cremad", action="store_true")
    ap.add_argument("--out", default=str(config.DATA_DIR / "eval" / "tta_ab.jsonl"))
    a = ap.parse_args()
    eng, crop = engine.VSREngine("mps" if torch.backends.mps.is_available() else "cpu"), video.MouthCropper()
    out = open(a.out, "w")
    sets = [(Path(s).name, Path(s)) for s in a.session] + ([("cremad", None)] if a.cremad else [])
    agg: dict = {}
    for set_name, session in sets:
        for path, ref, group in items_for(session):
            clip = video.decode_clip(path.read_bytes())
            track = crop(clip.frames)
            if track.roi is None:
                continue
            x = video.roi_to_tensor(track.roi)
            r = strict(ref)
            with torch.no_grad():
                t = time.perf_counter(); e0 = eng.encode(x); ms0 = (time.perf_counter() - t) * 1000
                t = time.perf_counter(); e1 = eng.encode(torch.flip(x, dims=[-1])); ms1 = (time.perf_counter() - t) * 1000
                hyp = {"base": eng.nbest(e0, config.NBEST), "flip": eng.nbest((e0 + e1) / 2, config.NBEST)}
            rec = {"set": set_name, "file": path.name, "group": group, "ref": r, "enc_ms": round(ms0), "flip_extra_ms": round(ms1)}
            for k, nb in hyp.items():
                h = strict(eng.detokenize(nb[0][1])) if nb else ""
                e, n = wer(r, h)
                rec[k] = h
                for g in {f"{set_name[:20]}/{group}", f"ALL/{'silent' if group.startswith('silent') else group}"}:
                    s = agg.setdefault((g, k), {"e": 0, "n": 0, "exact": 0, "c": 0})
                    s["e"] += e; s["n"] += n; s["exact"] += e == 0; s["c"] += 1
            out.write(json.dumps(rec) + "\n"); out.flush()
            print(f"{set_name[:14]} {path.name:20s} base {rec['base']!r:44.44s} flip {rec['flip']!r:44.44s}", flush=True)
    print()
    for (g, k), s in sorted(agg.items()):
        print(f"{g:40s} {k:5s} WER {s['e']:3d}/{s['n']:3d} = {s['e'] / max(s['n'], 1):.3f}  exact {s['exact']:2d}/{s['c']:2d}", flush=True)


if __name__ == "__main__":
    main()
