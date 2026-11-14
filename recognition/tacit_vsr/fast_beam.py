"""Fast joint CTC/attention beam search (KV-cached decoder steps + NumPy CTC prefix scorer).

ADAPTED from SilentFlow (https://github.com/ahosseini06/silent-flow), commit 44b4f9fdfd7cb5939150a4db3bdcfd840e6f0c42,
files inference/fast_step.py and inference/fast_beam.py, MIT License (notice below). TACIT changes: both files merged
into one module; the LM is optional (TACIT runs without one); `no_repeat` defaults to 0 so scoring matches ESPnet's
BatchBeamSearch (the n-gram ban is an intentional behaviour change upstream, opt-in here); docstrings trimmed.
Selected with TACIT_DECODER=fast (default espnet). Benchmark: recognition/eval/bench_decoder.py.

MIT License

Copyright (c) 2026 Ali Hosseini

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

"""
from __future__ import annotations

import numpy as np



import torch
import torch.nn.functional as F

KV = tuple[torch.Tensor, torch.Tensor]


def _heads(linear, x: torch.Tensor, h: int, dk: int) -> torch.Tensor:
    b, l, _ = x.shape
    return linear(x).view(b, l, h, dk).transpose(1, 2)  # (B, H, L, dk)


def _attend(attn, q_in: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
    b = q_in.size(0)
    q = _heads(attn.linear_q, q_in, attn.h, attn.d_k)
    out = F.scaled_dot_product_attention(q, k, v)  # (B, H, 1, dk)
    return attn.linear_out(out.transpose(1, 2).reshape(b, 1, attn.h * attn.d_k))


def _self_attn(attn, h: torch.Tensor, past: KV | None) -> tuple[torch.Tensor, KV]:
    k = _heads(attn.linear_k, h, attn.h, attn.d_k)
    v = _heads(attn.linear_v, h, attn.h, attn.d_k)
    if past is not None:
        k = torch.cat([past[0], k], dim=2)
        v = torch.cat([past[1], v], dim=2)
    return _attend(attn, h, k, v), (k, v)


def select(cache: list[KV] | None, idx: torch.Tensor) -> list[KV] | None:
    if cache is None:
        return None
    return [(k.index_select(0, idx), v.index_select(0, idx)) for k, v in cache]


class FastDecoder:
    def __init__(self, decoder):
        self.d = decoder
        self.emb, self.pe = decoder.embed[0], decoder.embed[1]
        assert type(self.pe).__name__ == "PositionalEncoding", type(self.pe)
        assert decoder.normalize_before
        for layer in decoder.decoders:
            assert layer.normalize_before and not layer.concat_after
        self.cross: list[KV] = []

    def start(self, memory: torch.Tensor) -> None:
        """memory: (T, D) encoder output for this utterance."""
        m = memory.unsqueeze(0)
        self.cross = [
            (_heads(l.src_attn.linear_k, m, l.src_attn.h, l.src_attn.d_k),
             _heads(l.src_attn.linear_v, m, l.src_attn.h, l.src_attn.d_k))
            for l in self.d.decoders
        ]

    def step(self, tokens: torch.Tensor, pos: int, cache: list[KV] | None):
        """tokens: (W,) last token of each hypothesis at position `pos`."""
        w = tokens.size(0)
        if self.pe.pe.size(1) <= pos or self.pe.pe.device != tokens.device:
            self.pe.extend_pe(torch.zeros(1, pos + 1, device=tokens.device))
        x = self.emb(tokens).unsqueeze(1) * self.pe.xscale + self.pe.pe[:, pos : pos + 1]
        new_cache = []
        for i, l in enumerate(self.d.decoders):
            a, kv = _self_attn(l.self_attn, l.norm1(x), cache[i] if cache else None)
            new_cache.append(kv)
            x = x + a
            ck, cv = self.cross[i]
            x = x + _attend(l.src_attn, l.norm2(x), ck.expand(w, -1, -1, -1), cv.expand(w, -1, -1, -1))
            x = x + l.feed_forward(l.norm3(x))
        y = self.d.after_norm(x[:, -1])
        return torch.log_softmax(self.d.output_layer(y), dim=-1), new_cache


class FastLM:
    def __init__(self, lm):
        self.lm = lm
        enc = lm.encoder
        assert enc.normalize_before
        for l in enc.encoders:
            assert l.normalize_before and not l.concat_after and not l.macaron_style
            assert l.conv_module is None

    def step(self, tokens: torch.Tensor, cache: list[KV] | None):
        enc = self.lm.encoder
        x = enc.embed(self.lm.embed(tokens).unsqueeze(1))  # no positional encoding in this LM
        new_cache = []
        for i, l in enumerate(enc.encoders):
            a, kv = _self_attn(l.self_attn, l.norm_mha(x), cache[i] if cache else None)
            new_cache.append(kv)
            x = x + a
            x = x + l.ff_scale * l.feed_forward(l.norm_ff(x))
        y = enc.after_norm(x[:, -1])
        return self.lm.decoder(y).log_softmax(dim=-1), new_cache






NEG = -1e10


class CTCPrefixScorer:
    """Vectorized CTC prefix scoring (Watanabe et al., 2017) over candidates."""

    def __init__(self, logp: np.ndarray, blank: int, eos: int):
        self.x = logp  # (T, O) float32 log-probs
        self.T = logp.shape[0]
        self.blank = blank
        self.eos = eos

    def initial_state(self):
        r = np.full((self.T, 2, 1), NEG, dtype=np.float32)
        r[:, 1, 0] = np.cumsum(self.x[:, self.blank])
        return r, np.zeros(1, dtype=np.float32)

    def score(self, r_prev, psi_prev, last, out_len, hyp_idx, cand):
        """Score candidate extensions.

        r_prev: (T, 2, W) forward probs of the running prefixes
        psi_prev: (W,) prefix scores
        last: (W,) last token of each prefix
        out_len: current prefix length (excluding sos)
        hyp_idx, cand: (N,) which hypothesis each candidate extends, and the token
        Returns ctc score deltas (N,) and new forward probs (T, 2, N).
        """
        T, x = self.T, self.x
        n = cand.shape[0]
        xc = x[:, cand]  # (T, N)
        xb = x[:, self.blank][:, None]  # (T, 1)

        r_sum = np.logaddexp(r_prev[:, 0], r_prev[:, 1])  # (T, W)
        log_phi = r_sum[:, hyp_idx]  # (T, N)
        same = cand == last[hyp_idx]
        if same.any():
            log_phi[:, same] = r_prev[:, 1, hyp_idx[same]]

        r = np.full((T, 2, n), NEG, dtype=np.float32)
        if out_len == 0:
            r[0, 0] = xc[0]
        start = max(out_len, 1)
        rn, rb = r[start - 1, 0].copy(), r[start - 1, 1].copy()
        for t in range(start, T):
            rn_new = np.logaddexp(rn, log_phi[t - 1]) + xc[t]
            rb = np.logaddexp(rn, rb) + xb[t]
            rn = rn_new
            r[t, 0], r[t, 1] = rn, rb

        if start < T:
            phi_x = log_phi[start - 1 : T - 1] + xc[start:T]
            log_psi = np.logaddexp(np.logaddexp.reduce(phi_x, axis=0), r[start - 1, 0])
        else:
            log_psi = r[start - 1, 0].copy()

        is_eos = cand == self.eos
        if is_eos.any():
            log_psi[is_eos] = r_sum[T - 1, hyp_idx[is_eos]]
        log_psi[cand == self.blank] = NEG
        return log_psi - psi_prev[hyp_idx], r, log_psi


def _repeat_bans(seqs: list[list[int]], n: int) -> tuple[list[int], list[int]]:
    rows, cols = [], []
    for w, seq in enumerate(seqs):
        toks = seq[1:]  # drop sos
        if len(toks) < n - 1:
            continue
        tail = toks[len(toks) - n + 1:]
        for i in range(len(toks) - n + 1):
            if toks[i : i + n - 1] == tail:
                rows.append(w)
                cols.append(toks[i + n - 1])
    return rows, cols


@torch.inference_mode()
def beam_search(model, lm, enc: torch.Tensor, beam: int = 8, ctc_weight: float = 0.1,
                lm_weight: float = 0.3, max_len: int | None = None, nbest: int = 1,
                no_repeat: int = 0):
    """Decode one utterance. enc: (T, D) encoder output.

    Returns up to `nbest` (score, token ids without sos/eos), best first. The
    search only stops once the n-th best finished hypothesis beats every running
    one, so the returned list is the exact top-n under the beam."""
    dev = enc.device
    eos = sos = model.odim - 1
    blank = 0
    T = enc.size(0)
    max_len = max_len or T
    pre_beam = min(int(1.5 * beam), model.odim)
    use_lm = lm is not None and lm_weight > 0

    ctc_logp = model.ctc.log_softmax(enc.unsqueeze(0))[0].float().cpu().numpy()
    ctc = CTCPrefixScorer(ctc_logp, blank, eos)
    r_prev, psi_prev = ctc.initial_state()

    dec = FastDecoder(model.decoder)
    dec.start(enc)
    flm = FastLM(lm) if use_lm else None
    last_tok = torch.full((1,), sos, dtype=torch.long, device=dev)
    ys_np = [[sos]]
    scores = np.zeros(1, dtype=np.float32)
    dec_cache = None
    lm_cache = None
    finished: list[tuple[float, list[int]]] = []

    for step in range(max_len):
        W = len(ys_np)
        L = step + 1  # prefix length including sos
        dec_logp, dec_cache = dec.step(last_tok, step, dec_cache)
        weighted = (1.0 - ctc_weight) * dec_logp
        if use_lm:
            lm_logp, lm_cache = flm.step(last_tok, lm_cache)
            weighted = weighted + lm_weight * lm_logp
        dec_logp[:, blank] = NEG
        weighted[:, blank] = NEG
        if no_repeat:  # the attention decoder can loop ("I'VE GOT IT I'VE GOT IT ..."): ban repeated n-grams
            rows, cols = _repeat_bans(ys_np, no_repeat)
            if rows:
                r = torch.tensor(rows, device=dev)
                c = torch.tensor(cols, device=dev)
                dec_logp[r, c] = NEG
                weighted[r, c] = NEG
        if step == max_len - 1:  # force termination
            dec_logp[:, :eos] = NEG
            weighted[:, :eos] = NEG
        _, cand_t = dec_logp.topk(pre_beam, dim=-1)  # pre-beam on decoder score
        part_t = weighted.gather(1, cand_t)
        packed = torch.cat([cand_t.float(), part_t], dim=1).cpu().numpy()  # single sync
        cand = packed[:, :pre_beam].astype(np.int64).reshape(-1)
        part = packed[:, pre_beam:].reshape(-1)
        hyp_idx = np.repeat(np.arange(W), pre_beam)

        last = np.array([s[-1] for s in ys_np], dtype=np.int64)
        ctc_delta, r_new, psi_new = ctc.score(r_prev, psi_prev, last, L - 1, hyp_idx, cand)
        total = scores[hyp_idx] + part + ctc_weight * ctc_delta

        order = np.argsort(-total)[:beam]
        keep = []
        for n in order:
            seq = ys_np[hyp_idx[n]] + [int(cand[n])]
            if cand[n] == eos:
                finished.append((float(total[n]), seq[1:-1]))
            else:
                keep.append(n)

        best_running = total[keep[0]] if keep else NEG
        if len(finished) >= nbest:
            nth = sorted((f[0] for f in finished), reverse=True)[nbest - 1]
            if nth >= best_running:
                break
        if not keep:
            break
        keep = np.array(keep)
        src = torch.from_numpy(hyp_idx[keep]).to(dev)
        last_tok = torch.from_numpy(cand[keep]).to(dev)
        ys_np = [ys_np[hyp_idx[n]] + [int(cand[n])] for n in keep]
        scores = total[keep]
        dec_cache = select(dec_cache, src)
        lm_cache = select(lm_cache, src)
        r_prev = r_new[:, :, keep]
        psi_prev = psi_new[keep]

    finished.sort(key=lambda f: -f[0])
    out, seen = [], set()
    for score, ids in finished:
        if tuple(ids) not in seen:
            seen.add(tuple(ids))
            out.append((score, ids))
    return out[:nbest]
