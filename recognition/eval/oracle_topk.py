"""Oracle top-K: is the reference sentence anywhere in the decoder's N-best list? (upper bound for any reranker)

Candidates come ONLY from the visual decoder (fast beam, joint CTC/attention, optional LM fusion) — the reference is
used solely to score them afterwards, never to create or edit a candidate. Development data only.
    .venv/bin/python -m eval.oracle_topk --session data/webcam/<s> [...] [--cremad] [--lm 0.0]
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
from tacit_vsr.fast_beam import beam_search
from tacit_vsr.transcribe import wer

from .lm_ab import load_lm, rss_mb
from .sweep_decode import items_for, strict

KS = (1, 3, 5, 10)
BEAMS = (10, 20)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", default=[])
    ap.add_argument("--cremad", action="store_true")
    ap.add_argument("--lm", type=float, default=0.0, help="LM shallow-fusion weight (0 = production decoder)")
    ap.add_argument("--out", default=str(config.DATA_DIR / "eval" / "oracle_topk.jsonl"))
    a = ap.parse_args()
    eng, crop = engine.VSREngine("mps" if torch.backends.mps.is_available() else "cpu"), video.MouthCropper()
    lm = load_lm(eng.odim) if a.lm > 0 else None
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    out = open(a.out, "a")
    sets = [(Path(s).name, Path(s)) for s in a.session] + ([("cremad", None)] if a.cremad else [])
    for set_name, session in sets:
        agg: dict = {}
        for path, ref, group in items_for(session):
            clip = video.decode_clip(path.read_bytes())
            track = crop(clip.frames)
            if track.roi is None:
                continue
            enc = eng.encode(video.roi_to_tensor(track.roi))
            r = strict(ref)
            rec = {"set": set_name, "file": path.name, "group": group, "lm": a.lm, "ref": r}
            for beam in BEAMS:
                t = time.perf_counter()
                nb = beam_search(eng.model, lm, enc, beam=beam, ctc_weight=0.1, lm_weight=a.lm, nbest=max(KS))
                ms = (time.perf_counter() - t) * 1000
                hyps = [strict(eng.detokenize(ids)) for _, ids in nb]
                rec[f"b{beam}"] = hyps
                errs = [wer(r, h)[0] for h in hyps] or [len(r.split())]
                n = len(r.split())
                for g in {group, "ALL"}:
                    for k in KS:
                        s = agg.setdefault((g, beam, k), {"e": 0, "n": 0, "exact": 0, "c": 0, "ms": [], "got": 0})
                        best = min(errs[:k])
                        s["e"] += best; s["n"] += n; s["exact"] += best == 0; s["c"] += 1; s["got"] += min(k, len(hyps))
                        s["ms"].append(ms)
            out.write(json.dumps(rec) + "\n"); out.flush()
        print(f"\n== {set_name} (LM weight {a.lm})")
        for (g, beam, k), s in sorted(agg.items()):
            print(f"{g:16s} beam {beam:2d} top-{k:<2d} oracle WER {s['e']:3d}/{s['n']:3d} = {s['e'] / max(s['n'], 1):.3f}  "
                  f"ref in top-K {s['exact']:2d}/{s['c']:2d}  avg cands {s['got'] / s['c']:.1f}  "
                  f"decode p50 {statistics.median(s['ms']):.0f} ms", flush=True)
    print(f"peak RSS {rss_mb():.0f} MB")


if __name__ == "__main__":
    main()
