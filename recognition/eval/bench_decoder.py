"""Decoder A/B on the SAME clips, weights, tokenizer and settings: ESPnet BatchBeamSearch vs the fast beam
(tacit_vsr/fast_beam.py, adapted from SilentFlow). Encoder output is computed once per clip and shared, so only the
decoder differs. Reports raw-output agreement, WER vs CREMA-D references, n-best margin, latency (warm, median of
--reps), for no_repeat=0 (score-equivalent) and no_repeat=4 (upstream default, a behaviour change).
Data: 24 CREMA-D VOICED actor clips (audio never read). Not a silent-speech result.
    .venv/bin/python -m eval.bench_decoder [--device mps|cpu] [--reps 3]
"""
from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path

import torch

from tacit_vsr import config, engine, video
from tacit_vsr.fast_beam import beam_search
from tacit_vsr.transcribe import wer

HERE = Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    ap.add_argument("--reps", type=int, default=3)
    a = ap.parse_args()
    eng = engine.VSREngine(a.device)
    crop = video.MouthCropper()
    manifest = json.load(open(HERE / "cremad_manifest.json"))
    variants = {"espnet": None, "fast_norepeat0": 0, "fast_norepeat4": 4}
    agg = {k: {"ms": [], "err": 0, "words": 0, "exact": 0, "same_as_espnet": 0, "margin_diff": []} for k in variants}
    beam = config.FREE_DECODE_BEAM
    for item in manifest:
        clip = video.decode_clip((HERE / item["file"]).read_bytes())
        track = crop(clip.frames)
        if track.roi is None:
            print(f"{item['file']}: no face"); continue
        enc = eng.encode(video.roi_to_tensor(track.roi))
        ref = engine.normalize_text(item["text"])
        res = {}
        for name, nr in variants.items():
            times = []
            for _ in range(a.reps + 1):  # first run = warm-up, discarded
                t = time.perf_counter()
                if nr is None:
                    hyps = eng.beam(enc)
                    nb = [(float(h.score), [int(i) for i in h.yseq.tolist() if int(i) != eng.sos]) for h in hyps[:3]]
                else:
                    nb = beam_search(eng.model, None, enc, beam=beam, ctc_weight=eng.ctc_weight, lm_weight=0.0, nbest=3, no_repeat=nr)
                times.append((time.perf_counter() - t) * 1000)
            ids = nb[0][1] if nb else []
            n = len(ids) + 1
            margin = round((nb[0][0] - nb[1][0]) / n, 3) if len(nb) > 1 else None
            res[name] = (eng.detokenize(ids), statistics.median(times[1:]), margin)
        for name, (text, ms, margin) in res.items():
            e, nw = wer(ref, text)
            g = agg[name]; g["ms"].append(ms); g["err"] += e; g["words"] += nw; g["exact"] += int(e == 0)
            g["same_as_espnet"] += int(text == res["espnet"][0])
            if margin is not None and res["espnet"][2] is not None: g["margin_diff"].append(abs(margin - res["espnet"][2]))
        print(f"{Path(item['file']).name}: " + " | ".join(f"{k} {v[0]!r} {v[1]:.0f}ms m={v[2]}" for k, v in res.items()), flush=True)
    print(f"\ndevice {a.device} (encoder), decoder on CPU, beam {beam}, ctc_weight {eng.ctc_weight}, no LM, reps {a.reps}")
    for k, g in agg.items():
        ms = sorted(g["ms"])
        print(f"{k:16s} median {statistics.median(ms):6.0f} ms  p95 {ms[int(0.95 * (len(ms) - 1))]:6.0f}  max {ms[-1]:6.0f}  "
              f"WER {g['err']}/{g['words']} = {g['err'] / max(g['words'], 1):.3f}  exact {g['exact']}/{len(ms)}  "
              f"identical-to-espnet {g['same_as_espnet']}/{len(ms)}  max|Δmargin| {max(g['margin_diff'] or [0]):.3f}")


if __name__ == "__main__":
    main()
