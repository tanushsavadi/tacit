"""Dataset split leakage rules and the shipped prompt lists. Run: .venv/bin/python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from eval.dataset import leakage, make_split, norm, read_prompts  # noqa: E402


def clip(session, ref, group="silent_prompted"):
    return {"session": session, "file": f"{session}-{ref}.mp4", "ref": norm(ref), "mode": "silent", "group": group}


class Split(unittest.TestCase):
    def test_sentence_shared_with_test_is_dropped_from_training(self):
        items = [clip("s1", "open the door"), clip("s1", "good night"), clip("s2", "open the door"), clip("s2", "hello there")]
        sp = make_split(items, {"s2"})
        self.assertEqual({x["ref"] for x in sp["test"]}, {"OPEN THE DOOR", "HELLO THERE"})
        self.assertEqual([x["ref"] for x in sp["train"]], ["GOOD NIGHT"])
        self.assertEqual(sp["dropped_train_for_sentence_overlap"], 1)
        self.assertEqual(sp["leakage"], {"sessions": [], "sentences": []})

    def test_nonspeech_never_trains(self):
        items = [clip("s1", "", "nonspeech"), clip("s1", "good night"), clip("s2", "", "nonspeech"), clip("s2", "hi")]
        sp = make_split(items, {"s2"})
        self.assertTrue(all(x["group"] != "nonspeech" for x in sp["train"] + sp["test"]))
        self.assertEqual(len(sp["nonspeech_test"]), 1)

    def test_leakage_detects_shared_session_and_sentence(self):
        lk = leakage([clip("s1", "a b")], [clip("s1", "a b")])
        self.assertEqual(lk, {"sessions": ["s1"], "sentences": ["A B"]})


class PromptLists(unittest.TestCase):
    def test_adapt_and_heldout_are_disjoint_and_unique(self):
        adapt = [norm(s) for s in read_prompts(ROOT / "prompts" / "adapt_v1.txt")]
        held = [norm(s) for s in read_prompts(ROOT / "prompts" / "heldout_v2.txt")]
        self.assertGreaterEqual(len(adapt), 100)
        self.assertGreaterEqual(len(held), 50)
        self.assertEqual(len(set(adapt)), len(adapt))
        self.assertEqual(len(set(held)), len(held))
        self.assertEqual(set(adapt) & set(held), set())


if __name__ == "__main__":
    unittest.main()
