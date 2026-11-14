"""Personal-adaptation overlays: only the fine-tuned parameters, applied on top of the UNCHANGED base checkpoint.

The base weights (third_party/visual/weights/LRS3_V_WER19.1/model.pth) are only ever read. An overlay stores the trained
tensors plus the SHA-256 of the base file it was trained from; loading refuses a different base. The production
recognizer (tacit_vsr.service / transcribe) never loads overlays — only eval tools do, explicitly (eval.bench --overlay).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import torch

from tacit_vsr import config

_SHA_CACHE: dict[str, str] = {}


def sha256_file(path: Path) -> str:
    key = f"{path.resolve()}|{path.stat().st_mtime_ns}|{path.stat().st_size}"
    if key not in _SHA_CACHE:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 22), b""):
                h.update(chunk)
        _SHA_CACHE[key] = h.hexdigest()
    return _SHA_CACHE[key]


SCOPES = {
    # Lipflow / Silent Voice speaker adaptation (lipflow/train_vsr.py DEFAULT_SCOPE "frontend+encoder1"): the visual front
    # end (3D conv + ResNet), the embedding and Conformer block 0 — 162 tensors, 25.78 M parameters in this checkpoint.
    "frontend+embed+block0": lambda n: ("encoder.frontend.", "encoder.embed.", "encoder.encoders.0."),
    # Alternative arm (no external evidence): the top 3 Conformer blocks + the final encoder LayerNorm.
    "top3": lambda n: tuple(f"encoder.encoders.{i}." for i in range(n - 3, n)) + ("encoder.after_norm.",),
}
DEFAULT_SCOPE = "frontend+embed+block0"


def trainable_names(model: torch.nn.Module, scope: str = DEFAULT_SCOPE) -> list[str]:
    """Parameter names updated by an adaptation scope (everything else stays frozen)."""
    if scope not in SCOPES:
        raise ValueError(f"unknown scope {scope!r}; choose from {sorted(SCOPES)}")
    prefixes = SCOPES[scope](len(model.encoder.encoders))
    return [k for k, _ in model.named_parameters() if k.startswith(prefixes)]


def save_overlay(model: torch.nn.Module, names: list[str], out_dir: Path, meta: dict) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    params = dict(model.named_parameters())
    state = {k: params[k].detach().cpu().clone() for k in names}
    full = {**meta, "base_sha256": sha256_file(config.MODEL_PATH), "n_tensors": len(state),
            "n_params": int(sum(v.numel() for v in state.values()))}
    torch.save({"state": state, "meta": full}, out_dir / "overlay.pt")
    (out_dir / "meta.json").write_text(json.dumps(full, indent=1))
    return out_dir / "overlay.pt"


def load_overlay(model: torch.nn.Module, out_dir: Path) -> dict:
    blob = torch.load(Path(out_dir) / "overlay.pt", map_location="cpu", weights_only=True)
    meta, state = blob["meta"], blob["state"]
    base = sha256_file(config.MODEL_PATH)
    if meta.get("base_sha256") != base:
        raise ValueError(f"overlay was trained on base {meta.get('base_sha256')}, current base is {base}")
    params = dict(model.named_parameters())
    for k, v in state.items():
        if k not in params or params[k].shape != v.shape:
            raise ValueError(f"overlay tensor {k} does not match the model")
    with torch.no_grad():
        for k, v in state.items():
            params[k].copy_(v.to(params[k].device))
    return meta
