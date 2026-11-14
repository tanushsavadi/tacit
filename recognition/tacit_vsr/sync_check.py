"""Verify webcam ↔ AirPods alignment for a record_sync.py session using the opening sync nods.

Video signal: nose-tip vertical position (MediaPipe FaceMesh) on the frame's capture timestamp.
Motion signal: AirPods attitude pitch on CMDeviceMotion.timestamp. Both are differentiated, resampled to 200 Hz and
cross-correlated over ±500 ms; the lag at peak |r| is the residual offset (motion minus video).
    .venv/bin/python -m tacit_vsr.sync_check <session_dir>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import av
import numpy as np


def video_track(path: Path, t0: float, t1: float):
    import mediapipe as mp
    ts, ys, first = [], [], None
    with av.open(str(path)) as c, mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1) as fm:
        s = c.streams.video[0]
        for fr in c.decode(s):
            t = float(fr.pts * s.time_base)
            first = t if first is None else first
            if t < t0:
                continue
            if t > t1:
                break
            res = fm.process(fr.to_ndarray(format="rgb24"))
            if res.multi_face_landmarks:
                ts.append(t); ys.append(res.multi_face_landmarks[0].landmark[1].y)
    return first, np.array(ts), np.array(ys)


def main() -> None:
    d = Path(sys.argv[1])
    meta = json.loads((d / "events.json").read_text())
    nods = [e["t0"] for e in meta["events"] if e["kind"] == "sync_nod"]
    t0, t1 = nods[0] - 0.8, nods[-1] + 1.5
    m = np.genfromtxt(d / "motion.csv", delimiter=",", names=True, usecols=(0, 7))
    mt, pitch = m["t"], m["pitch"]
    first_pts, vt, vy = video_track(d / "video.mkv", t0, t1)
    print(f"video first pts {first_pts:.3f} s vs ffmpeg launch {meta['ffmpeg_launch_monotonic']:.3f} s "
          f"→ {first_pts - meta['ffmpeg_launch_monotonic']:+.3f} s (same clock ⇒ small positive)")
    print(f"motion: {meta['motion_samples']} samples, min arrival offset {meta['motion_offset_min_s']}, drift {meta['motion_offset_drift_s_per_s']} s/s")
    if len(vt) < 20:
        print(f"only {len(vt)} face frames in the sync window — cannot measure lag"); return
    grid = np.arange(t0, t1, 0.005)
    sel = (mt >= t0 - 1) & (mt <= t1 + 1)
    a = np.gradient(np.interp(grid, mt[sel], pitch[sel]))
    b = np.gradient(np.interp(grid, vt, vy))
    a, b = (a - a.mean()) / (a.std() + 1e-12), (b - b.mean()) / (b.std() + 1e-12)
    lags = np.arange(-100, 101)  # ±500 ms at 5 ms
    r = np.array([np.mean(a[max(0, -k):len(a) - max(0, k)] * b[max(0, k):len(b) - max(0, -k)]) for k in lags])
    k = int(np.argmax(np.abs(r)))
    print(f"sync nods: {len(vt)} face frames; peak |r| = {abs(r[k]):.2f} at lag {lags[k] * 5:+d} ms "
          f"(positive ⇒ video events appear later than motion events)")
    print("PASS" if abs(r[k]) >= 0.5 and abs(lags[k] * 5) <= 150 else "CHECK: weak correlation or large lag — inspect before fusing")


if __name__ == "__main__":
    main()
