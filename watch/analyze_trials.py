"""Summarize TACIT Probe trials copied off the watch: actual sample rate, usable bandwidth, gaps, motion rate.
    ../recognition/.venv/bin/python analyze_trials.py <dir-with-trial-folders>
Band energies answer the feasibility question: active echo sensing (Lipwatch-style, ~17–21 kHz) needs a ≥44.1 kHz
input whose high band carries signal above the noise floor (use the 'keys-jingle' trial: keys emit broadband HF).
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

BANDS = [(0, 4e3), (4e3, 8e3), (8e3, 12e3), (12e3, 16e3), (16e3, 18e3), (18e3, 21e3), (21e3, 24e3)]

for d in sorted(p for p in Path(sys.argv[1]).iterdir() if (p / "meta.json").exists()):
    m = json.loads((d / "meta.json").read_text())
    line = f"{d.name}: session {m['session']['sampleRate']:.0f} Hz, input {m['inputFormat']['sampleRate']:.0f} Hz x{m['inputFormat']['channels']}, mode {m['session']['mode']}, inputs {m['session']['inputs']}"
    with wave.open(str(d / "audio.wav")) as w:
        sr, x = w.getframerate(), np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2 if len(x) else np.zeros(1)
    f = np.fft.rfftfreq(len(x), 1 / sr) if len(x) else np.zeros(1)
    bands = [f"{lo / 1e3:.0f}-{hi / 1e3:.0f}k {10 * np.log10(spec[(f >= lo) & (f < hi)].mean() + 1e-20):6.1f}dB" for lo, hi in BANDS if lo < sr / 2]
    b = np.genfromtxt(d / "buffers.csv", delimiter=",", names=True)
    gaps = 0 if b.size < 2 else int((np.diff(np.atleast_1d(b["hostSeconds"])) > 2 * np.median(np.atleast_1d(b["frames"])) / sr).sum())
    mt = np.genfromtxt(d / "motion.csv", delimiter=",", names=True)["t"] if (d / "motion.csv").stat().st_size > 60 else np.array([])
    mrate = (len(mt) - 1) / (mt[-1] - mt[0]) if len(mt) > 1 else 0
    mgaps = int((np.diff(mt) > 0.05).sum()) if len(mt) > 1 else 0
    print(line)
    print(f"   audio {len(x) / sr:.2f}s rms {20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12):.1f} dBFS, buffer gaps {gaps}; motion {len(mt)} @ {mrate:.0f} Hz, gaps>50ms {mgaps}")
    print("   bands: " + "  ".join(bands))
    ev = [f"{e['kind']}:{e['detail']}" for e in m.get("events", [])]
    print(f"   events: {ev}")
