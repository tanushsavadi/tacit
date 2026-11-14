"""Own-recording dataset tooling for personalisation and held-out evaluation, with leakage checks.

    .venv/bin/python -m eval.dataset inventory                       # clips per session / group, sentence reuse
    .venv/bin/python -m eval.dataset prompts-check prompts/heldout_v2.txt [--against prompts/adapt_v1.txt]
    .venv/bin/python -m eval.dataset split NAME --test-sessions <dir>[,<dir>] [--test-prompts prompts/heldout_v2.txt]
Split rule (both enforced, `split` refuses to write a leaky split): the test side is whole sessions (never clips of a
training session) AND no test sentence appears anywhere in training. Training clips whose sentence occurs in the test
side are DROPPED, not moved. Splits go to data/eval/splits/NAME.json (git-ignored). Non-speech clips (smile, swallow,
listening) never enter training; they are evaluation controls only.
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

from tacit_vsr import config, engine
from tacit_vsr.phrases import PHRASES

from .sweep_decode import group_of

HERE = Path(__file__).resolve().parent
ROOT = config.RECOGNITION_DIR
WEBCAM = config.DATA_DIR / "webcam"


def norm(s: str) -> str:
    return engine.normalize_text(s).replace("'", "")


def read_prompts(path: Path) -> list[str]:
    return [l.strip() for l in open(path) if l.strip() and not l.lstrip().startswith("#")]


def own_items(webcam: Path = WEBCAM) -> list[dict]:
    out = []
    for man in sorted(webcam.glob("*/manifest.jsonl")):
        for l in open(man):
            it = json.loads(l)
            if not (man.parent / it["file"]).exists():
                continue
            out.append({"session": man.parent.name, "file": it["file"], "ref": norm(it.get("ref") or ""),
                        "mode": it.get("mode", ""), "group": group_of(it), "kind": it.get("kind")})
    return out


def studied_sentences() -> dict[str, str]:
    """Every sentence TACIT development has already looked at → where it came from."""
    import record_webcam  # noqa: PLC0415 (recognition/ is on sys.path when run as -m from recognition/)
    seen: dict[str, str] = {}
    for s in PHRASES:
        seen.setdefault(norm(s), "phrase list")
    for s in record_webcam.PROMPTS:
        seen.setdefault(norm(s), "record_webcam PROMPTS")
    for it in json.load(open(HERE / "cremad_manifest.json")):
        seen.setdefault(norm(it["text"]), "CREMA-D")
    for it in own_items():
        if it["ref"]:
            seen.setdefault(it["ref"], f"recorded session {it['session']}")
    lt = ROOT.parent / "server" / "scripts" / "live-test.ts"
    if lt.exists():
        import re  # noqa: PLC0415
        body = lt.read_text()
        block = body[body.find("const SETS"): body.find("};", body.find("const SETS"))]
        for s in re.findall(r"'([^']+)'", block):
            if " " in s:
                seen.setdefault(norm(s), "live:test sets")
    return seen


def leakage(train: list[dict], test: list[dict]) -> dict:
    """Shared sessions and shared sentences between two clip lists (both must be empty for an honest split)."""
    return {"sessions": sorted({x["session"] for x in train} & {x["session"] for x in test}),
            "sentences": sorted({x["ref"] for x in train} & {x["ref"] for x in test})}


def make_split(items: list[dict], test_sessions: set[str], test_prompts: set[str] | None = None) -> dict:
    speech = [x for x in items if x["group"] != "nonspeech" and x["ref"]]
    test = [x for x in speech if x["session"] in test_sessions and (test_prompts is None or x["ref"] in test_prompts)]
    test_refs = {x["ref"] for x in test}
    train_all = [x for x in speech if x["session"] not in test_sessions]
    train = [x for x in train_all if x["ref"] not in test_refs]
    controls = [x for x in items if x["group"] == "nonspeech" and x["session"] in test_sessions]
    leak = leakage(train, test)
    return {"train": train, "test": test, "nonspeech_test": controls, "dropped_train_for_sentence_overlap": len(train_all) - len(train),
            "leakage": leak}


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("inventory")
    pc = sub.add_parser("prompts-check"); pc.add_argument("file"); pc.add_argument("--against", action="append", default=[])
    sp = sub.add_parser("split"); sp.add_argument("name"); sp.add_argument("--test-sessions", required=True)
    sp.add_argument("--test-prompts")
    a = ap.parse_args()

    if a.cmd == "inventory":
        items = own_items()
        c = collections.Counter((x["session"], x["group"]) for x in items)
        for (s, g), n in sorted(c.items()):
            print(f"{s:34s} {g:16s} {n:3d}")
        refs = collections.Counter(x["ref"] for x in items if x["ref"])
        print(f"\n{len(items)} clips, {len(refs)} distinct sentences; sentences recorded more than once: "
              f"{sum(1 for n in refs.values() if n > 1)} (a sentence-disjoint split must drop these from training)")
        silent = [x for x in items if x["group"].startswith("silent")]
        print(f"silent clips: {len(silent)}; for a speaker-adaptation experiment plan >= 100 silent training clips of "
              f"prompts/adapt_v1.txt in >= 2 sessions + a separate held-out session of prompts/heldout_v2.txt")
        return

    if a.cmd == "prompts-check":
        prompts = read_prompts(Path(a.file))
        seen = studied_sentences()
        for f in a.against:
            for s in read_prompts(Path(f)):
                seen.setdefault(norm(s), f)
        dup = [s for s, n in collections.Counter(norm(p) for p in prompts).items() if n > 1]
        clash = [(p, seen[norm(p)]) for p in prompts if norm(p) in seen]
        print(f"{a.file}: {len(prompts)} prompts, {len(dup)} duplicates, {len(clash)} already studied/used")
        for p, src in clash:
            print(f"  CLASH {p!r} ← {src}")
        for d in dup:
            print(f"  DUPLICATE {d!r}")
        sys.exit(1 if (dup or clash) else 0)

    if a.cmd == "split":
        tp = {norm(s) for s in read_prompts(Path(a.test_prompts))} if a.test_prompts else None
        sp = make_split(own_items(), set(a.test_sessions.split(",")), tp)
        if sp["leakage"]["sessions"] or sp["leakage"]["sentences"]:
            raise SystemExit(f"refusing leaky split: {sp['leakage']}")
        out = config.DATA_DIR / "eval" / "splits" / f"{a.name}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        json.dump(sp, open(out, "w"), indent=1)
        print(f"train {len(sp['train'])} (dropped {sp['dropped_train_for_sentence_overlap']} for sentence overlap), "
              f"test {len(sp['test'])}, non-speech controls {len(sp['nonspeech_test'])} → {out}")


if __name__ == "__main__":
    main()
