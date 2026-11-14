"""Recorder CLI parsing (no camera). Run: cd recognition && .venv/bin/python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import record_webcam as rw  # noqa: E402


class ModeParsing(unittest.TestCase):
    def test_default_both_modes(self):
        self.assertEqual(rw.parse_modes("silent,voiced"), ["silent", "voiced"])

    def test_empty_and_none_disable_prompts(self):
        for t in ("", "  ", "none", "NONE"):
            self.assertEqual(rw.parse_modes(t), [], t)

    def test_whitespace_case_and_duplicates(self):
        self.assertEqual(rw.parse_modes(" Silent , silent "), ["silent"])

    def test_unknown_or_blank_entries_rejected(self):
        for t in ("whisper", "silent,", "silent,,voiced", "silnet"):
            with self.assertRaises(ValueError, msg=t):
                rw.parse_modes(t)


class Plan(unittest.TestCase):
    def test_empty_modes_with_free_records_only_own_sentences(self):
        self.assertEqual(rw.plan(rw.parse_modes(""), 3), [])

    def test_prompts_times_modes(self):
        items = rw.plan(["silent"], 0, ["a", "b"])
        self.assertEqual(items, [("a", "silent"), ("b", "silent")])
        self.assertTrue(all(m in rw.VALID_MODES for _, m in rw.plan(["silent", "voiced"], 0)))

    def test_nonspeech_controls_only(self):
        items = rw.plan([], 0, nonspeech=2)
        self.assertEqual(len(items), 2 * len(rw.NONSPEECH))
        self.assertTrue(all(m == "nonspeech" and p in rw.NONSPEECH for p, m in items))
        with self.assertRaises(ValueError):
            rw.plan([], 0, nonspeech=-1)

    def test_prompt_file_skips_comments_and_blanks(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write("# header\n\nfirst sentence\n  # indented comment\nsecond one\n")
        self.assertEqual(rw.read_prompts(f.name), ["first sentence", "second one"])

    def test_nothing_to_record_rejected(self):
        with self.assertRaises(ValueError):
            rw.plan([], 0)
        with self.assertRaises(ValueError):
            rw.plan(["silent"], -1)


if __name__ == "__main__":
    unittest.main()
