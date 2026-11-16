"""Personalised fine-tuning of the pretrained Auto-AVSR visual model on the user's own labelled clips.

    .venv/bin/python -m adapt.finetune --name silent1 --train adaptA --train adaptB --val adaptVal \
        [--train-modes silent|silent,voiced] [--scope frontend+embed+block0|top3] [--dry-run]
--train/--val take a session directory or a bare recording name (resolved to the single data/webcam/<UTC>-<name> with
clips; ambiguous or missing names are refused).

Recipe = Lipflow's speaker adaptation (github.com/amywork777/lipflow lipflow/train_vsr.py @ e37453b),
re-implemented for TACIT's engine; fixed before any adaptation data exists:
  * Starts from LRS3_V_WER19.1 (read-only; SHA-256 checked before and after). Default scope "frontend+embed+block0":
    visual front end + embedding + Conformer block 0 (25.78 M params); the other Conformer blocks, CTC head and decoder
    stay frozen. All BatchNorm running statistics frozen (eval mode); dropout active (model.train()), as Lipflow.
  * Loss: (0.1 * CTC_sum + 0.9 * label-smoothed attention_sum, the model's own criterion) / number of target tokens.
  * Input exactly as production (video.decode_clip → FaceMesh → mean-face warp → 96x96 grey ROI). Lipflow augmentation:
    random 88x88 crop, horizontal flip p=0.5, brightness/contrast jitter, two time masks (≤ 10 frames, ≤ T/5) filled
    with the clip mean. Validation: centre crop, no augmentation.
  * AdamW lr 1e-4, weight decay 1e-4, batch 1, gradient-norm clip 5, 6 epochs, seed 0 (Lipflow defaults).
  * Added for TACIT: validation after every epoch with the PRODUCTION decoder (fast beam 10, CTC 0.1); the overlay with
    the fewest validation word errors is kept (tie: higher reference log-prob), epoch 0 = the unchanged base; early stop
    after 2 epochs without improvement. If no epoch beats the base, no overlay is written.
Data hygiene (enforced; the run refuses otherwise): validation sessions are silent-only, disjoint from training sessions
and sentence-disjoint from every training clip; no session named *heldout* or recorded from heldout_v2.txt, and no
clip whose sentence is in prompts/heldout_v2.txt, may be used for training or validation. The held-out session is
evaluated ONCE per arm at the end with `eval.bench --session <heldout> --tag heldout1 --overlay data/adapt/<name>`.
Outputs (git-ignored): data/adapt/<name>/{overlay.pt, meta.json, log.jsonl}; ROI cache data/adapt/cache/.
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import hashlib
import json
import random
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import torch

from tacit_vsr import config, engine, video
from tacit_vsr.transcribe import wer

from eval.bench import decode, decode_frames, interp_lms, landmarks, to_tensor, warp_rois
from eval.dataset import read_prompts, resolve_session
from eval.sweep_decode import group_of, strict

from .overlay import DEFAULT_SCOPE, SCOPES, save_overlay, sha256_file, trainable_names

ADAPT_DIR = config.DATA_DIR / "adapt"
HELDOUT_PROMPTS = config.RECOGNITION_DIR / "prompts" / "heldout_v2.txt"
SEC_PER_STEP = 0.87  # measured on M3 Pro MPS, 5.5 s clips, frontend+embed+block0 (DEMO_READINESS D.16)
HP = {"lr": 1e-4, "weight_decay": 1e-4, "ctc_weight": 0.1, "grad_clip": 5.0, "flip_p": 0.5, "gain": (0.85, 1.15),
      "bias": (-0.06, 0.06), "time_masks": 2, "time_mask_max": 10, "patience": 2, "seed": 0}


@dataclass(frozen=True)
class Clip:
    session: str
    path: Path
    ref: str        # model label form (apostrophes kept) — the training target
    sentence: str   # scoring form (no apostrophes) — WER and disjointness checks
    mode: str       # silent | voiced


def load_sessions(dirs: list[str], modes: set[str]) -> list[Clip]:
    out = []
    for d in map(Path, dirs):
        missing = 0
        for l in open(d / "manifest.jsonl"):
            if not l.strip():
                continue
            it = json.loads(l)
            g = group_of(it)
            mode = "silent" if g.startswith("silent") else "voiced" if g == "voiced" else None
            if mode not in modes or not it.get("ref"):
                continue
            if not (d / it["file"]).exists():
                missing += 1
                continue
            out.append(Clip(d.name, d / it["file"], engine.normalize_text(it["ref"]), strict(it["ref"]), mode))
        if missing:
            print(f"warning: {d.name}: {missing} manifest clip(s) missing on disk — skipped")
    return out


def apply_excludes(clips: list[Clip], excludes: list[str]) -> tuple[list[Clip], list[str]]:
    """Drop clips named `<recording name>/<clip stem>` (e.g. adaptB/clip21 or adaptB/clip21-silent.mp4); the session is
    matched by its full directory name or its `-<name>` suffix. An exclude that matches nothing is refused (typo guard)."""
    keep, dropped = list(clips), []
    for ex in excludes:
        name, _, stem = ex.partition("/")
        stem = stem.removesuffix(".mp4")
        hit = [c for c in keep if (c.session == name or c.session.endswith("-" + name))
               and (c.path.stem == stem or c.path.stem.startswith(stem + "-"))]
        if not name or not stem or not hit:
            raise SystemExit(f"--exclude {ex!r} matches no clip (format: <recording name>/<clipNN>)")
        keep = [c for c in keep if c not in hit]
        dropped += [f"{c.session}/{c.path.name}" for c in hit]
    return keep, dropped


def heldout_session(d: Path) -> bool:
    if "heldout" in d.name.lower():
        return True
    for l in open(d / "manifest.jsonl"):
        if json.loads(l).get("prompts") == HELDOUT_PROMPTS.name:
            return True
    return False


def check_hygiene(train_dirs: list[str], val_dirs: list[str], train: list[Clip], val: list[Clip],
                  heldout_sentences: set[str]) -> list[str]:
    """Every reason the split is not allowed (empty = OK)."""
    problems = []
    for d in train_dirs + val_dirs:
        if heldout_session(Path(d)):
            problems.append(f"{Path(d).name} is a held-out session")
    shared = {Path(d).name for d in train_dirs} & {Path(d).name for d in val_dirs}
    if shared:
        problems.append(f"sessions in both train and validation: {sorted(shared)}")
    leak = sorted({c.sentence for c in train + val} & heldout_sentences)
    if leak:
        problems.append(f"{len(leak)} held-out sentence(s) in train/validation, e.g. {leak[0]!r}")
    overlap = sorted({c.sentence for c in train} & {c.sentence for c in val})
    if overlap:
        problems.append(f"{len(overlap)} validation sentence(s) also in training, e.g. {overlap[0]!r}")
    if any(c.mode != "silent" for c in val):
        problems.append("validation must be silent clips only")
    if not train:
        problems.append("no training clips")
    if not val:
        problems.append("no validation clips")
    return problems


def roi_for(clip: Clip, crop: video.MouthCropper) -> np.ndarray:
    cache = ADAPT_DIR / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    st = clip.path.stat()  # size + mtime in the key: a re-recorded clip at the same path is never served a stale ROI
    f = cache / (hashlib.sha1(f"{clip.path.resolve()}|{st.st_size}|{st.st_mtime_ns}".encode()).hexdigest()[:16] + ".npy")
    if f.exists():
        return np.load(f)
    P, _ = interp_lms(landmarks(clip.path, crop)["pts4"])
    if P is None:
        raise ValueError(f"no face tracked in {clip.path}")
    roi = warp_rois([cv2.cvtColor(x, cv2.COLOR_RGB2GRAY) for x in decode_frames(clip.path)], P, crop.stable_reference)
    np.save(f, roi)
    return roi


def augment(roi: np.ndarray, rng: random.Random) -> torch.Tensor:
    """Lipflow _augment: (T,96,96) uint8 → (1,T,88,88) normalised; random crop, flip, gain/bias jitter, 2 time masks."""
    y, x = rng.randint(0, 8), rng.randint(0, 8)
    v = roi[:, y:y + 88, x:x + 88].astype(np.float32) / 255.0
    if rng.random() < HP["flip_p"]:
        v = v[:, :, ::-1]
    v = v * rng.uniform(*HP["gain"]) + rng.uniform(*HP["bias"])
    T = len(v)
    for _ in range(HP["time_masks"]):
        w = rng.randint(0, min(HP["time_mask_max"], T // 5))
        s = rng.randint(0, max(T - w, 0))
        v[s:s + w] = v.mean()
    return ((torch.from_numpy(np.ascontiguousarray(v)) - 0.421) / 0.165).unsqueeze(0)


def set_train_mode(model: torch.nn.Module) -> None:
    """Lipflow: model.train() (dropout on) but every BatchNorm in eval mode — a few clips would wreck its statistics."""
    model.train()
    for m in model.modules():
        if isinstance(m, torch.nn.modules.batchnorm._BatchNorm):
            m.eval()


def hybrid_loss(eng: engine.VSREngine, x: torch.Tensor, ids: list[int]) -> torch.Tensor:
    from espnet.nets.pytorch_backend.transformer.mask import subsequent_mask

    # Production layout (engine.VSREngine): encoder on eng.device (MPS), decoder + CTC on CPU; autograd crosses the copy.
    enc, _ = eng.model.encoder(x.unsqueeze(0).to(eng.device), None)
    enc = enc.float().cpu()
    ys_in = torch.tensor([[eng.sos] + ids])
    ys_out = torch.tensor([ids + [eng.eos]])
    logits, _ = eng.model.decoder(ys_in, subsequent_mask(ys_in.size(1)).unsqueeze(0), enc, None)
    att = eng.model.criterion(logits, ys_out)  # the model's own LabelSmoothingLoss (0.1), summed over tokens
    lp = torch.log_softmax(eng.model.ctc.ctc_lo(enc), -1).transpose(0, 1)
    ctc = torch.nn.functional.ctc_loss(lp, torch.tensor([ids]), torch.tensor([enc.size(1)]), torch.tensor([len(ids)]),
                                       blank=0, reduction="sum", zero_infinity=True)
    return (HP["ctc_weight"] * ctc + (1 - HP["ctc_weight"]) * att) / len(ids)


@torch.no_grad()
def evaluate(eng: engine.VSREngine, items: list[tuple[Clip, np.ndarray]]) -> dict:
    eng.model.eval()
    e = n = exact = 0
    lps, rows = [], []
    for c, roi in items:
        enc = eng.encode(to_tensor(roi, ""))
        hyps = decode(eng, enc)
        hyp = strict(hyps[0][0]) if hyps else ""
        err, words = wer(c.sentence, hyp)
        e += err; n += words; exact += err == 0
        sc = eng.score_texts(enc, [c.ref])[0]
        lps.append(sc.att / (sc.n_tokens + 1))
        rows.append({"file": c.path.name, "ref": c.sentence, "hyp": hyp, "errors": err})
    return {"errors": e, "words": n, "wer": round(e / max(n, 1), 4), "exact": exact, "n": len(items),
            "ref_att_per_token": round(float(np.mean(lps)), 4), "rows": rows}


def git_rev() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=config.RECOGNITION_DIR, text=True).strip()
    except Exception:  # noqa: BLE001
        return "?"


def _is_val(ex: str, val_dirs: list[str]) -> bool:
    name = ex.partition("/")[0]
    return any(Path(d).name == name or Path(d).name.endswith("-" + name) for d in val_dirs)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--train", action="append", required=True, help="training session dir (repeatable)")
    ap.add_argument("--val", action="append", required=True, help="validation session dir (silent, sentence-disjoint)")
    ap.add_argument("--train-modes", default="silent", help="silent | silent,voiced")
    ap.add_argument("--scope", default=DEFAULT_SCOPE, choices=sorted(SCOPES))
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    ap.add_argument("--dry-run", action="store_true", help="check data hygiene and print the plan; no training")
    ap.add_argument("--max-steps", type=int, default=0, help="stop after N optimiser steps (pipeline smoke test only)")
    ap.add_argument("--out-root", default=str(ADAPT_DIR))
    ap.add_argument("--exclude", action="append", default=[], help="drop a clip, <recording name>/<clipNN> (repeatable), "
                    "e.g. a take replaced by a retake session; listed in meta.json")
    a = ap.parse_args()

    modes = set(a.train_modes.split(","))
    if not modes <= {"silent", "voiced"}:
        raise SystemExit("--train-modes must be silent and/or voiced")
    a.train = [str(resolve_session(s)) for s in a.train]
    a.val = [str(resolve_session(s)) for s in a.val]
    print("sessions: train " + ", ".join(Path(d).name for d in a.train) + "; validation " + ", ".join(Path(d).name for d in a.val))
    train, ex_train = apply_excludes(load_sessions(a.train, modes), [e for e in a.exclude if not _is_val(e, a.val)])
    val, ex_val = apply_excludes(load_sessions(a.val, {"silent"}), [e for e in a.exclude if _is_val(e, a.val)])
    if ex_train or ex_val:
        print(f"excluded {len(ex_train) + len(ex_val)} clip(s): " + ", ".join(ex_train + ex_val))
    heldout = {strict(s) for s in read_prompts(HELDOUT_PROMPTS)}
    problems = check_hygiene(a.train, a.val, train, val, heldout)
    print(f"train {len(train)} clips ({sum(c.mode == 'silent' for c in train)} silent, {sum(c.mode == 'voiced' for c in train)} "
          f"voiced) from {len(a.train)} session(s); validation {len(val)} silent clips from {len(a.val)} session(s)")
    if problems:
        raise SystemExit("refusing to train:\n  - " + "\n  - ".join(problems))
    print(f"plan: scope {a.scope}, up to {a.epochs} epochs x {len(train)} clips (batch 1), validation on {len(val)} clips "
          f"after each epoch; estimated {a.epochs * len(train) * SEC_PER_STEP / 60 + (a.epochs + 1) * len(val) * 0.4 / 60:.1f} "
          f"min on MPS (+ ~1 s/clip once to crop)")
    if a.dry_run:
        return
    out = Path(a.out_root) / a.name
    if out.exists():
        raise SystemExit(f"{out} exists — choose a new --name (runs are never overwritten)")

    random.seed(HP["seed"]); np.random.seed(HP["seed"]); torch.manual_seed(HP["seed"])
    rng = random.Random(HP["seed"])
    base_sha = sha256_file(config.MODEL_PATH, fresh=True)
    eng = engine.VSREngine(a.device)
    crop = video.MouthCropper()
    # Crop everything BEFORE creating the run directory: a clip without a tracked face stops here and the name stays free.
    tr = [(c, roi_for(c, crop), eng.tokenize(c.ref)) for c in train]
    va = [(c, roi_for(c, crop)) for c in val]
    out.mkdir(parents=True)
    names = set(trainable_names(eng.model, a.scope))
    for k, p in eng.model.named_parameters():
        p.requires_grad_(k in names)
    params = [p for p in eng.model.parameters() if p.requires_grad]
    print(f"trainable: {len(params)} tensors, {sum(p.numel() for p in params) / 1e6:.2f} M of "
          f"{sum(p.numel() for p in eng.model.parameters()) / 1e6:.1f} M parameters ({a.scope})")
    opt = torch.optim.AdamW(params, lr=HP["lr"], weight_decay=HP["weight_decay"])
    meta = {"name": a.name, "git": git_rev(), "device": a.device, "scope": a.scope, "epochs": a.epochs,
            "train_modes": sorted(modes), "hp": HP, "train_sessions": [Path(d).name for d in a.train],
            "val_sessions": [Path(d).name for d in a.val], "n_train": len(train), "n_val": len(val),
            "train_files": [f"{c.session}/{c.path.name}" for c in train], "val_files": [f"{c.session}/{c.path.name}" for c in val],
            "excluded": ex_train + ex_val,
            "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    log = open(out / "log.jsonl", "w")

    def record(epoch: int, res: dict, extra: dict) -> None:
        row = {"epoch": epoch, **{k: v for k, v in res.items() if k != "rows"}, **extra}
        log.write(json.dumps({**row, "rows": res["rows"]}) + "\n"); log.flush()
        print(f"epoch {epoch}: validation WER {res['errors']}/{res['words']} = {res['wer']:.3f}, exact {res['exact']}/{res['n']}, "
              f"ref logp/tok {res['ref_att_per_token']} {extra}", flush=True)

    best = evaluate(eng, va)
    record(0, best, {"note": "base (unchanged)"})
    best_epoch, step, stale = 0, 0, 0
    for epoch in range(1, a.epochs + 1):
        set_train_mode(eng.model)
        order = list(range(len(tr))); rng.shuffle(order)
        t0, losses = time.perf_counter(), []
        for j in order:
            c, roi, ids = tr[j]
            loss = hybrid_loss(eng, augment(roi, rng), ids)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(params, HP["grad_clip"])
            opt.step(); step += 1
            losses.append(float(loss.detach()))
            if a.max_steps and step >= a.max_steps:
                break
        if eng.device.type == "mps":
            torch.mps.empty_cache()
        res = evaluate(eng, va)
        better = (res["errors"], -res["ref_att_per_token"]) < (best["errors"], -best["ref_att_per_token"])
        record(epoch, res, {"train_loss": round(float(np.mean(losses)), 4), "train_s": round(time.perf_counter() - t0),
                            "best": better})
        if better:
            best, best_epoch, stale = res, epoch, 0
            save_overlay(eng.model, sorted(names), out, {**meta, "selected_epoch": epoch,
                                                         "val": {k: v for k, v in res.items() if k != "rows"}})
        else:
            stale += 1
        if (a.max_steps and step >= a.max_steps) or stale >= HP["patience"]:
            break
    if sha256_file(config.MODEL_PATH, fresh=True) != base_sha:  # no run.json → load_overlay refuses this run's overlay
        raise SystemExit("BASE CHECKPOINT CHANGED ON DISK — investigate before using anything from this run")
    summary = {**meta, "selected_epoch": best_epoch, "finished": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "base_sha256": base_sha, "overlay_written": best_epoch > 0}
    (out / "run.json").write_text(json.dumps(summary, indent=1))
    print(f"selected epoch {best_epoch}" + ("" if best_epoch else " — the base model stays best; no overlay written")
          + f"; outputs in {out}")


if __name__ == "__main__":
    main()
