"""Recognizer profile selector: default base, precedence, fail-safe fallback (no model weights needed).
Run: .venv/bin/python -m unittest discover -s tests"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tacit_vsr import profiles  # noqa: E402


class FakeEng:
    def __init__(self):
        self.model = torch.nn.Linear(2, 2)


class Selection(unittest.TestCase):
    def setUp(self):
        self.f = Path(tempfile.mkdtemp()) / "vsr_profile.json"

    def test_default_is_base(self):
        self.assertEqual(profiles.selected({}, self.f), ("base", "default"))

    def test_file_then_env_precedence(self):
        self.f.write_text(json.dumps({"profile": "personal-demo"}))
        self.assertEqual(profiles.selected({}, self.f), ("personal-demo", "file"))
        self.assertEqual(profiles.selected({"TACIT_VSR_PROFILE": "base"}, self.f), ("base", "env"))

    def test_unreadable_file_is_reported_not_guessed(self):
        self.f.write_text("{not json")
        pid, src = profiles.selected({}, self.f)
        self.assertNotIn(pid, profiles.PROFILES)
        self.assertEqual(src, "file")


class Apply(unittest.TestCase):
    def test_base_is_untouched_and_not_review_required(self):
        e = FakeEng()
        out, d = profiles.apply(e, "base", "default", rebuild=lambda: self.fail("no rebuild"))
        self.assertIs(out, e)
        self.assertEqual((d["id"], d["reviewRequired"], d["experimental"], d["error"]), ("base", False, False, None))
        self.assertEqual(profiles.model_name(profiles.PROFILES["base"]), profiles.config.MODEL_NAME)

    def test_unknown_profile_falls_back_to_base(self):
        _, d = profiles.apply(FakeEng(), "nope", "env", rebuild=lambda: self.fail("no rebuild"))
        self.assertEqual(d["id"], "base")
        self.assertIn("unknown profile", d["error"])

    def test_hash_mismatch_falls_back_to_base_without_copying(self):
        e = FakeEng()
        before = e.model.weight.detach().clone()
        with mock.patch.object(profiles, "verify", side_effect=ValueError("overlay.pt sha256 mismatch")), \
                mock.patch("adapt.overlay.load_overlay", side_effect=AssertionError("must not load")):
            out, d = profiles.apply(e, "personal-demo", "file", rebuild=lambda: self.fail("no rebuild"))
        self.assertIs(out, e)
        self.assertTrue(torch.equal(before, e.model.weight))
        self.assertEqual((d["id"], d["reviewRequired"]), ("base", False))
        self.assertIn("refused", d["error"])

    def test_partial_copy_failure_rebuilds_a_clean_base(self):
        fresh = FakeEng()
        with mock.patch.object(profiles, "verify"), \
                mock.patch("adapt.overlay.load_overlay", side_effect=RuntimeError("MPS copy failed")):
            out, d = profiles.apply(FakeEng(), "personal-demo", "file", rebuild=lambda: fresh)
        self.assertIs(out, fresh)
        self.assertEqual(d["id"], "base")
        self.assertIn("failed", d["error"])

    def test_personal_profile_is_experimental_and_review_required(self):
        with mock.patch.object(profiles, "verify"), mock.patch("adapt.overlay.load_overlay") as load:
            _, d = profiles.apply(FakeEng(), "personal-demo", "file", rebuild=lambda: self.fail("no rebuild"))
        load.assert_called_once()
        self.assertEqual((d["id"], d["experimental"], d["reviewRequired"], d["error"]), ("personal-demo", True, True, None))
        self.assertIn("EXPERIMENTAL", profiles.model_name(profiles.PROFILES["personal-demo"]))

    def test_every_non_base_profile_requires_review(self):
        for p in profiles.PROFILES.values():
            if p.overlay_dir is not None:
                self.assertTrue(p.review_required and p.experimental, p.id)


if __name__ == "__main__":
    unittest.main()
