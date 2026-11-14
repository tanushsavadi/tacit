"""Phrase-acceptance rules v1/v2 on a fake engine (no model). Run: cd recognition && .venv/bin/python -m unittest discover -s tests

Scores are synthetic and chosen to sit on either side of each threshold; they are NOT measurements. The development
evidence behind the v2 floor is docs/DEMO_READINESS.md D.9 (eval/phrase_rule_probe.py).
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tacit_vsr import config, phrases  # noqa: E402

PHRASES = ["I don't understand", "can you help me", "good morning"]


class Score:
    def __init__(self, norm_text: str, length_norm: float):
        self.norm_text, self.length_norm = norm_text, length_norm


class FakeEngine:
    """Phrase scores + the free hypothesis' (att, ctc) sums, as VSREngine would return them."""
    ctc_weight = 0.1

    def __init__(self, phrase_scores: dict[str, float], free_att_sum: float, free_ctc_sum: float):
        self.phrase_scores, self.free = phrase_scores, (free_att_sum, free_ctc_sum)

    def score_texts(self, enc, texts):
        return [Score(t.upper(), self.phrase_scores[t]) for t in texts]

    def _score_ids(self, enc, ids):
        return self.free


def classify(free_att_per_token: float, n_free_tokens: int = 1, rule: str | None = None, best=-1.0, second=-2.0):
    """free hypothesis of n tokens whose attention log-prob per token (incl. <eos>) is `free_att_per_token`."""
    n = n_free_tokens + 1
    eng = FakeEngine({"I don't understand": best, "can you help me": second, "good morning": -3.0},
                     free_att_sum=free_att_per_token * n, free_ctc_sum=-50.0)  # very poor free joint → gap passes
    kw = {} if rule is None else {"rule": rule}
    return phrases.classify(eng, None, list(range(n_free_tokens)), PHRASES, **kw)


class PhraseRuleV2(unittest.TestCase):
    def test_default_rule_is_v2(self):
        self.assertEqual(config.PHRASE_RULE, "phrase-rule-v2")
        self.assertEqual(classify(-0.4)["rule"], "phrase-rule-v2")

    def test_junk_free_decoding_is_rejected_by_v2_but_accepted_by_v1(self):
        # the held-out smile pattern: one junk word ("SO") with very low evidence, one phrase relatively best
        v2 = classify(-2.894)
        self.assertFalse(v2["accepted"])
        self.assertIn("too little evidence", v2["reason"])
        v1 = classify(-2.894, rule="phrase-rule-v1")
        self.assertTrue(v1["accepted"])
        self.assertEqual(v1["rule"], "phrase-rule-v1")

    def test_floor_is_inclusive_and_reported(self):
        at = classify(config.MIN_FREE_ATT_PER_TOKEN, n_free_tokens=3)
        self.assertTrue(at["accepted"], at)
        self.assertAlmostEqual(at["freeAttPerToken"], config.MIN_FREE_ATT_PER_TOKEN, places=3)
        self.assertFalse(classify(config.MIN_FREE_ATT_PER_TOKEN - 0.01, n_free_tokens=3)["accepted"])

    def test_v1_conditions_still_apply_under_v2(self):
        amb = classify(-0.4, best=-1.0, second=-1.05)  # margin 0.05 < 0.15
        self.assertFalse(amb["accepted"])
        self.assertIn("ambiguous", amb["reason"])

    def test_empty_free_hypothesis_is_rejected(self):
        eng = FakeEngine({"I don't understand": -1.0, "can you help me": -2.0, "good morning": -3.0}, 0.0, 0.0)
        self.assertFalse(phrases.classify(eng, None, [], PHRASES)["accepted"])

    def test_unknown_rule_is_refused(self):
        with self.assertRaises(ValueError):
            classify(-0.4, rule="phrase-rule-v9")


if __name__ == "__main__":
    unittest.main()
