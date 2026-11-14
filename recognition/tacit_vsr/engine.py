"""Pretrained Auto-AVSR visual-only model used as a SCORER, not a transcriber.

For each candidate text y and encoded video x we compute
  att  = sum_i log p_dec(y_i | y_<i, x)  (+ <eos>)   teacher-forced attention decoder
  ctc  = log p_ctc(y | x)                             CTC forward algorithm
  joint = (1 - w) * att + w * ctc                     same interpolation as the model's decoder
and a free (open-vocabulary) beam-search hypothesis scored with the *same* function.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass

import torch

from . import config

if str(config.CHAPLIN_DIR) not in sys.path:
    sys.path.insert(0, str(config.CHAPLIN_DIR))


_inflect = None


def normalize_text(text: str) -> str:
    """Map arbitrary reply text to the model's label space: A-Z, apostrophe, space."""
    global _inflect
    t = text.replace("’", "'").replace("‘", "'")
    if re.search(r"\d", t):
        if _inflect is None:
            import inflect
            _inflect = inflect.engine()
        t = re.sub(r"\d+", lambda m: " " + _inflect.number_to_words(m.group(0), andword="").replace("-", " ").replace(",", "") + " ", t)
    t = t.replace("&", " and ").replace("%", " percent ")
    t = re.sub(r"[^A-Za-z' ]+", " ", t).upper()
    t = re.sub(r"(?<![A-Z])'|'(?![A-Z])", " ", t)  # drop quote marks, keep in-word apostrophes
    return re.sub(r"\s+", " ", t).strip()


@dataclass
class CandidateScore:
    text: str
    norm_text: str
    n_tokens: int
    att: float
    ctc: float
    joint: float

    @property
    def length_norm(self) -> float:
        return self.joint / (self.n_tokens + 1)  # +1 for <eos>


class VSREngine:
    def __init__(self, device: str = "cpu", ctc_weight: float = config.CTC_WEIGHT,
                 beam_size: int = config.FREE_DECODE_BEAM):
        import sentencepiece
        from espnet.nets.pytorch_backend.e2e_asr_transformer import E2E
        from espnet.nets.batch_beam_search import BatchBeamSearch
        from espnet.nets.scorers.length_bonus import LengthBonus

        self.device = torch.device(device)
        self.ctc_weight = ctc_weight
        with open(config.MODEL_CONF, "rb") as f:
            confs = json.load(f)
        args = argparse.Namespace(**(confs if isinstance(confs, dict) else confs[2]))
        units = [l.split()[0] for l in open(config.UNITS_FILE, encoding="utf8").read().splitlines()]
        self.token_list = ["<blank>"] + units + ["<eos>"]
        self.tok2id = {t: i for i, t in enumerate(self.token_list)}
        self.unk = self.tok2id["<unk>"]
        self.odim = len(self.token_list)
        self.sos = self.eos = self.odim - 1
        self.spm = sentencepiece.SentencePieceProcessor(model_file=str(config.SPM_MODEL))

        self.model = E2E(self.odim, args)
        state = torch.load(str(config.MODEL_PATH), map_location="cpu", weights_only=True)
        self.model.load_state_dict(state)
        self.model.eval()
        # Encoder (the expensive part) may live on MPS; decoder/CTC stay on CPU
        # (CTC loss is not implemented on MPS and the decoder is cheap).
        self.model.encoder.to(self.device)

        scorers = self.model.scorers()
        scorers["length_bonus"] = LengthBonus(self.odim)
        self.beam = BatchBeamSearch(
            beam_size=beam_size, vocab_size=self.odim,
            weights=dict(decoder=1.0 - ctc_weight, ctc=ctc_weight, length_bonus=0.0),
            scorers=scorers, sos=self.sos, eos=self.eos, token_list=self.token_list,
            pre_beam_score_key=None if ctc_weight == 1.0 else "decoder",
        ).eval()

    @torch.no_grad()
    def nbest(self, enc: torch.Tensor, n: int = 3) -> list[tuple[float, list[int]]]:
        """Free decoding: up to n (score, token ids without sos/eos), best first, with config.DECODER."""
        if config.DECODER == "fast":
            from .fast_beam import beam_search
            return beam_search(self.model, None, enc, beam=self.beam.beam_size, ctc_weight=self.ctc_weight,
                               lm_weight=0.0, nbest=n, no_repeat=0)
        return [(float(h.score), [int(i) for i in h.yseq.tolist() if int(i) not in (self.sos,)])
                for h in self.beam(enc)[:n]]

    # ------------------------------------------------------------------
    def tokenize(self, norm_text: str) -> list[int]:
        return [self.tok2id.get(p, self.unk) for p in self.spm.EncodeAsPieces(norm_text)]

    def detokenize(self, ids) -> str:
        return "".join(self.token_list[i] for i in ids).replace("▁", " ").strip()

    @torch.no_grad()
    def encode(self, video: torch.Tensor) -> torch.Tensor:
        """video: (1, T, 88, 88) float -> encoder memory (T, D) on CPU."""
        x = video.unsqueeze(0).to(self.device)
        enc, _ = self.model.encoder(x, None)
        return enc.squeeze(0).float().cpu()

    @torch.no_grad()
    def _score_ids(self, enc: torch.Tensor, ids: list[int]) -> tuple[float, float]:
        from espnet.nets.pytorch_backend.transformer.mask import subsequent_mask

        T = enc.size(0)
        memory = enc.unsqueeze(0)
        ys_in = torch.tensor([[self.sos] + ids], dtype=torch.long)
        ys_out = torch.tensor([ids + [self.eos]], dtype=torch.long)
        mask = subsequent_mask(ys_in.size(1)).unsqueeze(0)
        logits, _ = self.model.decoder(ys_in, mask, memory, None)
        logp = torch.log_softmax(logits, dim=-1)
        att = float(logp.gather(2, ys_out.unsqueeze(-1)).sum())

        ctc_logp = torch.log_softmax(self.model.ctc.ctc_lo(memory), dim=-1).transpose(0, 1)  # (T,1,V)
        if len(ids) == 0 or len(ids) > T:
            ctc = float("-inf")
        else:
            ctc = -float(torch.nn.functional.ctc_loss(
                ctc_logp, torch.tensor([ids]), torch.tensor([T]), torch.tensor([len(ids)]),
                blank=0, reduction="sum", zero_infinity=False))
        return att, ctc

    def score_text(self, enc: torch.Tensor, text: str) -> CandidateScore:
        norm = normalize_text(text)
        ids = self.tokenize(norm)
        if not ids:
            return CandidateScore(text, norm, 0, float("-inf"), float("-inf"), float("-inf"))
        att, ctc = self._score_ids(enc, ids)
        w = self.ctc_weight
        joint = (1 - w) * att + w * ctc if ctc != float("-inf") else float("-inf")
        return CandidateScore(text, norm, len(ids), att, ctc, joint)

    @torch.no_grad()
    def free_decode(self, enc: torch.Tensor) -> CandidateScore | None:
        hyps = self.beam(enc)
        if not hyps:
            return None
        ids = [int(i) for i in hyps[0].yseq.tolist()]
        ids = [i for i in ids if i != self.sos]
        if not ids:
            return CandidateScore("", "", 0, float("-inf"), float("-inf"), float("-inf"))
        text = self.detokenize(ids)
        att, ctc = self._score_ids(enc, ids)
        w = self.ctc_weight
        joint = (1 - w) * att + w * ctc if ctc != float("-inf") else float("-inf")
        return CandidateScore(text, text, len(ids), att, ctc, joint)


def pick_device(requested: str = "auto") -> str:
    if requested != "auto":
        return requested
    return "cpu"  # MPS measured in eval/bench_device.py; see README for the result


def timed(fn, *a, **k):
    t = time.perf_counter()
    out = fn(*a, **k)
    return out, (time.perf_counter() - t) * 1000.0
