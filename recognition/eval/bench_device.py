"""Measure encoder latency and numerical agreement, CPU vs MPS, on real clips.

    .venv/bin/python eval/bench_device.py
"""
import json
import sys
import time
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from tacit_vsr import engine, video  # noqa: E402

man = json.load(open(ROOT / "eval" / "cremad_manifest.json"))[::12][:8]
crop = video.MouthCropper()
xs = []
for m in man:
    clip = video.decode_clip((ROOT / "eval" / m["file"]).read_bytes())
    xs.append((m["text"], video.roi_to_tensor(crop(clip.frames).roi)))

res = {}
for dev in ["cpu", "mps"]:
    if dev == "mps" and not torch.backends.mps.is_available():
        continue
    try:
        eng = engine.VSREngine(dev)
        eng.encode(xs[0][1])  # warm-up
        times, encs, scores = [], [], []
        for text, x in xs:
            t = time.perf_counter()
            enc = eng.encode(x)
            times.append((time.perf_counter() - t) * 1000)
            encs.append(enc)
            scores.append(eng.score_text(enc, text).joint)
        res[dev] = (times, encs, scores)
        print(f"{dev}: encoder ms per clip mean={sum(times)/len(times):.0f} "
              f"min={min(times):.0f} max={max(times):.0f} frames={[x.shape[1] for _, x in xs]}")
    except Exception as e:  # noqa: BLE001
        print(f"{dev}: FAILED {type(e).__name__}: {e}")
if "cpu" in res and "mps" in res:
    d = [float((a - b).abs().max()) for a, b in zip(res["cpu"][1], res["mps"][1])]
    ds = [abs(a - b) for a, b in zip(res["cpu"][2], res["mps"][2])]
    print("max |enc_cpu - enc_mps| per clip:", [round(v, 4) for v in d])
    print("|joint score cpu - mps| per clip:", [round(v, 4) for v in ds])
print("torch threads:", torch.get_num_threads())
