"""Speaker-personalisation feasibility (LipLearner-style few-shot enrolment) on EXISTING development recordings.

Question: if the user enrols each phrase a few times, does matching their own templates beat the generic model's
closed-set scoring? Design fixed before the first run:
  - phrases = the 10 prompts recorded in ≥ 2 of sessions A/B/C; every clip of them is a test item;
  - templates = clips of the same phrases from the OTHER sessions only (cross-session: different lighting/day);
  - personal  = nearest template by DTW over Auto-AVSR encoder frames (cosine distance, path-length normalised);
  - baseline  = the model's own joint attention+CTC score over the same 10 phrases (no enrolment);
  - reported separately for silent and voiced test clips. No threshold, no rejection, nothing tuned;
  - --negatives: unlisted own sentences + CREMA-D (unseen speakers, voiced) → their nearest-template DTW distance vs
    the genuine items' (separability only; no threshold is chosen here).
Tiny n, one speaker, phrases repeated across sessions: a feasibility signal, NOT a validation.
    .venv/bin/python -m eval.enroll_knn --session data/webcam/<A> --session data/webcam/<B> --session data/webcam/<C>
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import collections
import json
from pathlib import Path

import numpy as np
import torch

from tacit_vsr import config, engine, video

from .sweep_decode import group_of


def dtw(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine-distance DTW, normalised by path length. a: (n, d), b: (m, d), rows L2-normalised."""
    c = 1.0 - a @ b.T
    n, m = c.shape
    d = np.full((n + 1, m + 1), np.inf)
    steps = np.zeros((n + 1, m + 1))
    d[0, 0] = 0.0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            k = min((d[i - 1, j - 1], 0), (d[i - 1, j], 1), (d[i, j - 1], 2))
            pi, pj = ((i - 1, j - 1), (i - 1, j), (i, j - 1))[k[1]]
            d[i, j] = c[i - 1, j - 1] + k[0]
            steps[i, j] = steps[pi, pj] + 1
    return float(d[n, m] / steps[n, m])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", required=True)
    ap.add_argument("--negatives", action="store_true")
    ap.add_argument("--out", default=str(config.DATA_DIR / "eval" / "enroll_knn.jsonl"))
    a = ap.parse_args()
    eng, crop = engine.VSREngine("mps" if torch.backends.mps.is_available() else "cpu"), video.MouthCropper()
    items = []
    for s in a.session:
        for l in open(Path(s) / "manifest.jsonl"):
            it = json.loads(l)
            items.append({"session": Path(s).name, "file": Path(s) / it["file"], "ref": engine.normalize_text(it["ref"]), "group": group_of(it)})
    sessions_of = collections.defaultdict(set)
    for it in items:
        sessions_of[it["ref"]].add(it["session"])
    phrases = sorted(r for r, ss in sessions_of.items() if len(ss) >= 2)
    negatives = [it for it in items if it["ref"] not in phrases] if a.negatives else []
    if a.negatives:
        from .sweep_decode import HERE
        negatives += [{"session": "cremad", "file": HERE / c["file"], "ref": engine.normalize_text(c["text"]), "group": "cremad"}
                      for c in json.load(open(HERE / "cremad_manifest.json"))]
    items = [it for it in items if it["ref"] in phrases]
    print(f"{len(phrases)} phrases, {len(items)} clips")
    feats = {}
    for it in items + negatives:
        clip = video.decode_clip(it["file"].read_bytes())
        track = crop(clip.frames)
        if track.roi is None:
            continue
        with torch.no_grad():
            enc = eng.encode(video.roi_to_tensor(track.roi))
            scores = eng.score_texts(enc, phrases)
        f = enc.numpy()[::2]  # 2× temporal downsampling keeps DTW cheap
        feats[it["file"]] = f / np.linalg.norm(f, axis=1, keepdims=True)
        it["baseline"] = max(scores, key=lambda c: c.length_norm).norm_text
    out = open(a.out, "w")
    agg = collections.defaultdict(lambda: {"n": 0, "base": 0, "pers": 0, "no_template": 0})
    for it in items:
        if it["file"] not in feats:
            continue
        templates = [t for t in items if t["session"] != it["session"] and t["file"] in feats]
        if not any(t["ref"] == it["ref"] for t in templates):
            agg[it["group"].split("_")[0]]["no_template"] += 1
            continue
        dists = [(dtw(feats[it["file"]], feats[t["file"]]), t) for t in templates]
        dist, best = min(dists, key=lambda x: x[0])
        it["personal"], it["dist"] = best["ref"], round(dist, 4)
        for g in (it["group"].split("_")[0], "ALL"):
            s = agg[g]; s["n"] += 1; s["base"] += it["baseline"] == it["ref"]; s["pers"] += it["personal"] == it["ref"]
        out.write(json.dumps({k: str(v) if isinstance(v, Path) else v for k, v in it.items()}) + "\n")
        print(f"{it['session'][:15]} {it['group']:16s} REF {it['ref']!r:34s} base {it['baseline'] == it['ref']!s:5s} personal {it['personal']!r}", flush=True)
    neg_d = []
    for it in negatives:
        if it["file"] not in feats:
            continue
        dist = min(dtw(feats[it["file"]], feats[t["file"]]) for t in items if t["file"] in feats)
        neg_d.append((it["group"], round(dist, 4)))
        out.write(json.dumps({"negative": True, "session": it["session"], "file": str(it["file"]), "group": it["group"], "dist": round(dist, 4)}) + "\n")
    print()
    if neg_d:
        gen = sorted(it["dist"] for it in items if "dist" in it)
        print(f"genuine nearest-template distance: min {gen[0]:.3f} median {np.median(gen):.3f} max {gen[-1]:.3f} (n={len(gen)})")
        for g in sorted({x[0] for x in neg_d}):
            d = sorted(x[1] for x in neg_d if x[0] == g)
            print(f"negatives {g:16s}: min {d[0]:.3f} median {np.median(d):.3f} (n={len(d)}); below the max genuine distance: {sum(x <= gen[-1] for x in d)}")
    for g, s in sorted(agg.items()):
        print(f"{g:8s} n={s['n']:2d}  generic closed-set {s['base']}/{s['n']}  personal DTW 1-NN {s['pers']}/{s['n']}  (no cross-session template: {s['no_template']})")


if __name__ == "__main__":
    main()
