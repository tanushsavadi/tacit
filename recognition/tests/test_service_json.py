"""The service's JSON must parse in JavaScript: no -Infinity/NaN. Run: .venv/bin/python -m unittest discover -s tests"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tacit_vsr.service import finite_json  # noqa: E402


class FiniteJson(unittest.TestCase):
    def test_non_finite_floats_become_null(self):
        out = finite_json({"text": "HI", "gate": {"att_per_token": float("-inf"), "margin": float("nan"), "ok": 0.5},
                           "alts": [float("inf"), 1.0, "x"], "n": 3})
        self.assertNotIn(b"Infinity", out)
        self.assertNotIn(b"NaN", out)
        self.assertEqual(json.loads(out), {"text": "HI", "gate": {"att_per_token": None, "margin": None, "ok": 0.5},
                                           "alts": [None, 1.0, "x"], "n": 3})


if __name__ == "__main__":
    unittest.main()
