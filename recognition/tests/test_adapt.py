"""Personal-adaptation pipeline guarantees (no model weights needed). Run: .venv/bin/python -m unittest discover -s tests"""
import json
import random
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from adapt import overlay  # noqa: E402
from adapt.finetune import Clip, augment, check_hygiene, heldout_session, set_train_mode  # noqa: E402


def clip(session, sentence, mode="silent"):
    return Clip(session, Path(f"/x/{session}/{sentence}.mp4"), sentence, sentence, mode)


class Hygiene(unittest.TestCase):
    def setUp(self):
        self.dirs = tempfile.mkdtemp()
        for name in ("adaptA", "adaptVal"):
            d = Path(self.dirs) / name
            d.mkdir()
            (d / "manifest.jsonl").write_text(json.dumps({"file": "c.mp4", "ref": "x", "mode": "silent"}) + "\n")
        self.A, self.V = str(Path(self.dirs) / "adaptA"), str(Path(self.dirs) / "adaptVal")

    def test_clean_split_passes(self):
        self.assertEqual(check_hygiene([self.A], [self.V], [clip("adaptA", "OPEN IT")], [clip("adaptVal", "CLOSE IT")], {"HELD"}), [])

    def test_heldout_sentence_validation_overlap_voiced_val_and_shared_session_refused(self):
        p = check_hygiene([self.A], [self.A], [clip("adaptA", "HELD"), clip("adaptA", "SAME")],
                          [clip("adaptA", "SAME"), clip("adaptA", "V", "voiced")], {"HELD"})
        text = " | ".join(p)
        for needle in ("both train and validation", "held-out sentence", "also in training", "silent clips only"):
            self.assertIn(needle, text)

    def test_heldout_session_detected_by_name_or_prompt_file(self):
        d = Path(self.dirs) / "20261115T000000Z-heldout1"; d.mkdir()
        (d / "manifest.jsonl").write_text("")
        self.assertTrue(heldout_session(d))
        e = Path(self.dirs) / "s9"; e.mkdir()
        (e / "manifest.jsonl").write_text(json.dumps({"file": "a.mp4", "ref": "x", "prompts": "heldout_v2.txt"}) + "\n")
        self.assertTrue(heldout_session(e))
        self.assertFalse(heldout_session(Path(self.A)))
        self.assertTrue(check_hygiene([str(e)], [self.V], [clip("s9", "A")], [clip("adaptVal", "B")], set()))


class Augment(unittest.TestCase):
    def test_shape_determinism_and_bounded_masking(self):
        roi = np.full((100, 96, 96), 128, np.uint8)
        a, b = augment(roi, random.Random(3)), augment(roi, random.Random(3))
        self.assertEqual(tuple(a.shape), (1, 100, 88, 88))
        self.assertTrue(torch.equal(a, b))
        frames = a[0].flatten(1)
        masked = int((frames.std(1) < 1e-6).sum())  # constant roi → every frame flat; check the count bound instead
        self.assertLessEqual(masked, 100)
        varied = augment(np.random.RandomState(0).randint(0, 255, (100, 96, 96)).astype(np.uint8), random.Random(1))[0]
        flat = int((varied.flatten(1).std(1) < 1e-6).sum())  # time-masked frames are filled with one value
        self.assertLessEqual(flat, 2 * 10)  # 2 masks of ≤ 10 frames


class TinyEncoder(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.frontend = torch.nn.Sequential(torch.nn.Conv2d(1, 2, 3), torch.nn.BatchNorm2d(2))
        self.embed = torch.nn.Linear(4, 4)
        self.encoders = torch.nn.ModuleList([torch.nn.Sequential(torch.nn.Linear(4, 4), torch.nn.BatchNorm1d(4), torch.nn.Dropout(0.1))
                                             for _ in range(4)])
        self.after_norm = torch.nn.LayerNorm(4)


class Tiny(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = TinyEncoder()
        self.decoder = torch.nn.Linear(4, 4)


class OverlayAndModes(unittest.TestCase):
    def test_default_scope_is_lipflow_frontend_embed_block0(self):
        names = overlay.trainable_names(Tiny())
        self.assertEqual(overlay.DEFAULT_SCOPE, "frontend+embed+block0")
        self.assertTrue(all(n.startswith(("encoder.frontend.", "encoder.embed.", "encoder.encoders.0.")) for n in names))
        self.assertTrue(any(n.startswith("encoder.encoders.0.") for n in names))
        self.assertFalse(any(n.startswith(("encoder.encoders.1.", "decoder.")) for n in names))

    def test_top3_scope_and_unknown_scope(self):
        names = overlay.trainable_names(Tiny(), "top3")
        self.assertTrue(all(n.startswith(("encoder.encoders.1.", "encoder.encoders.2.", "encoder.encoders.3.",
                                          "encoder.after_norm.")) for n in names))
        with self.assertRaises(ValueError):
            overlay.trainable_names(Tiny(), "everything")

    def test_every_batchnorm_frozen_while_dropout_trains(self):
        m = Tiny()
        set_train_mode(m)
        self.assertTrue(m.training and m.encoder.encoders[3][2].training)
        bns = [x for x in m.modules() if isinstance(x, torch.nn.modules.batchnorm._BatchNorm)]
        self.assertTrue(bns and not any(b.training for b in bns))

    def test_overlay_roundtrip_and_base_mismatch_refused(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td) / "model.pth"; base.write_bytes(b"base-v1")
            orig = overlay.config.MODEL_PATH
            overlay.config.MODEL_PATH = base
            try:
                src, dst = Tiny(), Tiny()
                names = overlay.trainable_names(src)
                overlay.save_overlay(src, names, Path(td) / "run", {"name": "t", "selected_epoch": 2})
                with self.assertRaises(ValueError):  # interrupted run: overlay.pt but no run.json
                    overlay.load_overlay(dst, Path(td) / "run")
                run = Path(td) / "run" / "run.json"
                run.write_text(json.dumps({"overlay_written": True, "selected_epoch": 3}))
                with self.assertRaises(ValueError):  # run.json from a different epoch than overlay.pt
                    overlay.load_overlay(dst, Path(td) / "run")
                run.write_text(json.dumps({"overlay_written": True, "selected_epoch": 2}))
                meta = overlay.load_overlay(dst, Path(td) / "run")
                p_src, p_dst = dict(src.named_parameters()), dict(dst.named_parameters())
                self.assertTrue(all(torch.equal(p_src[k], p_dst[k]) for k in names))
                self.assertFalse(torch.equal(p_src["encoder.encoders.3.0.weight"], p_dst["encoder.encoders.3.0.weight"]))  # frozen block: not in the overlay
                self.assertEqual(meta["n_tensors"], len(names))
                base.write_bytes(b"base-v2")
                with self.assertRaises(ValueError):
                    overlay.load_overlay(Tiny(), Path(td) / "run")
            finally:
                overlay.config.MODEL_PATH = orig


class SessionResolution(unittest.TestCase):
    def test_bare_name_resolves_to_the_single_recorded_session(self):
        from eval.dataset import resolve_session
        with tempfile.TemporaryDirectory() as td:
            web = Path(td)
            for name, lines in (("20261114T230000Z-adaptA", 1), ("20261114T225900Z-adaptA", 0), ("20261114T230500Z-adaptVal", 1),
                                ("20261114T231000Z-adaptVal", 1)):
                (web / name).mkdir()
                (web / name / "manifest.jsonl").write_text('{"file": "c.mp4", "ref": "x", "mode": "silent"}\n' * lines)
            self.assertEqual(resolve_session("adaptA", web).name, "20261114T230000Z-adaptA")  # empty aborted start ignored
            self.assertEqual(resolve_session(str(web / "20261114T230500Z-adaptVal"), web).name, "20261114T230500Z-adaptVal")
            with self.assertRaises(SystemExit):
                resolve_session("adaptVal", web)  # two recorded sessions: ambiguous, never guessed
            with self.assertRaises(SystemExit):
                resolve_session("adaptB", web)  # not recorded


if __name__ == "__main__":
    unittest.main()
