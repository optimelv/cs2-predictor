from __future__ import annotations

import math
import unittest

import numpy as np

from .export_site_predictions import portable_model_probability
from .promote_portable_model import (
    CORE_FEATURES,
    GradientBoostingClassifier,
    baseline_probability,
    fit_artifact,
    matrix,
    promotion_passes,
)


class PortableModelTests(unittest.TestCase):
    def rows(self) -> list[dict]:
        rows = []
        for index in range(220):
            elo_diff = ((index * 37) % 420) - 210
            elo_probability = 1.0 / (1.0 + 10.0 ** (-elo_diff / 400.0))
            rank_advantage = ((index * 11) % 50) - 25
            points_diff = ((index * 53) % 900) - 450
            recent_diff = (((index * 7) % 80) - 40) / 100
            signal = elo_diff / 280 + rank_advantage / 35 + points_diff / 1000 + recent_diff
            rows.append({
                "match_id": str(index),
                "match_date": f"2026-01-{index % 28 + 1:02d}",
                "target_team1_win": int(signal + (0.35 if index % 5 else -0.35) > 0),
                "elo_diff": elo_diff,
                "elo_prob_team1": elo_probability,
                "vrs_rank_advantage": rank_advantage,
                "vrs_points_diff": points_diff,
                "recent_win_rate_10_diff": recent_diff,
            })
        return rows

    @unittest.skipIf(GradientBoostingClassifier is None, "scikit-learn is optional for the seed-only runtime")
    def test_serialized_gbdt_matches_sklearn(self) -> None:
        rows = self.rows()
        config = {
            "family": "gradient_boosting",
            "features": CORE_FEATURES,
            "n_estimators": 20,
            "max_depth": 2,
            "learning_rate": 0.04,
            "min_samples_leaf": 12,
            "blend_weight": 0.75,
        }
        artifact = fit_artifact(rows, config, {"accuracy": 0.7, "log_loss": 0.6, "brier": 0.2, "ece": 0.05})
        x, y = matrix(rows, CORE_FEATURES)
        model = GradientBoostingClassifier(
            n_estimators=20,
            learning_rate=0.04,
            max_depth=2,
            min_samples_leaf=12,
            subsample=0.9,
            random_state=42,
        ).fit(x, y)
        for index in (0, 41, 119, 219):
            baseline = baseline_probability(rows[index])
            expected = 0.75 * float(model.predict_proba(x[[index]])[0, 1]) + 0.25 * baseline
            actual = portable_model_probability(artifact, rows[index], baseline)
            self.assertAlmostEqual(actual, expected, places=6)

    def test_promotion_rejects_degraded_calibration(self) -> None:
        comparison = {"metrics": {"accuracy": 0.68, "log_loss": 0.59, "brier": 0.20, "ece": 0.04}}
        candidate = {
            "rows": 400,
            "folds": 4,
            "metrics": {"accuracy": 0.69, "log_loss": 0.58, "brier": 0.20, "ece": 0.08},
        }
        self.assertFalse(promotion_passes(candidate, comparison))


if __name__ == "__main__":
    unittest.main()
