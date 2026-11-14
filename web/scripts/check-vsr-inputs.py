"""Offline transport feasibility probe using the EXISTING Auto-AVSR pipeline.

Not a live adapter, silent-word evaluation, or browser encoding benchmark.
Run with recognition/.venv/bin/python from the web directory. Writes no recordings.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'recognition'))
import cv2
from tacit_vsr import video, engine

source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'recognition/eval/clips/cremad/1030_ITS_NEU_XX.flv'
output = ROOT / 'web/artifacts/transport'
output.mkdir(parents=True, exist_ok=True)
eng = engine.VSREngine('cpu')
crop = video.MouthCropper()
rows = []

def recognize(frames):
    start = time.perf_counter()
    track = crop(frames)
    if track.roi is None:
        return {'rawText': None, 'faceFraction': track.face_fraction, 'error': 'no face'}
    enc = eng.encode(video.roi_to_tensor(track.roi))
    hyps = eng.beam(enc)
    ids = [int(i) for i in hyps[0].yseq.tolist() if int(i) != eng.sos] if hyps else []
    return {'rawText': eng.detokenize(ids), 'faceFraction': track.face_fraction, 'cropAndInferenceMs': (time.perf_counter() - start) * 1000}

with tempfile.TemporaryDirectory(prefix='vsr-inputs-') as tmp:
    variants = [('original-flv', source)]
    for label, suffix, args in [('mp4-h264', '.mp4', ['-c:v', 'libx264', '-crf', '18']), ('webm-vp8', '.webm', ['-c:v', 'libvpx', '-crf', '10', '-b:v', '1000k'])]:
        path = Path(tmp) / ('input' + suffix)
        start = time.perf_counter()
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(source), '-an', *args, str(path)], check=True)
        variants.append((label, path))
        # These CLI timings must not be mistaken for MediaRecorder latency.
        print(json.dumps({'variant': label, 'offlineFfmpegEncodeMs': (time.perf_counter() - start) * 1000}))
    original = None
    for label, path in variants:
        start = time.perf_counter()
        clip = video.decode_clip(path.read_bytes())
        decode_ms = (time.perf_counter() - start) * 1000
        if original is None:
            original = clip
        rows.append({'variant': label, 'bytes': path.stat().st_size, 'frames': len(clip.frames), 'sourceFps': clip.source_fps,
                     'width': clip.frames[0].shape[1], 'height': clip.frames[0].shape[0], 'durationMs': clip.duration_ms,
                     'decodeMs': decode_ms, **recognize(clip.frames)})
    # This bypasses decode_clip only inside this probe: a production JPEG decoder remains Claude's task.
    frames, jpeg_bytes = [], 0
    start = time.perf_counter()
    for rgb in original.frames:
        ok, encoded = cv2.imencode('.jpg', cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ok:
            raise RuntimeError('JPEG encode failed')
        jpeg_bytes += len(encoded)
        frames.append(cv2.cvtColor(cv2.imdecode(encoded, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB))
    rows.append({'variant': 'jpeg80-rgb-sequence-PROBE-ONLY', 'bytes': jpeg_bytes, 'frames': len(frames),
                 'encodeDecodeMs': (time.perf_counter() - start) * 1000, **recognize(frames)})
report = {'provenance': 'Offline genuine Auto-AVSR on an existing recorded VOICED actor clip. No live or silent-word claim. JPEG uses OpenCV quality 80, not browser canvas quality equivalence.',
          'model': eng.__class__.__name__, 'rows': rows}
(output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
