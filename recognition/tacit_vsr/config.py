"""Paths and tunable thresholds for the TACIT visual recognition service."""
from __future__ import annotations

import os
from pathlib import Path

RECOGNITION_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = RECOGNITION_DIR.parent
THIRD_PARTY = PROJECT_ROOT / "third_party" / "visual"

# Vendored ESPnet-derived model code (Apache-2.0, via mpc001 -> amanvirparhar/chaplin, MIT repo).
CHAPLIN_DIR = THIRD_PARTY / "chaplin"
MODEL_DIR = THIRD_PARTY / "weights" / "LRS3_V_WER19.1"
MODEL_PATH = MODEL_DIR / "model.pth"
MODEL_CONF = MODEL_DIR / "model.json"
SPM_MODEL = THIRD_PARTY / "auto_avsr" / "spm" / "unigram" / "unigram5000.model"
UNITS_FILE = CHAPLIN_DIR / "pipelines" / "tokens" / "unigram5000_units.txt"
MEAN_FACE = CHAPLIN_DIR / "pipelines" / "detectors" / "mediapipe" / "20words_mean_face.npy"

MODEL_NAME = "auto-avsr LRS3_V_WER19.1 (conformer VSR, visual-only, 25 fps, unigram5000)"
WEIGHTS_LICENSE = (
    "Research / non-commercial only: weights from mpc001/Visual_Speech_Recognition_for_Multiple_Languages "
    "(custom licence: individual research, private study, non-commercial research prototypes; trained on "
    "LRS3/LRS2/VoxCeleb2/AVSpeech), re-hosted without a licence file at hf.co/Amanvir/LRS3_V_WER19.1. "
    "Model code Apache-2.0."
)
METHOD = "vsr-closed-set-rescoring"

DATA_DIR = RECOGNITION_DIR / "data"
TRIALS_FILE = DATA_DIR / "trials.jsonl"
CLIPS_DIR = DATA_DIR / "clips"
HARNESS_DIR = RECOGNITION_DIR / "harness"

MODEL_FPS = 25.0


def _f(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


# --- scoring ---------------------------------------------------------------
# joint = (1 - CTC_WEIGHT) * attention_teacher_forced + CTC_WEIGHT * ctc_forward
CTC_WEIGHT = _f("TACIT_CTC_WEIGHT", 0.1)
FREE_DECODE_BEAM = int(_f("TACIT_BEAM", 10))
# Free-decoding implementation: "fast" (KV-cached, adapted from SilentFlow; ~4x faster, same WER on the 96-clip
# benchmark — eval/bench_decoder.py) or "espnet" (original BatchBeamSearch). Instant revert: TACIT_DECODER=espnet.
DECODER = os.environ.get("TACIT_DECODER", "fast")
# Phrase mode: also score the fixed phrase list (tacit_vsr/phrases.py) per utterance, display-only (~100 ms on MPS).
PHRASE_MODE = os.environ.get("TACIT_PHRASES", "1") != "0"

# --- abstention thresholds (see docs/research/visual.md for how they were set) ----
MIN_FRAMES = int(_f("TACIT_MIN_FRAMES", 12))  # < ~0.5 s at 25 fps
MIN_FACE_FRACTION = _f("TACIT_MIN_FACE_FRACTION", 0.5)
# Mouth-motion gate, from FaceMesh lip landmarks, in units of inter-ocular distance.
# p95-p5 range of inner-lip aperture over the clip.
MIN_APERTURE_RANGE = _f("TACIT_MIN_APERTURE_RANGE", 0.04)
MIN_WIDTH_RANGE = _f("TACIT_MIN_WIDTH_RANGE", 0.04)
# Margin between top-1 and top-2 length-normalised score below which we abstain.
MIN_MARGIN = _f("TACIT_MIN_MARGIN", 0.15)
# Abstain when the open-vocabulary hypothesis beats the best candidate by more than this
# (length-normalised joint log-likelihood, nats/token).
MAX_GARBAGE_GAP = _f("TACIT_MAX_GARBAGE_GAP", 1.5)
