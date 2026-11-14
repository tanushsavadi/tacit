"""Open-vocabulary visual-only transcription (Mode 2 core): video file(s) -> raw text + per-stage latency.

Only the video stream is decoded; audio is never read.
    .venv/bin/python -m tacit_vsr.transcribe CLIP [CLIP ...] [--device cpu|mps] [--ref "TEXT"] [--json]
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")  # max_pool3d is not implemented on MPS; that op falls back to CPU

import argparse
import json
import sys
import time
from pathlib import Path

from . import config, engine, video


def wer(ref: str, hyp: str) -> tuple[int, int]:
    r, h = ref.split(), hyp.split()
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)], len(r)


def transcribe(eng: engine.VSREngine, crop: video.MouthCropper, path: Path) -> dict:
    t0 = time.perf_counter()
    clip = video.decode_clip(path.read_bytes())
    t1 = time.perf_counter()
    track = crop(clip.frames)
    t2 = time.perf_counter()
    out = {"file": str(path), "frames": len(clip.frames), "source_fps": round(clip.source_fps, 2),
           "duration_ms": round(clip.duration_ms), "face_fraction": round(track.face_fraction, 3),
           "aperture_range": track.aperture_range, "width_range": track.width_range,
           "ms": {"decode": round((t1 - t0) * 1000), "landmarks_crop": round((t2 - t1) * 1000)}}
    if track.roi is None:
        out.update(text=None, error="no face tracked")
        return out
    x = video.roi_to_tensor(track.roi)
    enc, ms_enc = engine.timed(eng.encode, x)
    hyps, ms_dec = engine.timed(eng.beam, enc)
    out["ms"].update(encode=round(ms_enc), beam_decode=round(ms_dec))
    best = alt = None
    texts = []
    for h in hyps[:3]:
        ids = [int(i) for i in h.yseq.tolist() if int(i) != eng.sos]
        texts.append((eng.detokenize(ids), ids, float(h.score)))
    if texts:
        text, ids, _ = texts[0]
        att, ctc = eng._score_ids(enc, ids) if ids else (float("-inf"), float("-inf"))
        n = len(ids) + 1
        best = {"att_per_token": round(att / n, 3), "ctc_per_token": round(ctc / n, 3) if ctc != float("-inf") else None}
        if len(texts) > 1:
            alt = round((texts[0][2] - texts[1][2]) / n, 3)
    out["ms"]["total"] = round((time.perf_counter() - t0) * 1000)
    out["text"] = texts[0][0] if texts else ""
    out["n_tokens"] = len(texts[0][1]) if texts else 0
    # Reliability-gate features (calibrated later on real silent recordings; not a gate yet).
    out["gate"] = {**(best or {}), "nbest_margin_per_token": alt, "runner_up": texts[1][0] if len(texts) > 1 else None,
                   "frames_per_token": round(len(clip.frames) / max(out["n_tokens"], 1), 2)}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("clips", nargs="+")
    ap.add_argument("--device", default="mps" if __import__("torch").backends.mps.is_available() else "cpu")
    ap.add_argument("--ref", action="append", default=[], help="reference text per clip (same order)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    t = time.perf_counter()
    eng = engine.VSREngine(a.device)
    crop = video.MouthCropper()
    print(f"model: {config.MODEL_NAME}; device {a.device}; load {round((time.perf_counter() - t) * 1000)} ms", file=sys.stderr)
    errs = words = 0
    for i, c in enumerate(a.clips):
        r = transcribe(eng, crop, Path(c))
        if i < len(a.ref):
            ref = engine.normalize_text(a.ref[i]); e, n = wer(ref, r.get("text") or "")
            r["ref"] = ref; r["wer"] = round(e / max(n, 1), 3); errs += e; words += n
        print(json.dumps(r) if a.json else f"{Path(c).name}: HYP {r.get('text')!r}" + (f" | REF {r['ref']!r} WER {r['wer']}" if 'ref' in r else "")
              + f" | {r['ms']} face {r['face_fraction']} gate {r.get('gate')}")
    if words:
        print(f"corpus WER {errs}/{words} = {errs / words:.3f}", file=sys.stderr)


if __name__ == "__main__":
    main()
