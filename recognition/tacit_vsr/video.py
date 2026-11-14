"""Clip decoding, frame-rate resampling, face landmarks and mouth-ROI cropping.

The mouth-ROI geometry (4 stable points -> similarity transform onto a mean face ->
96x96 patch around the mouth centre -> 88x88 centre crop, grayscale, mean 0.421 /
std 0.165) follows the Auto-AVSR / Chaplin preprocessing
(third_party/visual/chaplin/pipelines/detectors/mediapipe/video_process.py, Apache-2.0),
re-implemented here so we do not depend on torchvision/skimage.

Landmarks come from MediaPipe FaceMesh (one model gives both the alignment points
and the lip landmarks used for the mouth-motion gate). `detector="blazeface"`
reproduces Chaplin's exact detector for A/B comparison.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field

import av
import cv2
import numpy as np

from . import config

# FaceMesh landmark indices
_R_EYE = (33, 133)      # subject's right eye corners (image left)
_L_EYE = (362, 263)
_NOSE_TIP = 1
_MOUTH_CORNERS = (61, 291)
_LIP_UP_IN, _LIP_LO_IN = 13, 14


@dataclass
class DecodedClip:
    frames: list[np.ndarray]          # RGB uint8, resampled to MODEL_FPS
    source_fps: float                 # measured from container timestamps
    source_frames: int                # decoded frames inside the window
    duration_ms: float                # full clip duration (first..last frame)
    window_start_ms: float
    window_end_ms: float


@dataclass
class MouthTrack:
    roi: np.ndarray | None            # (T, 96, 96) uint8 grayscale
    face_fraction: float
    aperture_range: float | None
    width_range: float | None
    aperture: list[float] = field(default_factory=list)


def decode_clip(data: bytes, start_ms: float | None = None, end_ms: float | None = None,
                fps: float = config.MODEL_FPS, max_seconds: float = 20.0) -> DecodedClip:
    """Decode a webm/mp4/flv clip and resample to a constant `fps` by timestamp.

    MediaRecorder webm is variable-frame-rate and usually has no duration header, so we
    never trust container fps/duration: every frame's presentation timestamp is read and
    the clip is resampled by nearest-timestamp lookup. Times are relative to the first
    decoded video frame.
    """
    frames: list[np.ndarray] = []
    times: list[float] = []
    with av.open(io.BytesIO(data)) as container:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        tb = float(stream.time_base) if stream.time_base else None
        idx = 0
        for frame in container.decode(stream):
            if frame.pts is not None and tb:
                t = frame.pts * tb
            elif frame.time is not None:
                t = float(frame.time)
            else:  # no timestamps at all: assume nominal 30 fps
                t = idx / 30.0
            img = frame.to_ndarray(format="rgb24")
            # Honour display rotation is not needed for webcam clips; keep as decoded.
            frames.append(img)
            times.append(t)
            idx += 1
            if times[-1] - times[0] > max_seconds:
                break
    if not frames:
        raise ValueError("no video frames decoded")

    t = np.asarray(times, dtype=np.float64)
    order = np.argsort(t, kind="stable")
    t = t[order] - t[order[0]]
    frames = [frames[i] for i in order]
    duration = float(t[-1])
    n_src = len(frames)
    # Last frame is displayed for roughly one median frame interval.
    med_dt = float(np.median(np.diff(t))) if n_src > 1 else 1.0 / 30.0
    med_dt = med_dt if med_dt > 0 else 1.0 / 30.0
    full_end = duration + med_dt
    src_fps = (n_src - 1) / duration if duration > 0 else 0.0

    w0 = 0.0 if start_ms is None else max(0.0, float(start_ms) / 1000.0)
    w1 = full_end if end_ms is None else min(full_end, float(end_ms) / 1000.0)
    if w1 <= w0:
        raise ValueError(f"empty window: startMs={start_ms} endMs={end_ms} clip={full_end * 1000:.0f}ms")

    n_out = max(1, int(round((w1 - w0) * fps)))
    targets = w0 + (np.arange(n_out) + 0.5) / fps
    # frame shown at time x = last frame with timestamp <= x
    pick = np.clip(np.searchsorted(t, targets, side="right") - 1, 0, n_src - 1)
    out = [frames[i] for i in pick]
    in_window = int(((t >= w0) & (t < w1)).sum())
    return DecodedClip(out, src_fps, in_window, full_end * 1000.0, w0 * 1000.0, w1 * 1000.0)


class MouthCropper:
    def __init__(self, detector: str = "facemesh"):
        import mediapipe as mp

        self.detector = detector
        self.mp = mp
        self.reference = np.load(str(config.MEAN_FACE))
        self.stable_reference = np.vstack([
            np.mean(self.reference[36:42], axis=0),   # right eye
            np.mean(self.reference[42:48], axis=0),   # left eye
            np.mean(self.reference[31:36], axis=0),   # nose
            np.mean(self.reference[48:68], axis=0),   # mouth
        ])

    # -- landmark extraction ----------------------------------------------
    def _facemesh(self, frames):
        pts4, lips = [], []
        with self.mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False, max_num_faces=1, refine_landmarks=False,
            min_detection_confidence=0.5, min_tracking_confidence=0.5,
        ) as fm:
            for img in frames:
                h, w = img.shape[:2]
                res = fm.process(img)
                if not res.multi_face_landmarks:
                    pts4.append(None)
                    lips.append(None)
                    continue
                lm = res.multi_face_landmarks[0].landmark
                p = lambda i: np.array([lm[i].x * w, lm[i].y * h])
                r_eye = (p(_R_EYE[0]) + p(_R_EYE[1])) / 2
                l_eye = (p(_L_EYE[0]) + p(_L_EYE[1])) / 2
                mouth = (p(_MOUTH_CORNERS[0]) + p(_MOUTH_CORNERS[1]) + p(_LIP_UP_IN) + p(_LIP_LO_IN)) / 4
                pts4.append(np.vstack([r_eye, l_eye, p(_NOSE_TIP), mouth]))
                iod = np.linalg.norm(l_eye - r_eye) + 1e-6
                lips.append((
                    np.linalg.norm(p(_LIP_UP_IN) - p(_LIP_LO_IN)) / iod,
                    np.linalg.norm(p(_MOUTH_CORNERS[0]) - p(_MOUTH_CORNERS[1])) / iod,
                ))
        return pts4, lips

    def _blazeface(self, frames):
        """Chaplin's detector: MediaPipe face detection, first 4 keypoints."""
        fd = self.mp.solutions.face_detection
        pts4 = []
        with fd.FaceDetection(min_detection_confidence=0.5, model_selection=1) as full, \
                fd.FaceDetection(min_detection_confidence=0.5, model_selection=0) as short:
            for img in frames:
                h, w = img.shape[:2]
                res = full.process(img)
                if not res.detections:
                    res = short.process(img)
                if not res.detections:
                    pts4.append(None)
                    continue
                best = max(res.detections, key=lambda d: d.location_data.relative_bounding_box.width)
                kp = best.location_data.relative_keypoints
                pts4.append(np.array([[kp[i].x * w, kp[i].y * h] for i in range(4)]))
        return pts4

    # -- public -----------------------------------------------------------
    def __call__(self, frames: list[np.ndarray]) -> MouthTrack:
        pts4, lips = self._facemesh(frames)
        if self.detector == "blazeface":
            pts4 = self._blazeface(frames)
        n = len(frames)
        valid = [i for i, p in enumerate(pts4) if p is not None]
        face_fraction = len(valid) / max(n, 1)
        lip_valid = [l for l in lips if l is not None]
        ap_range = w_range = None
        aperture: list[float] = []
        if len(lip_valid) >= 5:
            ap = np.array([l[0] for l in lip_valid])
            wd = np.array([l[1] for l in lip_valid])
            ap_range = float(np.percentile(ap, 95) - np.percentile(ap, 5))
            w_range = float(np.percentile(wd, 95) - np.percentile(wd, 5))
            aperture = [round(float(x), 4) for x in ap]
        if not valid:
            return MouthTrack(None, 0.0, ap_range, w_range, aperture)

        # interpolate missing landmarks (linear inside gaps, hold at the ends)
        lms = np.zeros((n, 4, 2))
        for d0 in range(4):
            for d1 in range(2):
                lms[:, d0, d1] = np.interp(np.arange(n), valid, [pts4[i][d0, d1] for i in valid])

        roi = np.zeros((n, 96, 96), dtype=np.uint8)
        margin = 12 // 2
        for i, img in enumerate(frames):
            m = min(margin, i, n - 1 - i)
            sm = lms[i - m: i + m + 1].mean(axis=0)
            sm += lms[i].mean(axis=0) - sm.mean(axis=0)
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
            tf = cv2.estimateAffinePartial2D(sm, self.stable_reference, method=cv2.LMEDS)[0]
            if tf is None:
                tf = cv2.estimateAffinePartial2D(sm, self.stable_reference)[0]
            warped = cv2.warpAffine(gray, tf, dsize=(256, 256), flags=cv2.INTER_LINEAR,
                                    borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            cx, cy = sm[3] @ tf[:, :2].T + tf[:, 2]
            x0 = int(round(np.clip(cx - 48, 0, 256 - 96)))
            y0 = int(round(np.clip(cy - 48, 0, 256 - 96)))
            roi[i] = warped[y0:y0 + 96, x0:x0 + 96]
        return MouthTrack(roi, face_fraction, ap_range, w_range, aperture)


def roi_to_tensor(roi: np.ndarray):
    """(T,96,96) uint8 -> torch (1,T,88,88) float32, normalised as in Auto-AVSR."""
    import torch

    x = torch.from_numpy(roi[:, 4:92, 4:92].astype(np.float32) / 255.0)
    x = (x - 0.421) / 0.165
    return x.unsqueeze(0)


def frames_from_jpegs(times_ms: list[float], jpegs: list[bytes], fps: float = config.MODEL_FPS) -> DecodedClip:
    """Browser-captured JPEG frames with real capture timestamps (performance.now ms) → constant-rate RGB frames,
    using the same nearest-preceding-timestamp resampling as decode_clip (no fabricated frame rate)."""
    if not jpegs or len(jpegs) != len(times_ms):
        raise ValueError("frames and timestamps must be non-empty and the same length")
    frames, times = [], []
    for t, b in sorted(zip(times_ms, jpegs), key=lambda p: p[0]):
        img = cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            continue
        frames.append(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)); times.append(t / 1000.0)
    if not frames:
        raise ValueError("no decodable JPEG frames")
    t = np.asarray(times) - times[0]
    med_dt = float(np.median(np.diff(t))) if len(t) > 1 else 1 / 30
    end = float(t[-1]) + (med_dt if med_dt > 0 else 1 / 30)
    n_out = max(1, int(round(end * fps)))
    pick = np.clip(np.searchsorted(t, (np.arange(n_out) + 0.5) / fps, side="right") - 1, 0, len(frames) - 1)
    src_fps = (len(frames) - 1) / t[-1] if t[-1] > 0 else 0.0
    return DecodedClip([frames[i] for i in pick], src_fps, len(frames), end * 1000.0, 0.0, end * 1000.0)
