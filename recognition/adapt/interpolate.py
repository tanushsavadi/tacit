"""Weight-space interpolation of a finished adaptation overlay toward the unchanged base (WiSE-FT, Wortsman et al.,
CVPR 2022): theta = theta_base + alpha * (theta_adapted - theta_base) for every tensor in the overlay. No training; the
result is an ordinary overlay (same tensors, same architecture), loadable by `eval.bench --overlay` like any other.

    .venv/bin/python -m adapt.interpolate --source data/adapt/silent1 --alpha 0.5 --name silent1_w50

The source overlay is only read (it must be a finished run on the current base checkpoint); the base is only read.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch

from tacit_vsr import config

from .overlay import sha256_file

ADAPT_DIR = config.DATA_DIR / "adapt"


def interpolate_state(base: dict[str, torch.Tensor], adapted: dict[str, torch.Tensor], alpha: float) -> dict[str, torch.Tensor]:
    if not 0.0 < alpha < 1.0:
        raise ValueError(f"alpha must be strictly between 0 and 1 (got {alpha}); 0 = base, 1 = the source overlay")
    out = {}
    for k, v in adapted.items():
        if k not in base or base[k].shape != v.shape:
            raise ValueError(f"overlay tensor {k} does not match the base checkpoint")
        b = base[k].to(torch.float32)
        out[k] = (b + alpha * (v.to(torch.float32) - b)).to(v.dtype)
    return out


def write_interpolated(source: Path, out: Path, alpha: float) -> dict:
    run_p, ov_p = source / "run.json", source / "overlay.pt"
    if not run_p.exists():
        raise ValueError(f"{source}: no run.json — not a finished run")
    run = json.loads(run_p.read_text())
    if not run.get("overlay_written"):
        raise ValueError(f"{source}: the run wrote no overlay")
    blob = torch.load(ov_p, map_location="cpu", weights_only=True)
    if blob["meta"].get("selected_epoch") != run.get("selected_epoch"):
        raise ValueError(f"{source}: run.json and overlay.pt disagree on the selected epoch")
    base_sha = sha256_file(config.MODEL_PATH, fresh=True)
    if blob["meta"].get("base_sha256") != base_sha:
        raise ValueError(f"{source}: overlay was trained on another base checkpoint")
    if out.exists():
        raise ValueError(f"{out} exists — refusing to overwrite")
    base = torch.load(str(config.MODEL_PATH), map_location="cpu", weights_only=True)
    state = interpolate_state(base, blob["state"], alpha)
    src_sha = sha256_file(ov_p, fresh=True)
    meta = {**blob["meta"], "name": out.name, "base_sha256": base_sha,
            "interpolation": {"method": "wise-ft", "alpha": alpha, "source": source.name, "source_overlay_sha256": src_sha},
            "n_tensors": len(state), "n_params": int(sum(v.numel() for v in state.values()))}
    out.mkdir(parents=True)
    torch.save({"state": state, "meta": meta}, out / "overlay.pt")
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    summary = {"name": out.name, "selected_epoch": meta.get("selected_epoch"), "overlay_written": True,
               "base_sha256": base_sha, "interpolation": meta["interpolation"], "scope": meta.get("scope"),
               "finished": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    if sha256_file(config.MODEL_PATH, fresh=True) != base_sha or sha256_file(ov_p, fresh=True) != src_sha:
        raise RuntimeError("base checkpoint or source overlay changed during interpolation — no run.json written")
    (out / "run.json").write_text(json.dumps(summary, indent=1))
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--source", required=True, help="finished run directory, e.g. data/adapt/silent1")
    ap.add_argument("--alpha", type=float, required=True, help="0 < alpha < 1 (fraction of the adaptation kept)")
    ap.add_argument("--name", required=True)
    ap.add_argument("--out-root", default=str(ADAPT_DIR))
    a = ap.parse_args()
    s = write_interpolated(Path(a.source), Path(a.out_root) / a.name, a.alpha)
    print(json.dumps(s, indent=1))


if __name__ == "__main__":
    main()
