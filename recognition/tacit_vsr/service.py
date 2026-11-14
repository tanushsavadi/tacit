"""Local Auto-AVSR recognition service for the TACIT backend (binds 127.0.0.1 only; the Node server is the only client).

    .venv/bin/python -m tacit_vsr.service [--port 8765] [--device mps|cpu]
GET  /health    → {ok, model, device, licence}
POST /recognize → body {"kind":"jpeg-frames","timesMs":[...],"frames":[base64 JPEG,...]} or {"kind":"video","data":base64}
                  → {text, n_tokens, gate, ms, frames, face_fraction, ...}; raw model output, never rewritten.
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import base64
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch

from . import config, engine, video
from .transcribe import recognize_clip

MAX_BODY = 20 * 1024 * 1024
MAX_FRAMES = 300


class Service:
    def __init__(self, device: str):
        t = time.perf_counter()
        self.device = device
        self.eng = engine.VSREngine(device)
        self.crop = video.MouthCropper()
        self.lock = threading.Lock()  # one inference at a time (MediaPipe graph + model are not shared-safe)
        print(f"[vsr] {config.MODEL_NAME} on {device}, loaded in {round((time.perf_counter() - t) * 1000)} ms", flush=True)
        # Warm-up on a blank 2 s clip so the user's first utterance does not pay kernel compilation / allocator cost.
        # Its output is discarded and never reported.
        w = time.perf_counter()
        with torch.no_grad():
            self.eng.nbest(self.eng.encode(torch.zeros(1, 50, 88, 88)), config.NBEST)
        print(f"[vsr] warm-up {round((time.perf_counter() - w) * 1000)} ms (decoder: {config.DECODER})", flush=True)

    def recognize(self, body: dict) -> dict:
        t0 = time.perf_counter()
        if body.get("kind") == "jpeg-frames":
            times, frames = body.get("timesMs") or [], body.get("frames") or []
            if not 1 <= len(frames) <= MAX_FRAMES or len(times) != len(frames):
                raise ValueError(f"need 1–{MAX_FRAMES} frames with one timestamp each")
            clip = video.frames_from_jpegs([float(x) for x in times], [base64.b64decode(f) for f in frames])
        elif body.get("kind") == "video":
            clip = video.decode_clip(base64.b64decode(body["data"]))
        else:
            raise ValueError("kind must be 'jpeg-frames' or 'video'")
        with self.lock:
            out = recognize_clip(self.eng, self.crop, clip, t0)
        out["model"] = config.MODEL_NAME
        out["device"] = self.device
        return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    ap.add_argument("--parent-pid", type=int, default=None, help="exit when this process (the Node server) is gone")
    a = ap.parse_args()
    if a.parent_pid:
        def watch() -> None:
            while True:
                time.sleep(1)
                try:
                    os.kill(a.parent_pid, 0)
                except OSError:
                    os._exit(0)
        threading.Thread(target=watch, daemon=True).start()
    svc = Service(a.device)

    class Handler(BaseHTTPRequestHandler):
        def _send(self, code: int, obj: dict) -> None:
            data = json.dumps(obj).encode()
            self.send_response(code); self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data)

        def do_GET(self):  # noqa: N802
            if self.path == "/health":
                self._send(200, {"ok": True, "model": config.MODEL_NAME, "device": svc.device, "licence": config.WEIGHTS_LICENSE})
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):  # noqa: N802
            if self.path != "/recognize":
                return self._send(404, {"error": "not found"})
            n = int(self.headers.get("content-length") or 0)
            if not 0 < n <= MAX_BODY:
                return self._send(413, {"error": "body too large or empty"})
            try:
                self._send(200, svc.recognize(json.loads(self.rfile.read(n))))
            except ValueError as e:
                self._send(400, {"error": str(e)})
            except Exception as e:  # noqa: BLE001
                self._send(500, {"error": f"{type(e).__name__}: {e}"})

        def log_message(self, *args):  # no request logging (no content, no URLs)
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"[vsr] listening on 127.0.0.1:{a.port}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
