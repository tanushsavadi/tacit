"""Paired voiced/silent diagnostic (EXPLORATORY — not an accuracy benchmark; few clips, no claims).

For every sentence recorded both spoken normally and mouthed silently in the SAME session (same camera, same light),
compare what reaches the model and how the model reacts. Video only: audio is never opened or decoded.
  capture     source fps from container timestamps, frame-interval jitter, gaps (dropped frames), resolution
  tracking    face-tracked fraction, landmark jitter (high-frequency residual of the 4 alignment points, IOD units),
              head motion range
  illumination  model-input mouth ROI mean / contrast / clipped pixels / left-right asymmetry
  articulation  lip-motion span (s), speaking rate (words/s over the span), aperture & width range, aperture velocity,
              syllable-like aperture peaks
  model       raw top-1 (production fast beam), WER/exact, rank of the reference in the 10-best, teacher-forced
              log-prob of the REFERENCE per token (att + CTC; continuous, far less noisy than WER on 5 pairs)
  model space DTW cosine distance between the voiced and silent encoder outputs of the same sentence vs. between the
              silent take and voiced takes of OTHER sentences (ratio < 1: the model "sees" the same sentence)
Speaker/domain reference: the same reference log-prob on CREMA-D (unseen actors, studio video) — if even the user's
well-lit VOICED takes score far below CREMA-D, the mismatch is speaker/capture, not silence.
Contact sheets of the actual 88x88 model input (voiced row over silent row) are written for visual inspection to
data/eval/paired/<session>/ (git-ignored, contains the face).
    .venv/bin/python -m eval.paired_diag data/webcam/<session> [more sessions] [--cremad]
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import collections
import io
import json
import statistics
from pathlib import Path

import av
import cv2
import numpy as np
import torch

from tacit_vsr import config, engine, video
from tacit_vsr.transcribe import wer

from .bench import decode, decode_frames, interp_lms, landmarks, to_tensor, warp_rois
from .live_sim import motion_bounds
from .phrase_rule_probe import aperture_peaks
from .sweep_decode import group_of, strict

HERE = Path(__file__).resolve().parent
OUT = config.DATA_DIR / "eval" / "paired"


def source_timing(path: Path) -> dict:
    """Container timestamps of the video stream only (packets; nothing is decoded, no audio stream is touched)."""
    with av.open(io.BytesIO(path.read_bytes())) as c:
        s = c.streams.video[0]
        tb = float(s.time_base)
        pts = sorted(p.pts * tb for p in c.demux(s) if p.pts is not None)
        w, h = s.codec_context.width, s.codec_context.height
    t = np.asarray(pts)
    dt = np.diff(t) if len(t) > 1 else np.array([0.0])
    med = float(np.median(dt)) if len(dt) else 0.0
    return {"fps": round((len(t) - 1) / (t[-1] - t[0]), 2) if len(t) > 1 and t[-1] > t[0] else None,
            "dt_ms_med": round(med * 1000, 1), "dt_ms_sd": round(float(dt.std()) * 1000, 2),
            "max_gap_ms": round(float(dt.max()) * 1000, 1), "gaps": int((dt > 1.5 * med).sum()) if med else None,
            "resolution": f"{w}x{h}", "n_src": len(t)}


def dtw_cos(a: torch.Tensor, b: torch.Tensor) -> float:
    a = torch.nn.functional.normalize(a, dim=1); b = torch.nn.functional.normalize(b, dim=1)
    d = (1 - a @ b.T).numpy().astype(np.float64)
    n, m = d.shape
    acc = np.full((n + 1, m + 1), np.inf); acc[0, 0] = 0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            acc[i, j] = d[i - 1, j - 1] + min(acc[i - 1, j], acc[i, j - 1], acc[i - 1, j - 1])
    return float(acc[n, m] / (n + m))


def analyse(eng, crop, path: Path, ref: str, ref_model: str) -> tuple[dict, torch.Tensor | None, np.ndarray | None, tuple | None]:
    """ref: scoring form (no apostrophes, for WER); ref_model: model label form (apostrophes kept, for log-probs)."""
    lmk = landmarks(path, crop)
    frames = decode_frames(path)
    P, face = interp_lms(lmk["pts4"])
    lips = lmk["lips"]
    r = {"file": path.name, "ref": ref, "capture": source_timing(path), "model_frames": len(frames),
         "face_fraction": round(face, 3)}
    if P is None:
        r["error"] = "no face"; return r, None, None, None
    iod = np.linalg.norm(P[:, 1] - P[:, 0], axis=1)
    iod_med = float(np.median(iod))
    k = np.ones(5) / 5
    smooth = np.stack([np.stack([np.convolve(P[:, a, b], k, mode="same") for b in range(2)], 1) for a in range(4)], 1)
    resid = (P - smooth)[2:-2]  # ignore the convolution edges
    r["tracking"] = {"iod_px": round(iod_med, 1),
                     "jitter_iod": round(float(np.sqrt((resid ** 2).sum(-1).mean())) / iod_med, 4),
                     "mouth_point_jitter_iod": round(float(np.sqrt((resid[:, 3] ** 2).sum(-1).mean())) / iod_med, 4),
                     "head_motion_iod": round(float(np.percentile(np.linalg.norm(P[:, 2] - P[:, 2].mean(0), axis=1), 95)) / iod_med, 3)}
    gray = [cv2.cvtColor(f, cv2.COLOR_RGB2GRAY) for f in frames]
    roi = warp_rois(gray, P, crop.stable_reference)
    x = roi[:, 4:92, 4:92].astype(np.float32)
    r["illumination"] = {"roi_mean": round(float(x.mean()), 1), "roi_contrast_sd": round(float(x.std()), 1),
                         "dark_frac": round(float((x < 20).mean()), 3), "clipped_frac": round(float((x > 235).mean()), 3),
                         "lr_asymmetry": round(float(x[:, :, :44].mean() - x[:, :, 44:].mean()), 1),
                         "training_norm_mean_sd": "0.421*255=107.4 / 0.165*255=42.1"}
    ap = np.nan_to_num(lips[:, 0], nan=float(np.nanmedian(lips[:, 0])))
    wd = np.nan_to_num(lips[:, 1], nan=float(np.nanmedian(lips[:, 1])))
    b = motion_bounds(list(ap), config.MODEL_FPS)
    span = ((b[1] - b[0]) / 1000) if b else None
    seg = slice(int(b[0] / 40), int(b[1] / 40) + 1) if b else slice(None)
    nwords = len(ref.split())
    r["articulation"] = {"motion_span_s": round(span, 2) if span else None,
                         "words_per_s": round(nwords / span, 2) if span else None,
                         "aperture_range": round(float(np.percentile(ap, 95) - np.percentile(ap, 5)), 3),
                         "aperture_max": round(float(ap.max()), 3),
                         "width_range": round(float(np.percentile(wd, 95) - np.percentile(wd, 5)), 3),
                         "aperture_speed_iod_s": round(float(np.abs(np.diff(ap[seg])).mean() * config.MODEL_FPS), 3),
                         "aperture_peaks": aperture_peaks(list(ap[seg])),
                         "peaks_per_word": round(aperture_peaks(list(ap[seg])) / nwords, 2)}
    enc = eng.encode(to_tensor(roi, ""))
    hyps = decode(eng, enc)
    texts = [strict(h[0]) for h in hyps]
    e, n = wer(ref, texts[0] if texts else "")
    sc = eng.score_texts(enc, [ref_model] + ([hyps[0][0]] if hyps else []))
    refsc = sc[0]
    r["model"] = {"hyp": texts[0] if texts else "", "wer": f"{e}/{n}", "errors": e, "words": n, "exact": e == 0,
                  "ref_rank_in_10best": (texts.index(ref) + 1) if ref in texts else None,
                  "ref_att_per_token": round(refsc.att / (refsc.n_tokens + 1), 3),
                  "ref_ctc_per_token": round(refsc.ctc / (refsc.n_tokens + 1), 3) if np.isfinite(refsc.ctc) else None,
                  "hyp_att_per_token": round(sc[1].att / (sc[1].n_tokens + 1), 3) if len(sc) > 1 else None,
                  "frames_per_ref_token": round(len(frames) / max(refsc.n_tokens, 1), 1)}
    return r, enc, roi, b


def sheet(rows: list[tuple[np.ndarray, tuple | None, str]], path: Path, n: int = 10) -> None:
    tiles = []
    for roi, b, label in rows:
        lo, hi = (int(b[0] / 40), int(b[1] / 40)) if b else (0, len(roi) - 1)
        idx = np.linspace(lo, max(lo, min(hi, len(roi) - 1)), n).round().astype(int)
        row = np.concatenate([cv2.resize(roi[i, 4:92, 4:92], (176, 176), interpolation=cv2.INTER_NEAREST) for i in idx], 1)
        bar = np.full((22, row.shape[1]), 255, np.uint8)
        cv2.putText(bar, label, (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 0, 1)
        tiles += [bar, row]
    cv2.imwrite(str(path), np.concatenate(tiles, 0))


def cremad_reference(eng, crop) -> dict:
    cache = OUT / "cremad_ref_v2.json"
    if cache.exists():
        return json.load(open(cache))
    vals = []
    for it in json.load(open(HERE / "cremad_manifest.json")):
        p = HERE / it["file"]
        lmk = landmarks(p, crop)
        P, face = interp_lms(lmk["pts4"])
        if P is None or len(lmk["pts4"]) < 12:
            continue
        frames = decode_frames(p)
        roi = warp_rois([cv2.cvtColor(f, cv2.COLOR_RGB2GRAY) for f in frames], P, crop.stable_reference)
        sc = eng.score_texts(eng.encode(to_tensor(roi, "")), [engine.normalize_text(it["text"])])[0]
        vals.append(sc.att / (sc.n_tokens + 1))
    out = {"n": len(vals), "ref_att_per_token_median": round(statistics.median(vals), 3),
           "p10": round(float(np.percentile(vals, 10)), 3), "p90": round(float(np.percentile(vals, 90)), 3)}
    OUT.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(cache, "w"))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("sessions", nargs="+")
    ap.add_argument("--cremad", action="store_true", help="also compute the CREMA-D reference log-prob distribution")
    a = ap.parse_args()
    eng = engine.VSREngine("mps" if torch.backends.mps.is_available() else "cpu")
    crop = video.MouthCropper()
    if a.cremad:
        cr = cremad_reference(eng, crop)
        print(f"CREMA-D reference att/token (n={cr['n']}): median {cr['ref_att_per_token_median']} "
              f"(p10 {cr['p10']}, p90 {cr['p90']})")
    for s in a.sessions:
        d = Path(s)
        items = [json.loads(l) for l in open(d / "manifest.jsonl")]
        by_ref: dict[str, dict[str, dict]] = collections.defaultdict(dict)
        for it in items:
            g = group_of(it)
            mode = "silent" if g.startswith("silent") else "voiced" if g == "voiced" else None
            if mode and (d / it["file"]).exists():
                by_ref[strict(it["ref"])].setdefault(mode, it)
        pairs = {r: m for r, m in by_ref.items() if "silent" in m and "voiced" in m}
        if not pairs:
            print(f"{d.name}: no voiced/silent pairs"); continue
        out = OUT / d.name
        out.mkdir(parents=True, exist_ok=True)
        res, encs = [], {}
        for k, (ref, m) in enumerate(sorted(pairs.items()), 1):
            row = {"pair": k, "ref": ref}
            sheets = []
            for mode in ("voiced", "silent"):
                r, enc, roi, b = analyse(eng, crop, d / m[mode]["file"], ref, engine.normalize_text(m[mode]["ref"]))
                row[mode] = r
                encs[(ref, mode)] = enc
                if roi is not None:
                    sheets.append((roi, b, f"{mode.upper()}: {r['model']['hyp']}  (ref: {ref})"))
            if sheets:
                sheet(sheets, out / f"pair{k:02d}.png")
            res.append(row)
        # model-space similarity
        for row in res:
            ev, es = encs.get((row["ref"], "voiced")), encs.get((row["ref"], "silent"))
            if ev is None or es is None:
                continue
            same = dtw_cos(es, ev)
            others = [dtw_cos(es, encs[(r2, "voiced")]) for r2 in pairs if r2 != row["ref"] and encs.get((r2, "voiced")) is not None]
            row["model_space"] = {"dtw_same_sentence": round(same, 4),
                                  "dtw_other_sentences_mean": round(float(np.mean(others)), 4) if others else None,
                                  "ratio": round(same / float(np.mean(others)), 3) if others else None}
        json.dump(res, open(out / "results.json", "w"), indent=1)
        print(f"\n=== {d.name}: {len(res)} pairs (exploratory) → {out}")
        for row in res:
            v, sl = row["voiced"], row["silent"]
            if "model" not in v or "model" not in sl:
                print(f"pair {row['pair']}: {row['ref']!r} — tracking failed"); continue
            ms = row.get("model_space", {})
            print(f"pair {row['pair']}: {row['ref']!r}\n"
                  f"   VOICED {v['model']['hyp']!r} {v['model']['wer']}  ref logp/tok {v['model']['ref_att_per_token']}  rank {v['model']['ref_rank_in_10best']}\n"
                  f"   SILENT {sl['model']['hyp']!r} {sl['model']['wer']}  ref logp/tok {sl['model']['ref_att_per_token']}  rank {sl['model']['ref_rank_in_10best']}\n"
                  f"   model-space DTW same {ms.get('dtw_same_sentence')} vs other {ms.get('dtw_other_sentences_mean')} (ratio {ms.get('ratio')})")
        print("\n  feature (mean over pairs)            voiced      silent   (silent − voiced, pairs where silent larger)")
        feats = [("capture", "fps"), ("capture", "dt_ms_sd"), ("capture", "gaps"), ("face_fraction", None),
                 ("tracking", "jitter_iod"), ("tracking", "mouth_point_jitter_iod"), ("tracking", "head_motion_iod"),
                 ("tracking", "iod_px"), ("illumination", "roi_mean"), ("illumination", "roi_contrast_sd"),
                 ("illumination", "clipped_frac"), ("articulation", "motion_span_s"), ("articulation", "words_per_s"),
                 ("articulation", "aperture_range"), ("articulation", "width_range"), ("articulation", "aperture_speed_iod_s"),
                 ("articulation", "peaks_per_word"), ("model", "errors"), ("model", "ref_att_per_token"),
                 ("model", "ref_ctc_per_token"), ("model", "frames_per_ref_token")]
        for grp, key in feats:
            def val(r):
                x = r.get(grp) if key is None else (r.get(grp) or {}).get(key)
                return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else None
            vs = [(val(row["voiced"]), val(row["silent"])) for row in res]
            vs = [(x, y) for x, y in vs if x is not None and y is not None]
            if not vs:
                continue
            mv, msl = np.mean([x for x, _ in vs]), np.mean([y for _, y in vs])
            print(f"  {grp + '.' + (key or ''):36s} {mv:9.3f}  {msl:9.3f}   ({msl - mv:+.3f}, {sum(y > x for x, y in vs)}/{len(vs)})")
        ex_v = sum(r["voiced"].get("model", {}).get("exact", False) for r in res)
        ex_s = sum(r["silent"].get("model", {}).get("exact", False) for r in res)
        ev = sum(r["voiced"].get("model", {}).get("errors", 0) for r in res); es = sum(r["silent"].get("model", {}).get("errors", 0) for r in res)
        nw = sum(r["voiced"].get("model", {}).get("words", 0) for r in res)
        print(f"  exact voiced {ex_v}/{len(res)}, silent {ex_s}/{len(res)}; WER voiced {ev}/{nw}, silent {es}/{nw}")


if __name__ == "__main__":
    main()
