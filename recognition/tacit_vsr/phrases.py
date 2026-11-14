"""Constrained-phrase recognition ("phrase mode"): an explicitly labelled alternative to open-vocabulary output.

Every phrase of a FIXED list is scored against the video with the model's own joint attention+CTC score (no language
model, nothing rewritten). The best phrase is ACCEPTED only if rule v1 holds — both thresholds were committed in
config.py (6dcc82b, 03:21 2026-11-14) before any webcam recording existed:
  1. margin  : best − runner-up length-normalised joint score ≥ config.MIN_MARGIN (0.15)
  2. garbage : free open-vocabulary hypothesis − best phrase ≤ config.MAX_GARBAGE_GAP (1.5) per token
               (if an unlisted sentence explains the video much better, the user probably said something else)
Rule v1 is FROZEN for the held-out validation (docs/DEMO_READINESS.md) and stays selectable (TACIT_PHRASE_RULE).
Rule v2 (default) = v1 + 3. evidence: the free hypothesis' attention log-prob per token ≥ config.MIN_FREE_ATT_PER_TOKEN
(−1.5). Without it, a window with no sentence (smile, mouth settling) decodes to one junk word, check 2 passes
trivially and one phrase is relatively best (DEMO_READINESS D.9). The floor was chosen on development data only.
A rejected or unmatched clip is never forced onto a phrase. Accepted phrases are still display-only until the
held-out gate passes; nothing here enables automatic speech.
"""
from __future__ import annotations

import torch

from . import config

RULES = ("phrase-rule-v1", "phrase-rule-v2")
RULE_VERSION = config.PHRASE_RULE

# The 10 record_webcam.py prompts + 20 everyday phrases, fixed before evaluation (none is a CREMA-D sentence).
PHRASES = [
    "I would like some water please", "can you call my mother", "I am feeling much better today",
    "what time is the appointment", "please turn on the lights", "thank you for coming",
    "I need help with this", "I don't understand", "see you tomorrow morning", "how are you doing",
    "yes please", "no thank you", "I am tired", "I am hungry", "can you help me", "please wait a moment",
    "I love you", "where are my glasses", "turn off the television", "I need to use the bathroom",
    "call the doctor", "I am in pain", "open the window", "it is too cold in here", "good morning",
    "good night", "please speak slowly", "can you repeat that", "I want to go outside", "what is your name",
]


def classify(eng, enc: torch.Tensor, free_ids: list[int], phrases: list[str] = PHRASES, rule: str = config.PHRASE_RULE) -> dict:
    """free_ids: token ids of the best free (open-vocabulary) hypothesis for the same encoder output."""
    if rule not in RULES:
        raise ValueError(f"unknown phrase rule {rule!r}")
    scores = sorted(eng.score_texts(enc, phrases), key=lambda c: c.length_norm, reverse=True)
    best, second = scores[0], scores[1]
    if free_ids:
        att, ctc = eng._score_ids(enc, free_ids)
        free_ln = ((1 - eng.ctc_weight) * att + eng.ctc_weight * ctc) / (len(free_ids) + 1)
        free_att = att / (len(free_ids) + 1)
    else:
        free_ln = free_att = float("-inf")
    margin = best.length_norm - second.length_norm
    gap = free_ln - best.length_norm
    reasons = []
    if margin < config.MIN_MARGIN:
        reasons.append("ambiguous between phrases")
    if gap > config.MAX_GARBAGE_GAP:
        reasons.append("video fits an unlisted sentence better")
    if rule == "phrase-rule-v2" and free_att < config.MIN_FREE_ATT_PER_TOKEN:
        reasons.append("too little evidence of a sentence")
    return {"rule": rule, "phrase": best.norm_text, "runnerUp": second.norm_text, "accepted": not reasons,
            "reason": "; ".join(reasons) or None, "margin": round(margin, 3), "garbageGap": round(gap, 3),
            "listSize": len(phrases), "freeAttPerToken": round(free_att, 3) if free_att != float("-inf") else None}
