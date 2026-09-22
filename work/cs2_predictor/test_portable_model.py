from __future__ import annotations

import math
import unittest

import numpy as np

from .export_site_predictions import portable_model_probability
from .promote_portable_model import (
    CORE_FEATURES,
    GradientBoostingClassifier,
    append_live_training_rows,
    baseline_probability,
    fit_artifact,
    matrix,
    promotion_passes,
    repair_online_integrity_risk,
    repair_online_timestamps,
    chronological_training_rows,
    segment_calibration_decision,
    slice_gate,
    verified_online_row,
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
        comparison = {"metrics": {"accuracy": 0.68, "log_loss": 0.59, "brier": 0.20, "ece": 0.04}, "slices": [{"key": "tier_1", "rows": 100, "eligible": True, "metrics": {"accuracy": 0.68, "log_loss": 0.59, "brier": 0.20, "ece": 0.04}}]}
        candidate = {
            "rows": 400,
            "folds": 4,
            "metrics": {"accuracy": 0.69, "log_loss": 0.58, "brier": 0.20, "ece": 0.08},
            "slices": [{"key": "tier_1", "rows": 100, "eligible": True, "metrics": {"accuracy": 0.69, "log_loss": 0.58, "brier": 0.20, "ece": 0.08}}],
        }
        self.assertFalse(promotion_passes(candidate, comparison))

    def test_slice_gate_rejects_local_regression(self) -> None:
        comparison = {"slices": [{"key": "tier_2", "rows": 80, "eligible": True, "metrics": {"accuracy": 0.67, "log_loss": 0.60, "brier": 0.21, "ece": 0.04}}]}
        candidate = {"slices": [{"key": "tier_2", "rows": 80, "eligible": True, "metrics": {"accuracy": 0.62, "log_loss": 0.64, "brier": 0.23, "ece": 0.08}}]}
        self.assertFalse(slice_gate(candidate, comparison)["passed"])

    def test_history_date_does_not_fabricate_online_timestamp(self) -> None:
        import json
        import tempfile
        from pathlib import Path

        rows = [{"match_id": "m1", "match_date": "", "match_timestamp": 0}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            path.write_text(json.dumps({"matches": [{"match_id": "m1", "match_date": "2026-07-28"}]}), encoding="utf-8")
            self.assertEqual(repair_online_timestamps(rows, path), 0)
        self.assertEqual(rows[0]["match_date"], "")
        self.assertEqual(rows[0]["match_timestamp"], 0)
        self.assertEqual(chronological_training_rows(rows), [])

    def test_chronological_training_excludes_unanchored_legacy_rows(self) -> None:
        valid = {"match_id": "valid", "match_date": "2026-07-28", "match_timestamp": 1785232800}
        rows = [valid, {"match_id": "missing", "match_date": "", "match_timestamp": 0}, {"match_id": "date-only", "match_date": "2026-07-28", "match_timestamp": 0}]
        self.assertEqual(chronological_training_rows(rows), [valid])

    def test_live_training_skips_finished_row_without_source_timestamp(self) -> None:
        import json
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            predictions = root / "predictions.json"
            predictions.write_text(json.dumps({"model_state": {"teams": []}}), encoding="utf-8")
            live = root / "live.json"
            live.write_text(json.dumps({
                "fetched_at_utc": "2026-09-20T04:55:46Z",
                "matches": [{
                    "match_id": "hltv:missing-time",
                    "event_name": "CCT Europe Series 9",
                    "team1_name": "Alpha",
                    "team2_name": "Beta",
                    "product_tier": "tier_2",
                    "score1": 2,
                    "score2": 0,
                    "status": "finished",
                    "starts_at": None,
                }],
            }), encoding="utf-8")
            rows: list[dict] = []
            self.assertEqual(append_live_training_rows(live, predictions, rows, root / "history.json"), 0)
            self.assertEqual(rows, [])

    def test_live_training_skips_partial_live_score(self) -> None:
        import json
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            predictions = root / "predictions.json"
            predictions.write_text(json.dumps({"model_state": {"teams": []}}), encoding="utf-8")
            live = root / "live.json"
            live.write_text(json.dumps({
                "fetched_at_utc": "2026-09-20T04:55:46Z",
                "matches": [{
                    "match_id": "hltv:live-partial",
                    "event_name": "CCT Europe Series 9",
                    "team1_name": "Alpha",
                    "team2_name": "Beta",
                    "product_tier": "tier_2",
                    "score1": 1,
                    "score2": 0,
                    "status": "live",
                    "starts_at": "2026-09-20T04:00:00Z",
                }],
            }), encoding="utf-8")
            rows: list[dict] = []
            self.assertEqual(append_live_training_rows(live, predictions, rows, root / "history.json"), 0)
            self.assertEqual(rows, [])

    def test_live_training_uses_only_saved_prematch_features(self) -> None:
        import json
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            predictions = root / "predictions.json"
            live = root / "live.json"
            prematch = root / "prematch.jsonl"
            predictions.write_text(json.dumps({"generated_at_utc": "2026-09-22T09:55:00Z", "model_state": {"teams": [
                {"team_name": "Alpha", "elo": 1600, "recent_win_rate_10": 0.6},
                {"team_name": "Beta", "elo": 1400, "recent_win_rate_10": 0.4},
            ]}}), encoding="utf-8")
            match = {"match_id": "hltv:prematch-test", "event_name": "CCT Europe Series 9",
                     "team1_name": "Alpha", "team2_name": "Beta", "product_tier": "tier_2",
                     "starts_at": "2026-09-22T12:00:00Z", "series_format": "bo3"}
            live.write_text(json.dumps({"fetched_at_utc": "2026-09-22T10:00:00Z", "matches": [{**match, "status": "upcoming"}]}), encoding="utf-8")
            rows: list[dict] = []
            self.assertEqual(append_live_training_rows(live, predictions, rows, prematch_path=prematch), 0)
            self.assertEqual(len(prematch.read_text().splitlines()), 1)

            # A later team state must never replace features captured before kickoff.
            predictions.write_text(json.dumps({"generated_at_utc": "2026-09-22T12:30:00Z", "model_state": {"teams": [
                {"team_name": "Alpha", "elo": 1300}, {"team_name": "Beta", "elo": 1800},
            ]}}), encoding="utf-8")
            live.write_text(json.dumps({"fetched_at_utc": "2026-09-22T13:00:00Z", "matches": [{**match, "status": "finished", "score1": 2, "score2": 0}]}), encoding="utf-8")
            self.assertEqual(append_live_training_rows(live, predictions, rows, prematch_path=prematch), 1)
            self.assertEqual(rows[0]["elo_diff"], 200)
            self.assertEqual(rows[0]["feature_observed_at_utc"], "2026-09-22T10:00:00Z")
            self.assertTrue(verified_online_row(rows[0]))
            self.assertEqual(append_live_training_rows(live, predictions, rows, prematch_path=prematch), 0)

    def test_online_row_without_prematch_provenance_is_rejected(self) -> None:
        self.assertFalse(verified_online_row({"match_timestamp": 1789982400, "feature_source": "prematch_snapshot_v1"}))
        self.assertFalse(verified_online_row({"match_timestamp": 1789982400, "feature_source": "prematch_snapshot_v1", "feature_observed_at_utc": "2026-09-21T12:00:00Z"}))

    def test_old_snapshot_cannot_hide_later_model_state(self) -> None:
        import json
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            predictions = root / "predictions.json"
            live = root / "live.json"
            prematch = root / "prematch.jsonl"
            predictions.write_text(json.dumps({"generated_at_utc": "2026-09-22T12:10:00Z", "model_state": {"teams": []}}), encoding="utf-8")
            live.write_text(json.dumps({"fetched_at_utc": "2026-09-22T10:00:00Z", "matches": [{
                "match_id": "hltv:late-state", "event_name": "CCT Europe Series 9", "team1_name": "Alpha",
                "team2_name": "Beta", "product_tier": "tier_2", "starts_at": "2026-09-22T12:00:00Z", "status": "upcoming",
            }]}), encoding="utf-8")
            self.assertEqual(append_live_training_rows(live, predictions, [], prematch_path=prematch), 0)
            self.assertFalse(prematch.exists())

    def test_tier2_online_rows_keep_medium_integrity_risk(self) -> None:
        rows = [
            {"model_tier": "T2", "integrity_risk": "low"},
            {"model_tier": "T1", "integrity_risk": "low"},
        ]
        self.assertEqual(repair_online_integrity_risk(rows), 1)
        self.assertEqual(rows[0]["integrity_risk"], "medium")

    def test_segment_features_are_derived_from_match_context(self) -> None:
        rows = [{"target_team1_win": 1, "model_tier": "T2", "best_of": 1}]
        values, _ = matrix(rows, ["is_tier2", "is_bo1", "is_bo5"])
        self.assertEqual(values.tolist(), [[1.0, 1.0, 0.0]])

    def test_tier2_segment_calibration_is_separately_gated(self) -> None:
        rows = [{"model_tier": "T2", "best_of": 3} for _ in range(40)]
        y_true = [1] * 24 + [0] * 16
        probabilities = [0.8] * 40
        raw = {
            "metrics": {"accuracy": 0.6, "log_loss": 0.777661, "brier": 0.28, "ece": 0.2},
            "slices": [],
            "_evaluated_rows": rows,
            "_y_true": y_true,
            "_probabilities": probabilities,
        }
        decision = segment_calibration_decision(raw, None)
        self.assertTrue(decision["audit"]["passed"])
        self.assertLess(decision["audit"]["after"]["log_loss"], decision["audit"]["before"]["log_loss"])

    def test_heuristic_runtime_applies_tier2_calibration(self) -> None:
        champion = {"kind": "heuristic", "segment_calibration": {"tier_2_shrink": 0.4}}
        actual = portable_model_probability(champion, {"is_tier2": 1.0}, 0.7)
        self.assertAlmostEqual(actual, 0.58)


if __name__ == "__main__":
    unittest.main()
