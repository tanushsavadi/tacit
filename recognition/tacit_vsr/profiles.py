"""Recognizer model profiles for the live service. The default is the unchanged base model; overlays are opt-in.

    .venv/bin/python -m tacit_vsr.profiles status          # selected profile + pinned hashes check (no model load)
    .venv/bin/python -m tacit_vsr.profiles set personal-demo
    .venv/bin/python -m tacit_vsr.profiles set base        # rollback (or: clear)

Selection order: TACIT_VSR_PROFILE env var > data/vsr_profile.json (git-ignored) > "base". The service reads it once at
start, so a change takes effect when the sidecar restarts (`./scripts/tacit.sh profile <id>` does both).

The base checkpoint is only ever read. An overlay profile is applied on top of it in memory, only after the overlay file,
its run.json and the base checkpoint match pinned SHA-256s; any mismatch or load error falls back to the base model and
reports the error (fail-safe, never a half-applied model). Experimental profiles are review-required: the service tags
every result with that flag and the TACIT server refuses real-time (unreviewed) speech while it is set.
"""
from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path

from . import config

PROFILE_FILE = config.DATA_DIR / "vsr_profile.json"
BASE_SHA256 = "e740cef369abeabd0ba2c18e37a0661342e1d94d432d6caa77755a11821d8fe3"


@dataclass(frozen=True)
class Profile:
    id: str
    label: str
    experimental: bool
    review_required: bool
    overlay_dir: Path | None = None
    overlay_sha256: str | None = None
    run_sha256: str | None = None


PROFILES = {
    "base": Profile("base", "Base model (no personal overlay)", experimental=False, review_required=False),
    # silent2_251 (docs/research/TACIT_PERSONAL_ADAPTATION_V2.md): one speaker (the project author), 251 silent clips
    # including the 50 Session E demo phrases. It FAILED the pre-registered general-release gate (CREMA-D +5.2 pt,
    # resting-face guard) — local, single-speaker demo use only, and only with Review First.
    "personal-demo": Profile(
        "personal-demo", "EXPERIMENTAL personal demo profile (silent2_251 overlay, one speaker, review required)",
        experimental=True, review_required=True,
        overlay_dir=config.DATA_DIR / "adapt" / "silent2_251",
        overlay_sha256="48460d674f3864984dcb908f8391871d3771bf28aeb5c2b00cba4366d4d9559d",
        run_sha256="9ee4e6febbde6dda5ceeb09d35cce21a995256099c3c18dd15878d5339db7f38"),
}


def selected(env: dict | None = None, path: Path = PROFILE_FILE) -> tuple[str, str]:
    """(profile id as requested, source). Unknown ids are returned as-is; apply() rejects them."""
    env = os.environ if env is None else env
    if env.get("TACIT_VSR_PROFILE"):
        return env["TACIT_VSR_PROFILE"].strip(), "env"
    try:
        pid = json.loads(path.read_text()).get("profile")
        if isinstance(pid, str) and pid:
            return pid, "file"
    except FileNotFoundError:
        pass
    except (OSError, ValueError, AttributeError):
        return "<unreadable vsr_profile.json>", "file"
    return "base", "default"


def verify(p: Profile) -> None:
    """Raise ValueError unless every pinned file hash matches (fresh full reads)."""
    from adapt.overlay import sha256_file
    checks = [(config.MODEL_PATH, BASE_SHA256)]
    if p.overlay_dir is not None:
        checks += [(p.overlay_dir / "overlay.pt", p.overlay_sha256), (p.overlay_dir / "run.json", p.run_sha256)]
    for f, want in checks:
        if not f.exists():
            raise ValueError(f"{f.name} missing ({f.parent.name})")
        got = sha256_file(f, fresh=True)
        if got != want:
            raise ValueError(f"{f.parent.name}/{f.name} sha256 {got[:12]}… ≠ pinned {str(want)[:12]}…")


def describe(p: Profile, source: str, requested: str, error: str | None = None) -> dict:
    return {"id": p.id, "label": p.label, "experimental": p.experimental, "reviewRequired": p.review_required,
            "overlay": p.overlay_dir.name if p.overlay_dir else None, "overlaySha256": p.overlay_sha256,
            "source": source, "requested": requested, "error": error}


def model_name(p: Profile) -> str:
    return config.MODEL_NAME if p.overlay_dir is None else f"{config.MODEL_NAME} + EXPERIMENTAL personal overlay {p.overlay_dir.name} (review required)"


def apply(eng, requested: str, source: str, rebuild) -> tuple[object, dict]:
    """Apply the requested profile to a freshly loaded base engine. Returns (engine, description). On any failure the
    returned engine is the base model (rebuilt if an overlay copy may have been partial) and the error is reported."""
    p = PROFILES.get(requested)
    if p is None:
        return eng, describe(PROFILES["base"], source, requested, f"unknown profile {requested!r}; using base")
    if p.overlay_dir is None:
        return eng, describe(p, source, requested)
    try:
        verify(p)
    except ValueError as e:  # nothing was copied yet
        return eng, describe(PROFILES["base"], source, requested, f"{p.id} refused: {e}; using base")
    from adapt.overlay import load_overlay
    try:
        load_overlay(eng.model, p.overlay_dir)
    except ValueError as e:  # load_overlay validates everything before copying a tensor
        return eng, describe(PROFILES["base"], source, requested, f"{p.id} refused: {e}; using base")
    except Exception as e:  # noqa: BLE001 — a copy may be partial: start again from a clean base model
        return rebuild(), describe(PROFILES["base"], source, requested, f"{p.id} failed: {type(e).__name__}: {e}; using base")
    return eng, describe(p, source, requested)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    s = sub.add_parser("set"); s.add_argument("profile", choices=sorted(PROFILES))
    sub.add_parser("clear")
    a = ap.parse_args()
    if a.cmd == "set":
        if a.profile == "base":
            PROFILE_FILE.unlink(missing_ok=True)
        else:
            verify(PROFILES[a.profile])
            PROFILE_FILE.write_text(json.dumps({"profile": a.profile}) + "\n")
    elif a.cmd == "clear":
        PROFILE_FILE.unlink(missing_ok=True)
    pid, src = selected()
    p = PROFILES.get(pid)
    err = None
    if p is None:
        err = f"unknown profile {pid!r} (service would use base)"
    else:
        try:
            verify(p)
        except ValueError as e:
            err = f"{e} (service would use base)"
    print(json.dumps({"selected": pid, "source": src, "label": p.label if p else None,
                      "reviewRequired": p.review_required if p else False, "hashCheck": err or "ok"}))


if __name__ == "__main__":
    main()
