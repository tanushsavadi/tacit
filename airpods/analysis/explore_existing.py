"""EXPLORATORY re-analysis of existing AirPods word sessions (not pre-registered; the w3→w4 NO-GO stands).

Question: do stock-AirPods motion streams carry word information that survives a change of session, and can
physically motivated normalisation, low-capacity models or a pretrained IMU representation (LIMU-BERT, MIT) expose
it better than timing/rhythm alone?

Fixed design (declared here, no hyperparameter search; every cell is reported):
  sessions   six word sessions: w1 L, w2 L (subtle), oR1 R, oR2 R (default style), w3 L, w4 R (deliberate)
  window     cue-locked 0–2.5 s, resampled to 50 Hz (gaps linearly interpolated)
  norms      raw | mirror (R→L sagittal reflection) | posture (rotate so still-gravity = −z) | sessionz (label-free
             per-session channel z-score) | all three
  models     ROCKET 1000 kernels + ridge (accel+rotation) | binned means + ridge (low capacity)
             | LIMU-BERT frozen HHAR encoder (total accel + rotation @20 Hz, mean/std pooled) + ridge
  baselines  rhythm (energy-envelope ROCKET + ridge) | duration 1-NN | motion-energy 1-NN | chance 20%
  protocols  P1 every ordered session pair (train one → test another), summarised by same-bud / cross-bud
             P2 leave-one-session-out (train on 5 sessions → test the 6th): the "reusable representation" test
             P3 unseen-word transfer: representation fitted on 4 words (training sessions), then 1-shot enrolment of
                all 5 words inside the test session; accuracy on the 5th (never-trained) word vs. no learned projection
DTW is omitted here (pure-Python cost; it was the weakest model in w1→w2 and w3→w4). Ridge alpha: closed-form LOO on the training data only, grid logspace(-3, 3, 7). Kernels/seeds fixed (seed 1).
    recognition/.venv/bin/python airpods/analysis/explore_existing.py
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "airpods" / "data"
SESSIONS = {  # name: (folder, style)
    "w1L": ("2026-11-14T07-30-05-678Z-words-w1", "subtle"),
    "w2L": ("2026-11-14T07-36-05-143Z-words-w2", "subtle"),
    "oR1": ("2026-11-14T07-54-15-887Z-words-w3", "default"),
    "oR2": ("2026-11-14T08-01-54-819Z-words-w4", "default"),
    "w3L": ("2026-11-14T08-52-38-897Z-words-w3", "deliberate"),
    "w4R": ("2026-11-14T09-08-09-016Z-words-w4", "deliberate"),
}
WORDS = ["yes", "no", "hello", "water", "help"]
FS, WIN = 50.0, 2.5
GRID = np.arange(0, WIN, 1 / FS)  # 125 samples
RNG = np.random.default_rng(1)


# ---------------------------------------------------------------- data
def load(name):
    folder, style = SESSIONS[name]
    meta = json.loads((DATA / folder / "events.json").read_text())
    a = np.genfromtxt(DATA / folder / "motion.csv", delimiter=",", skip_header=1, usecols=range(13))
    bud = open(DATA / folder / "motion.csv").readlines()[2].strip().split(",")[-1]
    t = a[:, 0]
    trials, labels = [], []
    still = []
    for e in meta["events"]:
        if e.get("kind") != "trial":
            continue
        s = (t >= e["t0"] - 0.1) & (t < e["t0"] + WIN + 0.1)
        if s.sum() < 50:
            continue
        cols = [np.interp(e["t0"] + GRID, t[s], a[s, k]) for k in range(1, 13)]
        x = np.stack(cols, 1)  # ax ay az rx ry rz pitch roll yaw gx gy gz
        x[:, 6:9] = np.unwrap(x[:, 6:9], axis=0) - x[0, 6:9]  # attitude change from window start
        if e["label"] in WORDS:
            trials.append(x); labels.append(e["label"])
        elif e["label"] == "neutral":
            still.append(x)
    return {"name": name, "bud": bud, "style": style, "X": np.array(trials), "y": np.array(labels), "still": np.array(still)}


# ---------------------------------------------------------------- normalisations (per session, label-free)
def mirror(S):
    """Sagittal reflection x→−x: polar vectors (−x, y, z); rotation pseudo-vectors and their angles (x, −y, −z)."""
    if S["bud"] != "R":
        return S
    out = dict(S)
    sign = np.array([-1, 1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1], float)
    out["X"], out["still"] = S["X"] * sign, S["still"] * sign
    return out


def posture(S):
    """Rotate the session so its mean still-trial gravity is exactly (0,0,−1); removes seating/head-tilt offsets."""
    g = S["still"][:, :, 9:12].reshape(-1, 3).mean(0)
    g /= np.linalg.norm(g)
    v, c = np.cross(g, [0, 0, -1.0]), float(np.dot(g, [0, 0, -1.0]))
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    R = np.eye(3) + vx + vx @ vx / (1 + c)
    out = dict(S)
    def rot(X):
        X = X.copy()
        for k in (0, 3, 6, 9):
            X[..., k:k + 3] = X[..., k:k + 3] @ R.T
        return X
    out["X"], out["still"] = rot(S["X"]), rot(S["still"])
    return out


def sessionz(S):
    """Divide each channel by its std over this session's word trials (fit/gain differences); label-free."""
    sd = S["X"].reshape(-1, 12).std(0) + 1e-9
    sd[9:12] = 1.0  # keep gravity in g
    out = dict(S)
    out["X"], out["still"] = S["X"] / sd, S["still"] / sd
    return out


NORMS = {"raw": lambda S: S, "mirror": mirror, "posture": posture, "sessionz": sessionz,
         "all": lambda S: sessionz(posture(mirror(S)))}


# ---------------------------------------------------------------- features
def energy(X):  # X (N,T,12) → (N,T)
    return np.linalg.norm(X[..., 3:6], axis=-1) + 5 * np.linalg.norm(X[..., 0:3], axis=-1)


def make_kernels(n, C, T, seed=1):
    r = np.random.default_rng(seed)
    ks = []
    for _ in range(n):
        L = int(r.choice([7, 9, 11]))
        nch = max(1, int(2 ** r.uniform(0, np.log2(min(C, L) + 1))))
        ch = r.permutation(C)[:nch]
        w = r.normal(size=(L, nch)); w -= w.mean(0)
        dil = int(2 ** r.uniform(0, np.log2(max(1, (T - 1) / (L - 1)))))
        pad = (L - 1) * dil // 2 if r.random() < 0.5 else 0
        ks.append((L, ch, w, r.uniform(-1, 1), dil, pad))
    return ks


def rocket(X, ks):
    N, T, _ = X.shape
    F = np.empty((N, 2 * len(ks)))
    for i, (L, ch, w, b, dil, pad) in enumerate(ks):
        Xp = np.pad(X[:, :, ch], ((0, 0), (pad, pad), (0, 0)))
        n = Xp.shape[1] - (L - 1) * dil
        if n <= 0:
            F[:, 2 * i:2 * i + 2] = 0; continue
        out = np.full((N, n), b)
        for j in range(L):
            out += Xp[:, j * dil:j * dil + n, :] @ w[j]
        F[:, 2 * i] = (out > 0).mean(1); F[:, 2 * i + 1] = out.max(1)
    return F


KERN6 = make_kernels(1000, 6, len(GRID))
KERN1 = make_kernels(1000, 1, len(GRID), seed=2)


def zc(X):  # mean-centre each channel within the window (as Subvox)
    return X - X.mean(1, keepdims=True)


def feat_rocket(X):
    return rocket(zc(X[:, :, 0:6]), KERN6)


def feat_rhythm(X):
    e = energy(X)[:, :, None]
    return rocket(zc(e), KERN1)


def feat_bins(X, nb=8):
    Y = zc(X[:, :, 0:9])
    return np.concatenate([b.mean(1) for b in np.array_split(Y, nb, axis=1)], 1)


def trim_bounds(e):
    s = np.sort(e); fl, pk = s[len(s) // 5], s[-1]
    th = fl + 0.15 * (pk - fl)
    idx = np.where(e > th)[0]
    return (idx[0], idx[-1]) if len(idx) else (0, len(e) - 1)


def feat_duration(X):
    return np.array([[np.diff(trim_bounds(e))[0] / FS] for e in energy(X)])


def feat_energy(X):
    return energy(X).mean(1, keepdims=True)


_limu = None


def feat_limu(X):
    """LIMU-BERT (MIT, dapowan/LIMU-BERT-Public) pretrained HHAR encoder, frozen. Input: total acceleration in g
    (user accel + gravity) and rotation rate (rad/s), resampled to 20 Hz (HHAR rate); output mean+std of hidden states."""
    global _limu
    import torch
    if _limu is None:
        lb = ROOT / "third_party" / "limu_bert"
        stub = types.ModuleType("utils")  # avoid importing utils.py (needs scipy); models.py only uses these two
        stub.split_last = lambda x, shape: x.view(*x.size()[:-1], *[x.size(-1) // -int(np.prod(shape)) if s == -1 else s for s in shape])
        stub.merge_last = lambda x, n: x.view(*x.size()[:-n], -1)
        sys.modules["utils"] = stub; sys.path.insert(0, str(lb))
        import models  # noqa: E402
        cfg = types.SimpleNamespace(**json.load(open(lb / "config" / "limu_bert.json"))["base_v1"], emb_norm=True)
        m = models.LIMUBertModel4Pretrain(cfg, output_embed=True)
        m.load_state_dict(torch.load(lb / "saved" / "pretrain_base_hhar_20_120" / "hhar.pt", map_location="cpu", weights_only=True))
        _limu = m.eval()
    t20 = np.arange(0, WIN, 1 / 20)
    acc = X[:, :, 0:3] + X[:, :, 9:12]
    Z = np.concatenate([acc, X[:, :, 3:6]], 2)
    Z20 = np.stack([np.stack([np.interp(t20, GRID, z[:, k]) for k in range(6)], 1) for z in Z])
    with torch.no_grad():
        h = _limu(torch.tensor(Z20, dtype=torch.float32)).numpy()
    return np.concatenate([h.mean(1), h.std(1)], 1)


# ---------------------------------------------------------------- classifiers
def ridge_fit(F, y, classes, alphas=np.logspace(-3, 3, 7)):
    mu, sd = F.mean(0), F.std(0) + 1e-9
    Xs = (F - mu) / sd
    Y = np.array([[1.0 if c == l else -1.0 for c in classes] for l in y])
    yb = Y.mean(0); Yc = Y - yb
    K = Xs @ Xs.T
    best = (-1, None)
    for a in alphas:  # closed-form LOO on training rows (alpha choice only)
        M = np.linalg.inv(K + a * np.eye(len(K)))
        A = M @ Yc
        loo = Yc - A / np.diag(M)[:, None]
        acc = np.mean(np.array(classes)[loo.argmax(1)] == y)
        if acc > best[0]:
            best = (acc, A)
    A = best[1]
    return lambda G: np.array(classes)[(((G - mu) / sd) @ Xs.T @ A + yb).argmax(1)]


def nn1(F, y):
    sd = F.std(0) + 1e-9
    return lambda G: y[np.argmin((((G[:, None, :] - F[None]) / sd) ** 2).sum(-1), 1)]


def dtw(a, b, band=0.25):
    n, m = len(a), len(b)
    w = max(abs(n - m), int(max(n, m) * band))
    D = np.full((n + 1, m + 1), np.inf); D[0, 0] = 0
    C = np.sqrt(((a[:, None, :] - b[None, :, :]) ** 2).sum(-1))
    for i in range(1, n + 1):
        lo, hi = max(1, i - w), min(m, i + w)
        for j in range(lo, hi + 1):
            D[i, j] = C[i - 1, j - 1] + min(D[i - 1, j], D[i, j - 1], D[i - 1, j - 1])
    return D[n, m] / (n + m)


def dtw_fit(Xtr, y):
    S = zc(Xtr[:, ::2, 3:6]); sc = S.reshape(-1, 3).std(0) + 1e-9; S = S / sc  # 25 Hz for speed
    def pred(Xte):
        Q = zc(Xte[:, ::2, 3:6]) / sc
        return np.array([y[np.argmin([dtw(q, s) for s in S])] for q in Q])
    return pred


MODELS = {
    "rocket": ("feat", feat_rocket),
    "bins-lowcap": ("feat", feat_bins),
    "limu-bert": ("feat", feat_limu),
    "B:rhythm": ("feat", feat_rhythm),
    "B:duration": ("nn", feat_duration),
    "B:energy": ("nn", feat_energy),
}


def run(train, test, model, cache):
    kind, f = MODELS[model]
    Xtr = np.concatenate([S["X"] for S in train]); ytr = np.concatenate([S["y"] for S in train])
    if kind == "seq":
        return np.mean(f(Xtr, ytr)(test["X"]) == test["y"])
    def F(S):
        key = (S["key"], model)
        if key not in cache:
            cache[key] = f(S["X"])
        return cache[key]
    Ftr = np.concatenate([F(S) for S in train])
    pred = ridge_fit(Ftr, ytr, WORDS) if kind == "feat" else nn1(Ftr, ytr)
    return np.mean(pred(F(test)) == test["y"])


def unseen_word(train, test, model, cache, reps=30):
    """P3: learn an LDA projection on 4 words (training sessions); 1-shot enrol all 5 words in the test session;
    nearest-centroid accuracy on held-out-word trials. Compared with the same enrolment on standardised raw features."""
    kind, f = MODELS[model]
    F = lambda S: cache.setdefault((S["key"], model), f(S["X"]))
    Ftr = np.concatenate([F(S) for S in train]); ytr = np.concatenate([S["y"] for S in train])
    Fte, yte = F(test), test["y"]
    mu, sd = Ftr.mean(0), Ftr.std(0) + 1e-9
    res = {"learned": [], "none": []}
    for hold in WORDS:
        m = ytr != hold
        Z = (Ftr[m] - mu) / sd
        # PCA to 30 dims then LDA on the 4 training words (3 discriminant dims)
        U, s, Vt = np.linalg.svd(Z - Z.mean(0), full_matrices=False); P = Vt[:30].T
        Zp = Z @ P; cls = [w for w in WORDS if w != hold]
        mus = np.array([Zp[ytr[m] == c].mean(0) for c in cls]); gm = Zp.mean(0)
        Sw = sum(np.cov(Zp[ytr[m] == c].T) for c in cls) + 1e-3 * np.eye(Zp.shape[1])
        Sb = sum(np.outer(mc - gm, mc - gm) for mc in mus)
        ev, evec = np.linalg.eig(np.linalg.solve(Sw, Sb)); W = np.real(evec[:, np.argsort(-np.real(ev))[:3]])
        proj = {"learned": lambda G: ((G - mu) / sd) @ P @ W, "none": lambda G: (G - mu) / sd}
        for kind_ in res:
            E = proj[kind_](Fte); hits = []
            for _ in range(reps):
                enrol = {w: RNG.choice(np.where(yte == w)[0]) for w in WORDS}
                cents = np.array([E[enrol[w]] for w in WORDS])
                q = [i for i in np.where(yte == hold)[0] if i != enrol[hold]]
                pred = np.array(WORDS)[np.argmin(((E[q][:, None] - cents[None]) ** 2).sum(-1), 1)]
                hits.append(np.mean(pred == hold))
            res[kind_].append(np.mean(hits))
    return {k: float(np.mean(v)) for k, v in res.items()}


def main():
    raw = {n: load(n) for n in SESSIONS}
    print("*** EXPLORATORY — NOT PRE-REGISTERED. The pre-registered w3→w4 result (NO-GO) is unchanged. ***")
    print("sessions: " + ", ".join(f"{n}({S['bud']},{S['style']},{len(S['y'])} words)" for n, S in raw.items()))
    models = list(MODELS)
    summary = {}
    for norm, fn in NORMS.items():
        sess = {}
        for n, S in raw.items():
            T = fn(S); T = dict(T); T["key"] = (norm, n); sess[n] = T
        cache = {}
        names = list(sess)
        p1 = {m: {"same": [], "cross": []} for m in models}
        for m in models:
            for a in names:
                for b in names:
                    if a == b:
                        continue
                    kind = "same" if sess[a]["bud"] == sess[b]["bud"] else "cross"
                    p1[m][kind].append(run([sess[a]], sess[b], m, cache))
        p2 = {m: [run([sess[x] for x in names if x != t], sess[t], m, cache) for t in names] for m in models}
        summary[norm] = (p1, p2)
        print(f"\n== norm: {norm}")
        print("   model          P1 same-bud (n=14)  P1 cross-bud (n=16)   P2 leave-one-session-out per session " + " ".join(f"{n:>5s}" for n in names) + "   mean")
        for m in models:
            s, c = np.array(p1[m]["same"]), np.array(p1[m]["cross"])
            print(f"   {m:13s}  {s.mean():5.0%} ±{s.std():4.0%}        {c.mean():5.0%} ±{c.std():4.0%}         {'':38s}" + " ".join(f"{v:5.0%}" for v in p2[m]) + f"  {np.mean(p2[m]):5.0%}")
        if norm in ("raw", "all"):
            print("   P3 unseen-word 1-shot (LOSO mean over sessions × held-out words; chance 20%):")
            for m in ("rocket", "bins-lowcap", "limu-bert", "B:rhythm"):
                r = [unseen_word([sess[x] for x in names if x != t], sess[t], m, cache) for t in names]
                print(f"     {m:12s} learned-projection {np.mean([x['learned'] for x in r]):5.0%}   no-projection {np.mean([x['none'] for x in r]):5.0%}")
    out = ROOT / "airpods" / "data" / "explore_existing_results.json"
    out.write_text(json.dumps({k: {"p1": {m: {kk: list(map(float, vv)) for kk, vv in d.items()} for m, d in v[0].items()},
                                    "p2": {m: list(map(float, vv)) for m, vv in v[1].items()}} for k, v in summary.items()}, indent=1))
    print(f"\nraw results → {out}")


if __name__ == "__main__":
    main()
