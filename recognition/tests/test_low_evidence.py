"""Open-vocabulary display floor: low-evidence decodes are abstained, real-utterance-like evidence is kept.
Run: .venv/bin/python -m unittest discover -s tests"""
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tacit_vsr.transcribe import LOW_EVIDENCE, low_evidence  # noqa: E402


class LowEvidence(unittest.TestCase):
    def test_smile_like_decode_is_abstained(self):
        self.assertEqual(low_evidence(-2.894, -1.5), LOW_EVIDENCE)   # held-out v1 smile ("SO")
        self.assertEqual(low_evidence(-1.69, -1.5), LOW_EVIDENCE)    # resting-face junk that passed the motion gate

    def test_weakest_real_utterance_is_kept(self):
        self.assertIsNone(low_evidence(-1.177, -1.5))  # lowest real utterance in the development benchmark
        self.assertIsNone(low_evidence(-0.1, -1.5))

    def test_boundary_and_missing(self):
        self.assertIsNone(low_evidence(-1.5, -1.5))
        self.assertIsNone(low_evidence(None, -1.5))
        self.assertIsNone(low_evidence(float("nan"), -1.5))

    def test_disabled_floor_keeps_everything(self):
        self.assertIsNone(low_evidence(-50.0, -math.inf))


if __name__ == "__main__":
    unittest.main()
