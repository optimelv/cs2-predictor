from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class ModelCandidate:
    name: str
    target_level: str
    role: str
    strengths: List[str]
    weaknesses: List[str]


MODEL_CANDIDATES = [
    ModelCandidate(
        name="logistic_regression_baseline",
        target_level="map",
        role="baseline",
        strengths=[
            "easy to interpret",
            "good leakage detector",
            "fast to retrain",
        ],
        weaknesses=[
            "limited non-linearity",
            "weaker interaction modeling",
        ],
    ),
    ModelCandidate(
        name="catboost_primary",
        target_level="map",
        role="primary",
        strengths=[
            "strong on tabular data",
            "native categorical handling",
            "robust with mixed dense and sparse features",
        ],
        weaknesses=[
            "slower than simple linear baselines",
            "requires tuning and calibration",
        ],
    ),
    ModelCandidate(
        name="lightgbm_challenger",
        target_level="map",
        role="challenger",
        strengths=[
            "fast training",
            "excellent tabular benchmark candidate",
        ],
        weaknesses=[
            "categorical handling often needs more care",
        ],
    ),
    ModelCandidate(
        name="stacked_series_model",
        target_level="series",
        role="ensemble",
        strengths=[
            "can combine map model output with event and lineup context",
        ],
        weaknesses=[
            "higher leakage risk if built carelessly",
            "more complex monitoring",
        ],
    ),
]
