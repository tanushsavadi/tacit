"""Closed-set (constrained-phrase) recognition: score every phrase of a FIXED list against the video with the model's
own joint attention+CTC score, pick the best, and accept only under the frozen rule in tacit_vsr/phrases.py (the SAME
code the live service runs). Thresholds committed (6dcc82b, 03:21 2026-11-14) before any webcam session; the phrase
list was written before this evaluation was first run and is not changed after seeing results.
Out-of-set clips (sentences not in the list) MUST be rejected: the user's own s1 sentences and all CREMA-D clips.
    .venv/bin/python -m eval.closed_set --session data/webcam/<dir> [--session ...] [--cremad]
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

from .sweep_decode import items_for

from tacit_vsr.phrases import PHRASES, RULE_VERSION, classify as phrase_classify


def classify(eng: engine.VSREngine, enc: torch.Tensor, check: bool = False) -> dict:
    nb = eng.nbest(enc, 1)
    free_ids = nb[0][1] if nb else []
    t = time.perf_counter()
    r = phrase_classify(eng, enc, free_ids)
    r["ms"] = (time.perf_counter() - t) * 1000
    r["free"] = eng.detokenize(free_ids)
    if check:  # batched scoring must equal per-phrase scoring
        one = {c.norm_text: c.length_norm for c in (eng.score_text(enc, p) for p in PHRASES)}
        bat = {c.norm_text: c.length_norm for c in eng.score_texts(enc, PHRASES)}
        r["max_abs_diff"] = max(abs(one[k] - bat[k]) for k in one)
    return r


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", default=[])
    ap.add_argument("--cremad", action="store_true")
    ap.add_argument("--check", action="store_true", help="also verify batched == per-phrase scores")
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    a = ap.parse_args()
    eng, crop = engine.VSREngine(a.device), video.MouthCropper()
    norm_set = {engine.normalize_text(p) for p in PHRASES}
    print(f"phrases {len(PHRASES)}; {RULE_VERSION}: margin ≥ {config.MIN_MARGIN}, garbage gap ≤ {config.MAX_GARBAGE_GAP}")
    sets = [(Path(s).name, Path(s)) for s in a.session] + ([("cremad", None)] if a.cremad else [])
    for name, session in sets:
        agg: dict = {}
        ms, diffs = [], []
        for path, ref, group in items_for(session):
            clip = video.decode_clip(path.read_bytes())
            track = crop(clip.frames)
            if track.roi is None:
                print(f"{path.name}: NO FACE"); continue
            r = classify(eng, eng.encode(video.roi_to_tensor(track.roi)), check=a.check)
            ms.append(r["ms"]); diffs.append(r.get("max_abs_diff", 0.0))
            nref = engine.normalize_text(ref)
            in_set = nref in norm_set
            top1 = r["phrase"] == nref
            for rule, acc in (("v1", r["accepted"]),):
                key = (group, "in-set" if in_set else "OUT-of-set", rule)
                s = agg.setdefault(key, {"n": 0, "top1": 0, "acc": 0, "acc_ok": 0, "acc_wrong": 0})
                s["n"] += 1; s["top1"] += int(top1); s["acc"] += int(acc)
                s["acc_ok"] += int(acc and top1); s["acc_wrong"] += int(acc and not top1)
            if session is not None or r["accepted"]:
                print(f"{group:15s} {path.name:18s} REF {nref!r:38s} BEST {r['phrase']!r:38s} {'ACCEPT' if r['accepted'] else 'reject':6s} "
                      f"{'✓' if top1 else '✗'} margin {r['margin']:.3f} gap {r['garbageGap']:.2f} free {r['free']!r} {r['reason'] or ''}")
        print(f"\n== {name}")
        print(f"phrase classify latency p50 {statistics.median(ms):.0f} ms, max {max(ms):.0f} ms" + (f"; batched vs per-phrase max |diff| {max(diffs):.2e}" if a.check else ""))
        for (g, kind, rule), s in sorted(agg.items()):
            if kind == "in-set":
                print(f"{rule} {g:16s} {kind:10s} n {s['n']:3d}  top-1 {s['top1']}/{s['n']}  accepted {s['acc']}/{s['n']} "
                      f"(correct {s['acc_ok']}, WRONG {s['acc_wrong']})")
            else:
                print(f"{rule} {g:16s} {kind:10s} n {s['n']:3d}  FALSE ACCEPTS {s['acc']}/{s['n']}  (must be rejected)")
        print()


if __name__ == "__main__":
    main()
