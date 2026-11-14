"""Decoder-setting sweep on webcam sessions + CREMA-D. Each clip is cropped and encoded ONCE; only decoding varies.
Reports strict WER (the eval_session metric) and contraction-normalised WER (I'M == I AM; scoring-only, applied to ref
and hyp alike), exact-match and decode latency, per set and per webcam group (prompted silent / voiced / own silent).
    .venv/bin/python -m eval.sweep_decode --session data/webcam/<dev> [--session data/webcam/<other>] [--cremad]
Sessions contain faces: outputs go to stdout (and --out, default inside the session dir, git-ignored).
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

from tacit_vsr import engine, video
from tacit_vsr.fast_beam import beam_search
from tacit_vsr.transcribe import wer

HERE = Path(__file__).resolve().parent
CONTRACTIONS = {"I'M": "I AM", "I'LL": "I WILL", "I'VE": "I HAVE", "I'D": "I WOULD", "DON'T": "DO NOT", "IT'S": "IT IS",
                "YOU'RE": "YOU ARE", "CAN'T": "CAN NOT", "WON'T": "WILL NOT", "THAT'S": "THAT IS", "WHAT'S": "WHAT IS",
                "WE'RE": "WE ARE", "THEY'RE": "THEY ARE", "ISN'T": "IS NOT", "DIDN'T": "DID NOT"}
VARIANTS = {  # name: (beam, ctc_weight, no_repeat)
    "b10_ctc0.1": (10, 0.1, 0), "b40_ctc0.1": (40, 0.1, 0), "b10_ctc0.3": (10, 0.3, 0), "b40_ctc0.3": (40, 0.3, 0),
    "b10_nr4": (10, 0.1, 4), "b40_nr4": (40, 0.1, 4),
}


def strict(s: str) -> str:
    return engine.normalize_text(s).replace("'", "")


def expand(s: str) -> str:
    return " ".join(CONTRACTIONS.get(w, w) for w in engine.normalize_text(s).split()).replace("'", "")


def items_for(session: Path | None):
    if session is None:
        for it in json.load(open(HERE / "cremad_manifest.json")):
            yield HERE / it["file"], it["text"], "cremad"
        return
    for l in open(session / "manifest.jsonl"):
        it = json.loads(l)
        group = "voiced" if it["mode"] == "voiced" else ("silent_prompted" if it["prompted"] else "silent_own")
        yield session / it["file"], it["ref"], group


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", action="append", default=[])
    ap.add_argument("--cremad", action="store_true")
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    a = ap.parse_args()
    eng, crop = engine.VSREngine(a.device), video.MouthCropper()
    sets = [(Path(s).name, Path(s)) for s in a.session] + ([("cremad", None)] if a.cremad else [])
    for set_name, session in sets:
        agg: dict = {}
        rows = []
        for path, ref, group in items_for(session):
            clip = video.decode_clip(path.read_bytes())
            track = crop(clip.frames)
            if track.roi is None:
                print(f"{path.name}: NO FACE"); continue
            enc = eng.encode(video.roi_to_tensor(track.roi))
            row = {"file": path.name, "group": group, "ref": engine.normalize_text(ref)}
            for name, (beam, cw, nr) in VARIANTS.items():
                t = time.perf_counter()
                nb = beam_search(eng.model, None, enc, beam=beam, ctc_weight=cw, lm_weight=0.0, nbest=3, no_repeat=nr)
                ms = (time.perf_counter() - t) * 1000
                hyp = eng.detokenize(nb[0][1]) if nb else ""
                es, n = wer(strict(ref), strict(hyp))
                en, nn = wer(expand(ref), expand(hyp))
                row[name] = hyp
                for g in (group, "ALL", "silent_all" if group.startswith("silent") else None):
                    if g is None:
                        continue
                    s = agg.setdefault((g, name), {"es": 0, "n": 0, "en": 0, "nn": 0, "exact": 0, "exact_n": 0, "k": 0, "ms": []})
                    s["es"] += es; s["n"] += n; s["en"] += en; s["nn"] += nn
                    s["exact"] += int(es == 0); s["exact_n"] += int(en == 0); s["k"] += 1; s["ms"].append(ms)
            rows.append(row)
            if session is not None:
                print(json.dumps(row), flush=True)
        print(f"\n== {set_name}")
        print(f"{'group':16s} {'variant':11s} {'strict WER':>16s} {'norm WER':>16s} {'exact':>7s} {'exact(n)':>8s} {'dec ms p50':>10s}")
        for (g, name), s in sorted(agg.items()):
            print(f"{g:16s} {name:11s} {s['es']:>4d}/{s['n']:<4d}={s['es'] / s['n']:.3f} {s['en']:>4d}/{s['nn']:<4d}={s['en'] / s['nn']:.3f} "
                  f"{s['exact']:>3d}/{s['k']:<3d} {s['exact_n']:>3d}/{s['k']:<3d} {statistics.median(s['ms']):>9.0f}")
        if session is not None:
            with open(session / "sweep-decode.jsonl", "w") as fo:
                for r in rows:
                    fo.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
