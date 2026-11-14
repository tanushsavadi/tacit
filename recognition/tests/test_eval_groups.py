"""Evaluation grouping must never count voiced clips as silent. Run: .venv/bin/python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from eval.sweep_decode import group_of  # noqa: E402


class Groups(unittest.TestCase):
    def test_explicit_modes(self):
        self.assertEqual(group_of({"mode": "voiced", "prompted": True}), "voiced")
        self.assertEqual(group_of({"mode": "silent", "prompted": True}), "silent_prompted")
        self.assertEqual(group_of({"mode": "silent", "prompted": False}), "silent_own")

    def test_nonspeech_controls_are_their_own_group(self):
        self.assertEqual(group_of({"mode": "nonspeech", "ref": "", "kind": "smile"}), "nonspeech")

    def test_unlabelled_mode_is_voiced_not_silent(self):
        # `record_webcam.py --modes ""` clips were prompted "speak normally" (DEMO_READINESS D.2, session C)
        self.assertEqual(group_of({"mode": "", "prompted": True}), "voiced")
        self.assertEqual(group_of({"mode": "", "prompted": False}), "voiced")


if __name__ == "__main__":
    unittest.main()
