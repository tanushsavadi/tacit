"""Transcribe a record_webcam.py session and report raw predictions, WER per mode and gate features.
    .venv/bin/python -m tacit_vsr.eval_session <session_dir> [--device cpu|mps]
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import json
import statistics as st
from pathlib import Path

import torch

from . import engine, video
from .transcribe import transcribe, wer


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("session")
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    a = ap.parse_args()
    d = Path(a.session)
    items = [json.loads(l) for l in open(d / "manifest.jsonl")]
    eng, crop = engine.VSREngine(a.device), video.MouthCropper()
    rows = []
    for it in items:
        f = d / it["file"]
        if not f.exists():
            continue
        r = transcribe(eng, crop, f)
        ref = engine.normalize_text(it["ref"]); e, n = wer(ref.replace("'", ""), (r.get("text") or "").replace("'", ""))
        r.update(ref=ref, mode=it["mode"], prompted=it["prompted"], errors=e, words=n)
        rows.append(r)
        print(f"{it['mode']:6s} {it['file']:20s} REF {ref!r:40s} HYP {r.get('text')!r:45s} WER {e}/{n} gate {r.get('gate')} capture {r.get('capture')} ms {r['ms'].get('total')}")
    with open(d / f"results-{a.device}.jsonl", "w") as fo:
        for r in rows:
            fo.write(json.dumps(r) + "\n")
    print()
    for mode in sorted({r["mode"] for r in rows}):
        R = [r for r in rows if r["mode"] == mode]
        E, N = sum(r["errors"] for r in R), sum(r["words"] for r in R)
        print(f"{mode}: WER {E}/{N} = {E / max(N, 1):.3f}; exact {sum(r['errors'] == 0 for r in R)}/{len(R)}; no face {sum(r.get('text') is None for r in R)}")
    B = [r["capture"]["roi_brightness"] for r in rows if (r.get("capture") or {}).get("roi_brightness") is not None]
    if B:
        print(f"capture: mouth brightness median {st.median(B):.0f} (CREMA-D reference 130-160; < 90 = underexposed, expect poor WER)")
    T = [r["ms"]["total"] for r in rows if "total" in r["ms"]]
    if T:
        print(f"latency per clip ({a.device}): median {st.median(T):.0f} ms, max {max(T):.0f} ms (clip length {st.median([r['duration_ms'] for r in rows]):.0f} ms)")


if __name__ == "__main__":
    main()
