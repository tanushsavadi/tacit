"""Frozen offline benchmark + one-variable-at-a-time A/B for the visual recognition path (development data only).

Item sets (no speaker or session is ever used to fit anything here; every variant is test-time only, and the label-free
`adabn` variant estimates statistics strictly leave-one-session-out):
  silent   own webcam clips recorded as silent articulation (sessions A/B/C; 20 clips)
  voiced   own webcam clips spoken aloud (control for "is it the silence or the capture?"; 28 clips)
  cremad   CREMA-D voiced actors, 96 clips from 61 speakers never seen by TACIT (regression guard for the generic model)
  rest     still face after the last lip motion of every own clip (≥ 1 s) — non-speech control, must not be SHOWN
No muted-voiced recordings and no smile/swallow/listening recordings exist; they are reported as absent, not estimated.

Frames are decoded and resampled exactly as in production (video.decode_clip; a tempo variant changes only the sampling
rate). FaceMesh landmarks (the slow part) are cached per clip and rate in data/eval/bench_cache/ (git-ignored, face
geometry). Each variant warps the mouth ROI with the production geometry, encodes and decodes (production fast beam 10,
CTC 0.1, N-best 10).
    .venv/bin/python -m eval.bench --variant base [--variant tempo_1.2 ...] [--sets silent,voiced,cremad,rest]
    .venv/bin/python -m eval.bench --compare base tempo_1.2
    .venv/bin/python -m eval.bench --union base tempo_1.1          # review coverage of pooled N-best lists
    .venv/bin/python -m eval.bench --session data/webcam/<held-out> --tag heldout1 --variant base --variant tempo_1.1
    .venv/bin/python -m eval.bench --session data/webcam/<held-out> --tag heldout1 --overlay data/adapt/<name>
Results: data/eval/bench/<variant>.jsonl (per clip, private transcripts) + one summary row in data/eval/bench/summary.jsonl.

Frozen baseline (`base`, production settings, run 2026-11-14 ~21:13 UTC): silent 44/99 = 44.4% WER, 6/20 exact, reference in
top-1/3/5/10 6/7/8/10; voiced 49/130 = 37.7%, 13/28; CREMA-D 33/536 = 6.2%, 79/96 (2 clips abstain in the production
gate: one decodes to 2 frames, one "no lip movement"); resting face shown 4/36. Own-clip numbers equal the earlier
production runs (DEMO_READINESS D.10/D.12).

Decision rule, written BEFORE any variant was run: a variant is adopted only if, against `base` on the same clips,
  (1) own silent + own voiced word errors drop by >= 3 (229 words) AND silent errors do not rise,
  (2) silent exact count does not drop, (3) CREMA-D errors rise by <= 3 (~0.5 pt), (4) resting-face shown does not rise,
  (5) p95 latency stays within +300 ms.
With 20 silent clips and ~10 variants, a pass is weak evidence (multiple comparisons): an adopted variant still needs
the next independent live test. No variant here sees reference text except for scoring.
Results of the first run (tempo, crop scale/shift, per-clip normalisation, trim, AdaBN, tempo ensemble): none adopted —
docs/DEMO_READINESS.md D.14.
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import hashlib
import json
import resource
import statistics
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import torch

from tacit_vsr import config, engine, video
from tacit_vsr.fast_beam import beam_search
from tacit_vsr.transcribe import wer

from .live_sim import motion_bounds
from .sweep_decode import group_of, strict

HERE = Path(__file__).resolve().parent
SESSIONS = {  # short id -> directory (all git-ignored, private)
    "A": "20261114T184530Z-s1", "B": "20261114T185152Z-s1", "C": "20261114T191005Z-bright-test",
}
CACHE = config.DATA_DIR / "eval" / "bench_cache"
OUT = config.DATA_DIR / "eval" / "bench"
NBEST = 10
KS = (1, 3, 5, 10)


@dataclass
class Item:
    set: str          # silent | voiced | cremad
    session: str      # A/B/C or cremad speaker id
    path: Path
    ref: str
    group: str
    sentence: str     # normalised ref (for sentence-disjoint splits)


_SESSION_DIRS: dict[str, Path] | None = None  # --session overrides the development sessions (e.g. a held-out session)


def items() -> list[Item]:
    out: list[Item] = []
    dirs = _SESSION_DIRS or {sid: config.DATA_DIR / "webcam" / d for sid, d in SESSIONS.items()}
    for sid, sd in dirs.items():
        for l in open(sd / "manifest.jsonl"):
            it = json.loads(l)
            g = group_of(it)
            kind = "nonspeech" if g == "nonspeech" else "silent" if g.startswith("silent") else "voiced"
            out.append(Item(kind, sid, sd / it["file"], it.get("ref") or "", g, strict(it.get("ref") or "")))
    if _SESSION_DIRS is not None:
        return out
    for it in json.load(open(HERE / "cremad_manifest.json")):
        out.append(Item("cremad", it["speaker"], HERE / it["file"], it["text"], "cremad", strict(it["text"])))
    return out


def item_key(it: Item) -> str:
    return f"{it.session}__{it.path.name}"


# ---------------------------------------------------------------- decoding + landmark cache
def decode_frames(path: Path, rate: float = 1.0) -> list[np.ndarray]:
    """Production decoding + resampling (video.decode_clip, nearest preceding frame at bin centres). `rate` > 1 plays
    the clip faster: model frame k shows source time (k + 0.5) * rate / 25 s (fewer frames for the same articulation)."""
    return video.decode_clip(path.read_bytes(), fps=config.MODEL_FPS / rate).frames


def landmarks(path: Path, crop: video.MouthCropper, rate: float = 1.0) -> dict:
    """FaceMesh 4-point alignment landmarks + lip ratios on the production-resampled sequence (cached per rate)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (hashlib.sha1(f"{path.resolve()}|{rate:g}".encode()).hexdigest()[:16] + ".npz")
    if f.exists():
        z = np.load(f)
        return {k: z[k] for k in z.files}
    frames = decode_frames(path, rate)
    pts4, lips = crop._facemesh(frames)
    P = np.full((len(frames), 4, 2), np.nan)
    L = np.full((len(frames), 2), np.nan)
    for i, (p, l) in enumerate(zip(pts4, lips)):
        if p is not None:
            P[i] = p; L[i] = l
    np.savez_compressed(f, pts4=P, lips=L)
    return {"pts4": P, "lips": L}


def window_indices(n: int, rate: float, window: tuple[float, float] | None) -> np.ndarray:
    """Model-frame indices whose bin centre lies inside the window (seconds of source time)."""
    if not window:
        return np.arange(n)
    c = (np.arange(n) + 0.5) * rate / config.MODEL_FPS
    return np.where((c >= window[0]) & (c < window[1]))[0]


def warp_rois(gray: list[np.ndarray], lms: np.ndarray, stable_ref: np.ndarray, scale: float = 1.0,
              dy: float = 0.0) -> np.ndarray:
    """video.MouthCropper geometry (12-frame landmark smoothing, similarity warp to the mean face, 96x96 at the mouth
    centre). scale != 1 crops a (96*scale)^2 window and resizes it to 96 (zoom out > 1); dy shifts it (+ = down)."""
    n = len(gray)
    roi = np.zeros((n, 96, 96), dtype=np.uint8)
    half = 48 * scale
    for i in range(n):
        m = min(6, i, n - 1 - i)
        sm = lms[i - m: i + m + 1].mean(axis=0)
        sm += lms[i].mean(axis=0) - sm.mean(axis=0)
        tf = cv2.estimateAffinePartial2D(sm, stable_ref, method=cv2.LMEDS)[0]
        if tf is None:
            tf = cv2.estimateAffinePartial2D(sm, stable_ref)[0]
        warped = cv2.warpAffine(gray[i], tf, dsize=(256, 256), flags=cv2.INTER_LINEAR,
                                borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        cx, cy = sm[3] @ tf[:, :2].T + tf[:, 2]
        cy += dy
        if scale == 1.0:
            x0 = int(round(np.clip(cx - 48, 0, 256 - 96))); y0 = int(round(np.clip(cy - 48, 0, 256 - 96)))
            roi[i] = warped[y0:y0 + 96, x0:x0 + 96]
        else:
            M = np.float32([[96 / (2 * half), 0, -(cx - half) * 96 / (2 * half)], [0, 96 / (2 * half), -(cy - half) * 96 / (2 * half)]])
            roi[i] = cv2.warpAffine(warped, M, (96, 96), flags=cv2.INTER_AREA if scale > 1 else cv2.INTER_LINEAR)
    return roi


def interp_lms(P: np.ndarray) -> tuple[np.ndarray | None, float]:
    valid = np.where(~np.isnan(P[:, 0, 0]))[0]
    if len(valid) == 0:
        return None, 0.0
    n = len(P)
    out = np.zeros_like(P)
    for a in range(4):
        for b in range(2):
            out[:, a, b] = np.interp(np.arange(n), valid, P[valid, a, b])
    return out, len(valid) / n


# ---------------------------------------------------------------- variants
@dataclass
class Variant:
    name: str
    rate: float = 1.0          # playback speed of the sampled sequence
    scale: float = 1.0         # crop zoom (window side 96*scale)
    dy: float = 0.0
    norm: str = ""             # "" | "clipstd" (per-clip intensity standardisation to the training mean/std)
    adabn: bool = False        # leave-one-session-out BatchNorm statistics from the user's OTHER sessions
    trim: float | None = None  # keep [motion onset - trim, offset + trim] s of the clip (FaceMesh aperture bounds)
    ensemble: tuple[float, ...] = ()  # rates whose N-best lists are pooled and rescored (sequence-level ensemble)


def parse_variant(name: str) -> Variant:
    v = Variant(name)
    for part in name.split("+"):
        if part == "base":
            continue
        key, _, val = part.partition("_")
        if key == "tempo":
            v.rate = float(val)
        elif key == "scale":
            v.scale = float(val)
        elif key == "dy":
            v.dy = float(val)
        elif key == "clipstd":
            v.norm = "clipstd"
        elif key == "adabn":
            v.adabn = True
        elif key == "trim":
            v.trim = float(val)
        elif key == "ens":
            v.ensemble = tuple(float(x) for x in val.split(","))
        else:
            raise SystemExit(f"unknown variant part {part!r}")
    return v


def to_tensor(roi: np.ndarray, norm: str) -> torch.Tensor:
    x = roi[:, 4:92, 4:92].astype(np.float32) / 255.0
    if norm == "clipstd":
        x = (x - x.mean()) / (x.std() + 1e-6) * 0.165 + 0.421
    return ((torch.from_numpy(x) - 0.421) / 0.165).unsqueeze(0)


class BNStats:
    """AdaBN: replace BatchNorm running statistics with statistics measured on the user's own frames (no labels)."""

    def __init__(self, eng: engine.VSREngine):
        self.eng = eng
        self.bns = [m for m in eng.model.encoder.modules() if isinstance(m, torch.nn.modules.batchnorm._BatchNorm)]
        self.orig = [(m.running_mean.clone(), m.running_var.clone()) for m in self.bns]
        self.cache: dict = {}

    def restore(self) -> None:
        for m, (mu, var) in zip(self.bns, self.orig):
            m.running_mean.copy_(mu); m.running_var.copy_(var)

    def estimate(self, key: str, tensors: list[torch.Tensor]) -> None:
        if key in self.cache:
            for m, (mu, var) in zip(self.bns, self.cache[key]):
                m.running_mean.copy_(mu); m.running_var.copy_(var)
            return
        self.restore()
        # Two passes: a layer's input distribution depends on the (adapted) statistics of the layers before it.
        for _ in range(2):
            self._pass(tensors)
        self.cache[key] = [(m.running_mean.clone(), m.running_var.clone()) for m in self.bns]

    def _pass(self, tensors: list[torch.Tensor]) -> None:
        sums = [None] * len(self.bns)
        hooks = []
        for j, m in enumerate(self.bns):
            def hook(mod, inp, j=j):
                x = inp[0].detach().float().cpu()
                dims = [d for d in range(x.dim()) if d != 1]
                s = (x.sum(dims), (x * x).sum(dims), x.numel() // x.size(1))
                sums[j] = s if sums[j] is None else tuple(a + b for a, b in zip(sums[j], s))
            hooks.append(m.register_forward_pre_hook(hook))
        with torch.no_grad():
            for x in tensors:
                self.eng.encode(x)
        for h in hooks:
            h.remove()
        stats = []
        for m, (s1, s2, n) in zip(self.bns, sums):
            mu = s1 / n; var = s2 / n - mu * mu
            stats.append((mu.to(m.running_mean.device), var.clamp_min(1e-5).to(m.running_var.device)))
        for m, (mu, var) in zip(self.bns, stats):
            m.running_mean.copy_(mu); m.running_var.copy_(var)


# ---------------------------------------------------------------- one clip
def prepare(it: Item, lmk: dict, frames_rgb: list[np.ndarray] | None, v: Variant, crop: video.MouthCropper,
            rate: float | None = None, window: tuple[float, float] | None = None) -> dict:
    rate = v.rate if rate is None else rate
    idx = window_indices(len(lmk["pts4"]), rate, window)
    P, face = interp_lms(lmk["pts4"][idx])
    lips = lmk["lips"][idx]
    lv = lips[~np.isnan(lips[:, 0])]
    ap = wd = None
    if len(lv) >= 5:
        ap = float(np.percentile(lv[:, 0], 95) - np.percentile(lv[:, 0], 5))
        wd = float(np.percentile(lv[:, 1], 95) - np.percentile(lv[:, 1], 5))
    out = {"n": len(idx), "face": face, "ap": ap, "wd": wd, "aperture": [float(x) for x in lips[:, 0]]}
    gate = None
    if P is None:
        gate = "no face tracked"
    elif len(idx) < config.MIN_FRAMES:
        gate = "utterance too short"
    elif face < config.MIN_FACE_FRACTION:
        gate = "face not tracked in enough frames"
    elif ap is not None and wd is not None and ap < config.MIN_APERTURE_RANGE and wd < config.MIN_WIDTH_RANGE:
        gate = "no lip movement"
    out["gate"] = gate
    if gate is None and frames_rgb is not None:
        gray = [cv2.cvtColor(frames_rgb[i], cv2.COLOR_RGB2GRAY) for i in idx]
        out["roi"] = warp_rois(gray, P, crop.stable_reference, v.scale, v.dy)
    return out


def decode(eng: engine.VSREngine, enc: torch.Tensor) -> list[tuple[str, list[int], float]]:
    nb = beam_search(eng.model, None, enc, beam=config.FREE_DECODE_BEAM, ctc_weight=config.CTC_WEIGHT, lm_weight=0.0,
                     nbest=NBEST, no_repeat=0)
    return [(eng.detokenize(ids), ids, float(s)) for s, ids in nb]


def run_variant(v: Variant, sets: set[str], eng: engine.VSREngine, crop: video.MouthCropper, bn: BNStats | None) -> list[dict]:
    its = [it for it in items() if it.set in sets or ("rest" in sets and it.set in ("silent", "voiced"))]
    if v.adabn and _SESSION_DIRS is not None:
        raise SystemExit("adabn uses the development sessions as its statistics pool; not available with --session")
    rows = []
    # AdaBN, leave-one-session-out: statistics from every OWN clip of the other sessions (labels never used).
    adabn_pool: dict[str, list[torch.Tensor]] = {}
    if v.adabn:
        for it in items():
            if it.set in ("silent", "voiced"):
                p = prepare(it, landmarks(it.path, crop), decode_frames(it.path), Variant("base"), crop)
                if "roi" in p:
                    adabn_pool.setdefault(it.session, []).append(to_tensor(p["roi"], v.norm))
    for it in its:
        lmk = landmarks(it.path, crop)  # rate 1: motion bounds for the rest / trim windows
        b = motion_bounds([float(x) if not np.isnan(x) else 0.0 for x in lmk["lips"][:, 0]], config.MODEL_FPS)
        dur = len(lmk["lips"]) / config.MODEL_FPS
        kinds = []
        if it.set == "nonspeech":
            if "nonspeech" in sets:
                kinds.append(("nonspeech", None))
        elif it.set in sets:
            kinds.append(("utt", None))
        if "rest" in sets and it.set in ("silent", "voiced"):
            if b and dur - (b[1] / 1000 + 0.3) >= 1.0:
                kinds.append(("rest", (b[1] / 1000 + 0.3, dur)))
        for kind, window in kinds:
            if v.trim is not None and kind == "utt":
                if b:
                    window = (max(0.0, b[0] / 1000 - v.trim), b[1] / 1000 + v.trim)
            if bn is not None:
                if v.adabn and it.set in ("silent", "voiced"):
                    others = [x for s, xs in adabn_pool.items() if s != it.session for x in xs]
                    bn.estimate(f"loso-{it.session}", others)
                elif v.adabn:
                    bn.estimate("all-own", [x for xs in adabn_pool.values() for x in xs])
                else:
                    bn.restore()
            rates = v.ensemble or (v.rate,)
            per_rate = []
            t0 = time.perf_counter()
            ms_enc = ms_dec = 0.0
            gate = None
            for r in rates:
                p = prepare(it, landmarks(it.path, crop, r), decode_frames(it.path, r), v, crop, rate=r, window=window)
                if p["gate"]:
                    gate = p["gate"]; break
                t1 = time.perf_counter(); enc = eng.encode(to_tensor(p["roi"], v.norm)); ms_enc += (time.perf_counter() - t1) * 1000
                t1 = time.perf_counter(); hyps = decode(eng, enc); ms_dec += (time.perf_counter() - t1) * 1000
                per_rate.append((r, enc, hyps, p))
            row = {"variant": v.name, "kind": kind, "set": it.set if kind == "utt" else kind, "session": it.session,
                   "file": it.path.name, "group": it.group, "ref": strict(it.ref) if kind == "utt" else None,
                   "gate": gate, "ms_encode": round(ms_enc), "ms_decode": round(ms_dec)}
            if gate is None:
                if len(per_rate) == 1:
                    _, enc, hyps, p = per_rate[0]
                    ranked = [(h[0], h[1], h[2]) for h in hyps]
                else:
                    # pool every rate's N-best, rescore each candidate under every rate's encoder output, rank by the
                    # mean length-normalised joint score (candidates only ever come from the visual decoder)
                    pool = {}
                    for _, _, hyps, _ in per_rate:
                        for txt, ids, _ in hyps:
                            pool.setdefault(txt, ids)
                    texts = list(pool)
                    t1 = time.perf_counter()
                    tot = np.zeros(len(texts))
                    for _, enc_r, _, _ in per_rate:
                        sc = eng.score_texts(enc_r, texts)
                        tot += np.array([c.length_norm if np.isfinite(c.length_norm) else -1e9 for c in sc])
                    ms_dec += (time.perf_counter() - t1) * 1000
                    order = np.argsort(-tot)
                    ranked = [(texts[i], pool[texts[i]], float(tot[i] / len(per_rate))) for i in order[:NBEST]]
                    ref_i = list(rates).index(1.0) if 1.0 in rates else 0
                    enc, p = per_rate[ref_i][1], per_rate[ref_i][3]
                top_ids = ranked[0][1] if ranked else []
                att = eng._score_ids(enc, top_ids)[0] / (len(top_ids) + 1) if top_ids else None
                row.update(hyps=[strict(h[0]) for h in ranked], att_per_token=round(att, 3) if att is not None else None,
                           margin=round((ranked[0][2] - ranked[1][2]) / (len(top_ids) + 1), 3) if len(ranked) > 1 else None,
                           n_frames=p["n"], ms_decode=round(ms_dec))
            row["ms_total"] = round((time.perf_counter() - t0) * 1000)
            rows.append(row)
    return rows


# ---------------------------------------------------------------- metrics
def summarize(rows: list[dict]) -> dict:
    s: dict = {}
    for set_name in ("silent", "voiced", "cremad"):
        rs = [r for r in rows if r["kind"] == "utt" and r["set"] == set_name]
        if not rs:
            continue
        e = n = exact = abst = 0
        topk = {k: 0 for k in KS}
        oracle5 = 0
        for r in rs:
            words = len(r["ref"].split()); n += words
            hyps = r.get("hyps") or []
            if r["gate"] or not hyps:
                abst += 1; e += words; continue
            errs = [wer(r["ref"], h)[0] for h in hyps]
            e += errs[0]; exact += errs[0] == 0
            for k in KS:
                topk[k] += min(errs[:k]) == 0
            oracle5 += min(errs[:5])
        # model latency (encoder + beam [+ ensemble rescoring]); decoding/landmarks/crop are identical across variants
        # except tempo (frame count) and are measured by the production `stages` instead
        ms = [r["ms_encode"] + r["ms_decode"] for r in rs if not r["gate"]] or [0]
        floor = sum(1 for r in rs if not r["gate"] and r.get("att_per_token") is not None
                    and r["att_per_token"] < config.MIN_SHOW_ATT_PER_TOKEN)
        s[set_name] = {"floor_abstained": floor, "n": len(rs), "words": n, "errors": e, "wer": round(e / n, 4), "exact": exact, "abstained": abst,
                       "top_k": topk, "oracle5_wer": round(oracle5 / n, 4),
                       "ms_p50": round(statistics.median(ms)), "ms_p95": round(float(np.percentile(ms, 95)))}
    for ctrl in ("rest", "nonspeech"):
        rest = [r for r in rows if r["kind"] == ctrl]
        if not rest:
            continue
        shown = [r for r in rest if not r["gate"] and r.get("hyps")]
        s[ctrl] = {"n": len(rest), "shown": len(shown),
                     "shown_after_floor": sum(1 for r in shown if (r.get("att_per_token") or 0) >= config.MIN_SHOW_ATT_PER_TOKEN),
                     "examples": [r["hyps"][0] for r in shown][:6]}
    return s


def git_rev() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=HERE, text=True).strip()
    except Exception:  # noqa: BLE001
        return "?"


def print_summary(name: str, s: dict) -> None:
    for k in ("silent", "voiced", "cremad"):
        if k in s:
            x = s[k]
            print(f"{name:28s} {k:7s} WER {x['errors']:3d}/{x['words']:<3d} = {x['wer']:.3f}  exact {x['exact']:2d}/{x['n']:<2d}  "
                  f"top1/3/5/10 {x['top_k'][1]}/{x['top_k'][3]}/{x['top_k'][5]}/{x['top_k'][10]}  oracle5 {x['oracle5_wer']:.3f}  "
                  f"abst {x['abstained']} (+floor {x['floor_abstained']})  model ms p50 {x['ms_p50']} p95 {x['ms_p95']}")
    for ctrl in ("rest", "nonspeech"):
        if ctrl in s:
            print(f"{name:28s} {ctrl:7s} shown {s[ctrl]['shown']}/{s[ctrl]['n']} (after evidence floor "
                  f"{s[ctrl]['shown_after_floor']})  {s[ctrl]['examples']}")


def compare(a: str, b: str) -> None:
    ra = {(r["kind"], r["session"], r["file"]): r for r in map(json.loads, open(OUT / f"{a}.jsonl"))}
    rb = {(r["kind"], r["session"], r["file"]): r for r in map(json.loads, open(OUT / f"{b}.jsonl"))}
    for set_name in ("silent", "voiced", "cremad"):
        better = worse = 0
        for k, x in ra.items():
            if x["kind"] != "utt" or x["set"] != set_name or k not in rb:
                continue
            y = rb[k]
            ex = wer(x["ref"], (x.get("hyps") or [""])[0])[0]
            ey = wer(y["ref"], (y.get("hyps") or [""])[0])[0]
            if ex != ey:
                better += ey < ex; worse += ey > ex
                print(f"  {set_name:6s} {x['session']:>4s} {x['file']:22s} {ex}->{ey}  REF {x['ref']!r}\n"
                      f"{'':38s}{a}: {(x.get('hyps') or [''])[0]!r}\n{'':38s}{b}: {(y.get('hyps') or [''])[0]!r}")
        print(f"== {set_name}: {b} better on {better} clips, worse on {worse} (vs {a})")


def union(names: list[str], k: int = 5) -> None:
    """Review-candidate coverage of interleaved N-best lists (first variant's top-1 stays the raw text): is the reference
    among the k candidates the user would see? Uses saved results only (no model run)."""
    runs = [{(r["kind"], r["session"], r["file"]): r for r in map(json.loads, open(OUT / f"{n}.jsonl"))} for n in names]
    agg: dict = {}
    for key, r0 in runs[0].items():
        if r0["kind"] != "utt":
            continue
        lists = [(run.get(key) or {}).get("hyps") or [] for run in runs]
        if r0["gate"] or not lists[0]:
            cands = []
        else:
            cands = []
            for i in range(NBEST):
                for L in lists:
                    if i < len(L) and L[i] and L[i] not in cands:
                        cands.append(L[i])
            cands = cands[:k]
        a = agg.setdefault(r0["set"], {"n": 0, "hit": 0, "top1": 0, "hit_base": 0})
        a["n"] += 1
        a["hit"] += r0["ref"] in cands
        a["hit_base"] += r0["ref"] in lists[0][:k]
        a["top1"] += bool(cands) and cands[0] == r0["ref"]
    for set_name, a in agg.items():
        print(f"{'+'.join(names):40s} {set_name:7s} reference among {k} shown: {a['hit']:2d}/{a['n']}  "
              f"({names[0]} alone {a['hit_base']}/{a['n']}; raw top-1 exact {a['top1']})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", action="append", default=[])
    ap.add_argument("--sets", default="silent,voiced,cremad,rest,nonspeech")
    ap.add_argument("--session", action="append", default=[],
                    help="evaluate these session dirs INSTEAD of the development sessions + CREMA-D (held-out runs)")
    ap.add_argument("--overlay", default=None, help="apply a personal-adaptation overlay (data/adapt/<name>) to the model "
                    "before running; result files get '+<name>' in the variant name. Production never loads overlays.")
    ap.add_argument("--tag", default="", help="suffix for result files (keeps held-out results apart from dev runs)")
    ap.add_argument("--compare", nargs=2)
    ap.add_argument("--union", nargs="+", help="review coverage of interleaved saved N-best lists (first = raw)")
    ap.add_argument("--summary", nargs="+", help="re-summarise saved variant results without running the model")
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    a = ap.parse_args()
    if a.compare:
        return compare(*a.compare)
    if a.union:
        return union(a.union)
    if a.summary:
        for name in a.summary:
            print_summary(name, summarize([json.loads(l) for l in open(OUT / f"{name}.jsonl")]))
        return
    global _SESSION_DIRS
    if a.session:
        _SESSION_DIRS = {Path(d).name: Path(d) for d in a.session}
        if not a.tag:
            raise SystemExit("--session needs --tag (e.g. heldout1) so results never overwrite the development runs")
    OUT.mkdir(parents=True, exist_ok=True)
    eng, crop = engine.VSREngine(a.device), video.MouthCropper()
    if a.overlay:
        from adapt.overlay import load_overlay
        m = load_overlay(eng.model, Path(a.overlay))
        print(f"overlay {Path(a.overlay).name}: epoch {m.get('selected_epoch')}, {m['n_params']} params, base {m['base_sha256'][:12]}")
    bn = BNStats(eng)
    sets = set(a.sets.split(","))
    for name in a.variant or ["base"]:
        v = parse_variant(name)
        t = time.perf_counter()
        rows = run_variant(v, sets, eng, crop, bn)
        bn.restore()
        fname = f"{name}{'+' + Path(a.overlay).name if a.overlay else ''}{'@' + a.tag if a.tag else ''}"
        with open(OUT / f"{fname}.jsonl", "w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
        s = summarize(rows)
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024 if sys.platform == "darwin" else 1024)
        with open(OUT / "summary.jsonl", "a") as f:
            f.write(json.dumps({"variant": fname, "git": git_rev(), "device": a.device, "sets": sorted(sets),
                                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "wall_s": round(time.perf_counter() - t),
                                "peak_rss_mb": round(rss), "beam": config.FREE_DECODE_BEAM, "ctc": config.CTC_WEIGHT,
                                "summary": s}) + "\n")
        print_summary(fname, s)
        print(f"{fname}: wall {time.perf_counter() - t:.0f} s, peak RSS {rss:.0f} MB", flush=True)


if __name__ == "__main__":
    main()
