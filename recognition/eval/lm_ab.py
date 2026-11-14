"""A/B: language-model-free fast beam (production) vs shallow fusion with the pretrained Auto-AVSR subword LM.

The LM is `lm_en_subword` (16-layer transformer LM, same unigram5000 units as the VSR model; Amanvir/lm_en_subword
@ f4e39b6d…, the checkpoint Chaplin / SilentFlow / Lipflow use; same research/non-commercial terms as the VSR
weights). Each clip is cropped and encoded ONCE; only decoding varies. Development data only (webcam sessions A–C
and CREMA-D) — never the held-out live sentences.
    .venv/bin/python -m eval.lm_ab --session data/webcam/<s> [...] [--cremad] [--out FILE]
Outputs contain transcripts of private sessions: write them inside git-ignored data/ (default) or stdout.
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import json
import resource
import statistics
import sys
import time
from pathlib import Path

import torch

from tacit_vsr import config, engine, video
from tacit_vsr.fast_beam import beam_search
from tacit_vsr.transcribe import wer

from .sweep_decode import expand, items_for, strict

LM_DIR = config.THIRD_PARTY / "weights" / "lm_en_subword"
VARIANTS = {  # name: (beam, lm_weight)
    "base_b10": (10, 0.0), "lm0.1_b10": (10, 0.1), "lm0.2_b10": (10, 0.2), "lm0.3_b10": (10, 0.3),
    "lm0.5_b10": (10, 0.5), "lm0.3_b20": (20, 0.3),
}


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6  # macOS reports bytes


def load_lm(odim: int):
    if str(config.CHAPLIN_DIR) not in sys.path:
        sys.path.insert(0, str(config.CHAPLIN_DIR))
    from espnet.asr.asr_utils import get_model_conf, torch_load
    from espnet.nets.lm_interface import dynamic_import_lm
    args = get_model_conf(str(LM_DIR / "model.pth"), str(LM_DIR / "model.json"))
    lm = dynamic_import_lm(getattr(args, "model_module", "default"), args.backend)(odim, args)
    torch_load(str(LM_DIR / "model.pth"), lm)
    return lm.eval()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", default=[])
    ap.add_argument("--cremad", action="store_true")
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    ap.add_argument("--out", default=str(config.DATA_DIR / "eval" / "lm_ab.jsonl"))
    a = ap.parse_args()
    eng, crop = engine.VSREngine(a.device), video.MouthCropper()
    before = rss_mb()
    t = time.perf_counter()
    lm = load_lm(eng.odim)
    print(f"LM load {round((time.perf_counter() - t) * 1000)} ms; peak RSS {before:.0f} → {rss_mb():.0f} MB", flush=True)
    sets = [(Path(s).name, Path(s)) for s in a.session] + ([("cremad", None)] if a.cremad else [])
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    out = open(a.out, "w")
    for set_name, session in sets:
        agg: dict = {}
        for path, ref, group in items_for(session):
            clip = video.decode_clip(path.read_bytes())
            track = crop(clip.frames)
            if track.roi is None:
                continue
            enc = eng.encode(video.roi_to_tensor(track.roi))
            row = {"set": set_name, "file": path.name, "group": group, "ref": engine.normalize_text(ref)}
            for name, (beam, lw) in VARIANTS.items():
                t = time.perf_counter()
                nb = beam_search(eng.model, lm if lw else None, enc, beam=beam, ctc_weight=0.1, lm_weight=lw, nbest=3)
                ms = (time.perf_counter() - t) * 1000
                hyp = eng.detokenize(nb[0][1]) if nb else ""
                es, n = wer(strict(ref), strict(hyp))
                en, nn = wer(expand(ref), expand(hyp))
                row[name] = hyp
                for g in {group, "ALL", "silent_all" if group.startswith("silent") else group}:
                    s = agg.setdefault((g, name), {"e": 0, "n": 0, "en": 0, "nn": 0, "exact": 0, "k": 0, "ms": []})
                    s["e"] += es; s["n"] += n; s["en"] += en; s["nn"] += nn; s["exact"] += es == 0; s["k"] += 1
                    s["ms"].append(ms)
            out.write(json.dumps(row) + "\n"); out.flush()
        print(f"\n== {set_name} ==")
        for g in sorted({g for g, _ in agg}):
            for name in VARIANTS:
                s = agg[(g, name)]
                print(f"{g:16s} {name:10s} WER {s['e']:3d}/{s['n']:3d} = {s['e'] / max(s['n'], 1):.3f}  "
                      f"norm {s['en'] / max(s['nn'], 1):.3f}  exact {s['exact']:2d}/{s['k']:2d}  "
                      f"decode p50 {statistics.median(s['ms']):.0f} ms", flush=True)
    print(f"peak RSS {rss_mb():.0f} MB")


if __name__ == "__main__":
    main()
