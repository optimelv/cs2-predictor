from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

try:
    from sklearn.ensemble import GradientBoostingClassifier
except ImportError:  # The lightweight seed builder does not require scikit-learn.
    GradientBoostingClassifier = None

from .build_model_dataset import safe_float, safe_int
from .validation import accuracy_at_threshold, brier_score, log_loss, make_purged_time_folds, reliability_bins


CORE_FEATURES = [
    "elo_diff",
    "vrs_rank_advantage",
    "vrs_points_diff",
    "recent_win_rate_10_diff",
]
CALIBRATION_FEATURES = ["baseline_logit"]
CONTEXT_FEATURES = [
    *CORE_FEATURES,
    "best_of",
    "phase_order",
    "is_lan",
    "is_playoff",
    "is_elimination_match",
]
SEED_FIELDS = [
    "match_id",
    "match_date",
    "match_timestamp",
    "event_name",
    "team1_name",
    "team2_name",
    "target_team1_win",
    "model_tier",
    "integrity_risk",
    "elo_prob_team1",
    *CONTEXT_FEATURES,
]
ELIGIBLE_TIERS = {"T1", "T1_5", "T2"}
ELIGIBLE_RISKS = {"low", "medium"}
DEFAULT_REGISTRY_PATH = Path("docs/data/model-registry.json")
DEFAULT_SEED_PATH = Path("models/portable-training-seed.csv.gz")
DEFAULT_ONLINE_PATH = Path("models/portable-online-training.jsonl")
DEFAULT_PREDICTIONS_PATH = Path("docs/data/predictions.json")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-35.0, min(35.0, value))))


def fit_stable_logistic(x_train: np.ndarray, y_train: np.ndarray, *, l2: float, epochs: int = 1800) -> np.ndarray:
    x_train = np.nan_to_num(x_train, nan=0.0, posinf=8.0, neginf=-8.0)
    x_aug = np.c_[np.ones(x_train.shape[0]), x_train]
    weights = np.zeros(x_aug.shape[1], dtype=float)
    for _ in range(epochs):
        logits = np.clip(np.sum(x_aug * weights, axis=1), -35.0, 35.0)
        probabilities = 1.0 / (1.0 + np.exp(-logits))
        gradient = np.mean(x_aug * (probabilities - y_train)[:, None], axis=0)
        gradient[1:] += l2 * weights[1:]
        gradient = np.nan_to_num(gradient, nan=0.0, posinf=5.0, neginf=-5.0)
        norm = float(np.linalg.norm(gradient))
        if norm > 5.0:
            gradient *= 5.0 / norm
        weights = np.clip(weights - 0.02 * gradient, -20.0, 20.0)
    return weights


def predict_stable_logistic(weights: np.ndarray, x: np.ndarray) -> np.ndarray:
    x = np.nan_to_num(x, nan=0.0, posinf=8.0, neginf=-8.0)
    logits = np.clip(np.sum(np.c_[np.ones(x.shape[0]), x] * weights, axis=1), -35.0, 35.0)
    return 1.0 / (1.0 + np.exp(-logits))


def bounded(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def baseline_probability(row: dict[str, Any]) -> float:
    elo_probability = bounded(safe_float(row.get("elo_prob_team1"), 0.5), 1e-6, 1.0 - 1e-6)
    elo_logit = math.log(elo_probability / (1.0 - elo_probability))
    return bounded(
        sigmoid(
            elo_logit
            + 0.009 * bounded(safe_float(row.get("vrs_rank_advantage")), -40, 40)
            + 0.00035 * bounded(safe_float(row.get("vrs_points_diff")), -650, 650)
            + 0.3 * bounded(safe_float(row.get("recent_win_rate_10_diff")), -0.5, 0.5)
        ),
        0.08,
        0.92,
    )


def row_is_eligible(row: dict[str, Any]) -> bool:
    return row.get("model_tier") in ELIGIBLE_TIERS and row.get("integrity_risk") in ELIGIBLE_RISKS


def prepare_seed(source_path: Path, seed_path: Path) -> int:
    with source_path.open("r", encoding="utf-8", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row_is_eligible(row)]
    rows.sort(key=lambda row: (safe_int(row.get("match_timestamp"), 0) or 0, str(row.get("match_id") or "")))
    seed_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(seed_path, "wt", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=SEED_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def load_seed(path: Path) -> list[dict[str, Any]]:
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def load_online_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def write_online_rows(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows)
    path.write_text(body, encoding="utf-8")


def phase_features(item: dict[str, Any]) -> tuple[int, int, int]:
    stage = str(item.get("stage_name") or item.get("round_name") or "").casefold()
    is_playoff = int(any(token in stage for token in ("playoff", "round of", "quarter", "semi", "final")))
    is_elimination = int(any(token in stage for token in ("lower", "elimination", "decider", "final")))
    phase_order = (
        100 if "grand final" in stage
        else 95 if "final" in stage
        else 85 if "semi" in stage
        else 75 if "quarter" in stage
        else 65 if "round of 16" in stage
        else 55 if "round of 32" in stage
        else 50 if "playoff" in stage
        else 25 if "swiss" in stage
        else 20 if "group" in stage
        else 1
    )
    return phase_order, is_playoff, is_elimination


def live_product_tier(item: dict[str, Any]) -> str | None:
    declared = str(item.get("product_tier") or item.get("tier") or "").casefold()
    event_name = str(item.get("event_name") or item.get("name") or "")
    if declared in {"tier_1", "tier 1", "major", "s-tier", "a-tier"}:
        return "T1"
    if declared in {"tier_2", "tier 2", "b-tier"}:
        return "T2"
    if any(token in event_name.casefold() for token in ("cct", "roman imperium", "esl challenger", "thunderpick world championship")):
        return "T2"
    if any(token in event_name.casefold() for token in ("major", "iem", "blast", "esl pro league", "pgl masters", "esports world cup", "fissure playground")):
        return "T1"
    return None


def append_live_training_rows(
    live_path: Path | None,
    predictions_path: Path,
    existing_rows: list[dict[str, Any]],
) -> int:
    if not live_path or not live_path.exists() or not predictions_path.exists():
        return 0
    live = json.loads(live_path.read_text(encoding="utf-8"))
    product = json.loads(predictions_path.read_text(encoding="utf-8"))
    state_rows = product.get("model_state", {}).get("teams", [])
    state = {str(row.get("team_name") or row.get("team_key") or "").casefold(): dict(row) for row in state_rows}
    existing_ids = {str(row.get("match_id")) for row in existing_rows}
    appended = 0

    def team_state(name: str) -> dict[str, Any]:
        key = name.casefold()
        if key not in state:
            state[key] = {"team_name": name, "elo": 1500.0, "vrs_rank": None, "vrs_points": 0, "recent_win_rate_10": 0.5}
        return state[key]

    matches = sorted(live.get("matches") or [], key=lambda item: str(item.get("starts_at") or ""))
    for item in matches:
        match_id = str(item.get("match_id") or item.get("id") or "")
        score1 = safe_int(item.get("score1"), None)
        score2 = safe_int(item.get("score2"), None)
        team1_name = str(item.get("team1_name") or "")
        team2_name = str(item.get("team2_name") or "")
        tier = live_product_tier(item)
        if not match_id or match_id in existing_ids or score1 is None or score2 is None or score1 == score2 or not team1_name or not team2_name or tier is None:
            continue
        team1 = team_state(team1_name)
        team2 = team_state(team2_name)
        elo1 = safe_float(team1.get("elo"), 1500.0)
        elo2 = safe_float(team2.get("elo"), 1500.0)
        elo_diff = elo1 - elo2
        elo_probability = 1.0 / (1.0 + 10.0 ** (-elo_diff / 400.0))
        rank1 = safe_int(team1.get("vrs_rank"), None)
        rank2 = safe_int(team2.get("vrs_rank"), None)
        phase_order, is_playoff, is_elimination = phase_features(item)
        starts_at = str(item.get("starts_at") or "")
        row = {
            "match_id": match_id,
            "match_date": starts_at[:10],
            "match_timestamp": int(datetime.fromisoformat(starts_at.replace("Z", "+00:00")).timestamp()) if starts_at else 0,
            "event_name": item.get("event_name") or "HLTV live result",
            "team1_name": team1_name,
            "team2_name": team2_name,
            "target_team1_win": int(score1 > score2),
            "model_tier": tier,
            "integrity_risk": "low",
            "elo_diff": elo_diff,
            "elo_prob_team1": elo_probability,
            "vrs_rank_advantage": bounded(rank2 - rank1, -40, 40) if rank1 and rank2 else 0,
            "vrs_points_diff": bounded(safe_float(team1.get("vrs_points")) - safe_float(team2.get("vrs_points")), -650, 650),
            "recent_win_rate_10_diff": bounded(safe_float(team1.get("recent_win_rate_10"), 0.5) - safe_float(team2.get("recent_win_rate_10"), 0.5), -0.5, 0.5),
            "best_of": safe_int(str(item.get("series_format") or "bo3").replace("bo", ""), 3) or 3,
            "phase_order": phase_order,
            "is_lan": int(str(item.get("event_type") or "").casefold() == "lan"),
            "is_playoff": is_playoff,
            "is_elimination_match": is_elimination,
        }
        existing_rows.append(row)
        existing_ids.add(match_id)
        actual1 = float(row["target_team1_win"])
        delta = 22.0 * min(1.35, 1.0 + 0.12 * abs(score1 - score2)) * (actual1 - elo_probability)
        team1["elo"] = elo1 + delta
        team2["elo"] = elo2 - delta
        for team, result in ((team1, actual1), (team2, 1.0 - actual1)):
            recent = safe_float(team.get("recent_win_rate_10"), 0.5)
            team["recent_win_rate_10"] = recent + (2.0 / 11.0) * (result - recent)
        appended += 1
    return appended


def matrix(rows: list[dict[str, Any]], features: list[str]) -> tuple[np.ndarray, np.ndarray]:
    def value(row: dict[str, Any], feature: str) -> float:
        if feature == "baseline_logit":
            probability = bounded(baseline_probability(row), 1e-6, 1.0 - 1e-6)
            return math.log(probability / (1.0 - probability))
        return safe_float(row.get(feature))

    x = np.array([[value(row, feature) for feature in features] for row in rows], dtype=float)
    y = np.array([safe_int(row.get("target_team1_win"), 0) or 0 for row in rows], dtype=float)
    return x, y


def calibration_error(y_true: list[int], probabilities: list[float]) -> float:
    rows = reliability_bins(y_true, probabilities, bins=10)
    total = sum(count for _, _, count in rows) or 1
    return sum(abs(predicted - empirical) * count for predicted, empirical, count in rows) / total


def summarize(y_true: list[int], probabilities: list[float]) -> dict[str, float]:
    return {
        "accuracy": round(accuracy_at_threshold(y_true, probabilities), 6),
        "log_loss": round(log_loss(y_true, probabilities), 6),
        "brier": round(brier_score(y_true, probabilities), 6),
        "ece": round(calibration_error(y_true, probabilities), 6),
    }


def candidate_configs() -> list[dict[str, Any]]:
    configs = []
    for features in (CALIBRATION_FEATURES, CORE_FEATURES, CONTEXT_FEATURES):
        for l2 in (0.005, 0.015, 0.04):
            for blend_weight in (0.5, 0.75, 1.0):
                configs.append({"family": "logistic", "features": features, "l2": l2, "blend_weight": blend_weight})
    if GradientBoostingClassifier is not None:
        for features in (CORE_FEATURES, CONTEXT_FEATURES):
            for n_estimators, max_depth, learning_rate in ((40, 1, 0.04), (60, 2, 0.035), (90, 2, 0.025)):
                for blend_weight in (0.5, 0.75, 1.0):
                    configs.append({
                        "family": "gradient_boosting",
                        "features": features,
                        "n_estimators": n_estimators,
                        "max_depth": max_depth,
                        "learning_rate": learning_rate,
                        "min_samples_leaf": 24,
                        "blend_weight": blend_weight,
                    })
    return configs


def evaluate_config(rows: list[dict[str, Any]], folds, config: dict[str, Any]) -> dict[str, Any]:
    y_all: list[int] = []
    probabilities: list[float] = []
    for fold in folds:
        train_rows = [rows[index] for index in fold.train_indices]
        test_rows = [rows[index] for index in fold.test_indices]
        x_train, y_train = matrix(train_rows, config["features"])
        x_test, y_test = matrix(test_rows, config["features"])
        if config["family"] == "gradient_boosting":
            model = GradientBoostingClassifier(
                n_estimators=int(config["n_estimators"]),
                learning_rate=float(config["learning_rate"]),
                max_depth=int(config["max_depth"]),
                min_samples_leaf=int(config["min_samples_leaf"]),
                subsample=0.9,
                random_state=42,
            )
            model.fit(x_train, y_train)
            model_probabilities = model.predict_proba(x_test)[:, 1]
        else:
            mean = x_train.mean(axis=0)
            std = x_train.std(axis=0)
            std[std < 1e-8] = 1.0
            x_train_scaled = np.clip((x_train - mean) / std, -8.0, 8.0)
            x_test_scaled = np.clip((x_test - mean) / std, -8.0, 8.0)
            weights = fit_stable_logistic(x_train_scaled, y_train, l2=float(config["l2"]), epochs=1600)
            model_probabilities = predict_stable_logistic(weights, x_test_scaled)
        baseline = np.array([baseline_probability(row) for row in test_rows])
        blended = float(config["blend_weight"]) * model_probabilities + (1.0 - float(config["blend_weight"])) * baseline
        y_all.extend(int(value) for value in y_test.tolist())
        probabilities.extend(float(bounded(value, 0.08, 0.92)) for value in blended.tolist())
    return {**config, "rows": len(y_all), "folds": len(folds), "metrics": summarize(y_all, probabilities)}


def evaluate_baseline(rows: list[dict[str, Any]], folds) -> dict[str, Any]:
    test_rows = [rows[index] for fold in folds for index in fold.test_indices]
    y_true = [safe_int(row.get("target_team1_win"), 0) or 0 for row in test_rows]
    probabilities = [baseline_probability(row) for row in test_rows]
    return {"kind": "heuristic", "rows": len(rows), "test_rows": len(test_rows), "folds": len(folds), "metrics": summarize(y_true, probabilities)}


def fit_artifact(rows: list[dict[str, Any]], config: dict[str, Any], metrics: dict[str, Any]) -> dict[str, Any]:
    x, y = matrix(rows, config["features"])
    common = {
        "version": f"portable-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "features": list(config["features"]),
        "blend_weight": float(config["blend_weight"]),
        "metrics": metrics,
        "training_rows": len(rows),
        "trained_through": max(str(row.get("match_date") or "") for row in rows),
        "tier_policy": "T1 + T1.5 + verified T2; low/medium integrity risk",
    }
    if config["family"] == "gradient_boosting":
        model = GradientBoostingClassifier(
            n_estimators=int(config["n_estimators"]),
            learning_rate=float(config["learning_rate"]),
            max_depth=int(config["max_depth"]),
            min_samples_leaf=int(config["min_samples_leaf"]),
            subsample=0.9,
            random_state=42,
        )
        model.fit(x, y)
        prior = np.asarray(model.init_.class_prior_, dtype=float)
        initial_log_odds = math.log(max(prior[1], 1e-8) / max(prior[0], 1e-8))
        trees = []
        for estimator in model.estimators_[:, 0]:
            tree = estimator.tree_
            trees.append({
                "children_left": [int(value) for value in tree.children_left],
                "children_right": [int(value) for value in tree.children_right],
                "feature": [int(value) for value in tree.feature],
                "threshold": [round(float(value), 8) for value in tree.threshold],
                "value": [round(float(value), 8) for value in tree.value[:, 0, 0]],
            })
        return {
            **common,
            "kind": "portable_gbdt_blend",
            "learning_rate": float(config["learning_rate"]),
            "initial_log_odds": round(initial_log_odds, 8),
            "trees": trees,
            "n_estimators": int(config["n_estimators"]),
            "max_depth": int(config["max_depth"]),
            "min_samples_leaf": int(config["min_samples_leaf"]),
        }
    mean = x.mean(axis=0)
    std = x.std(axis=0)
    std[std < 1e-8] = 1.0
    weights = fit_stable_logistic(np.clip((x - mean) / std, -8.0, 8.0), y, l2=float(config["l2"]), epochs=1800)
    return {
        **common,
        "kind": "portable_logistic_blend",
        "mean": [round(float(value), 8) for value in mean],
        "std": [round(float(value), 8) for value in std],
        "weights": [round(float(value), 8) for value in weights],
        "l2": float(config["l2"]),
    }


def promotion_passes(candidate: dict[str, Any], comparison: dict[str, Any]) -> bool:
    challenger = candidate["metrics"]
    champion = comparison["metrics"]
    return (
        candidate["rows"] >= 350
        and candidate["folds"] >= 3
        and challenger["log_loss"] <= champion["log_loss"] - 0.002
        and challenger["brier"] <= champion["brier"] + 0.001
        and challenger["accuracy"] >= champion["accuracy"] - 0.005
        and challenger["ece"] <= champion["ece"] + 0.015
    )


def run(args) -> dict[str, Any]:
    if args.prepare_seed:
        rows = prepare_seed(Path(args.source_csv), Path(args.training_seed))
        return {"prepared_seed": str(args.training_seed), "rows": rows}

    seed_rows = load_seed(Path(args.training_seed))
    online_rows = load_online_rows(Path(args.online_rows))
    appended = append_live_training_rows(Path(args.live_feed) if args.live_feed else None, Path(args.predictions), online_rows)
    if appended:
        write_online_rows(Path(args.online_rows), online_rows)
    rows = sorted([*seed_rows, *online_rows], key=lambda row: (safe_int(row.get("match_timestamp"), 0) or 0, str(row.get("match_id") or "")))
    timestamps = [datetime.fromtimestamp(safe_int(row.get("match_timestamp"), 0) or 0, tz=timezone.utc) for row in rows]
    folds = make_purged_time_folds(timestamps, n_splits=5, purge_days=7, min_train_size=220)
    baseline = evaluate_baseline(rows, folds)
    candidates = [evaluate_config(rows, folds, config) for config in candidate_configs()]
    challenger = min(candidates, key=lambda row: (row["metrics"]["log_loss"], row["metrics"]["brier"], -row["metrics"]["accuracy"]))

    registry_path = Path(args.registry)
    registry = json.loads(registry_path.read_text(encoding="utf-8")) if registry_path.exists() else {"history": []}
    previous = registry.get("champion")
    comparison = baseline
    if previous and previous.get("kind") in {"portable_logistic_blend", "portable_gbdt_blend"}:
        previous_config = {
            "family": "gradient_boosting" if previous["kind"] == "portable_gbdt_blend" else "logistic",
            "features": previous["features"],
            "blend_weight": previous["blend_weight"],
        }
        if previous_config["family"] == "gradient_boosting":
            previous_config.update({key: previous[key] for key in ("n_estimators", "max_depth", "learning_rate", "min_samples_leaf")})
        else:
            previous_config["l2"] = previous["l2"]
        comparison = evaluate_config(rows, folds, previous_config)
    promoted = promotion_passes(challenger, comparison)
    if previous is None and not promotion_passes(challenger, baseline):
        promoted = False
    champion = fit_artifact(rows, challenger, challenger["metrics"]) if promoted else previous
    if champion is None:
        champion = {**baseline, "version": "bounded-elo-vrs-v1", "trained_through": max(str(row.get("match_date") or "") for row in rows)}

    registry.update({
        "contract_version": "1.0",
        "generated_at_utc": utc_now(),
        "champion": champion,
        "challenger": {**challenger, "promotion_passed": promoted},
        "baseline": baseline,
        "promotion_gates": {
            "minimum_test_rows": 350,
            "minimum_folds": 3,
            "minimum_log_loss_improvement": 0.002,
            "maximum_brier_regression": 0.001,
            "maximum_accuracy_regression": 0.005,
            "maximum_ece_regression": 0.015,
        },
        "training": {"seed_rows": len(seed_rows), "online_rows": len(online_rows), "new_rows": appended},
    })
    if promoted:
        registry.setdefault("history", []).append({"promoted_at_utc": registry["generated_at_utc"], "champion": champion})
        registry["history"] = registry["history"][-12:]
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(json.dumps(registry, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {
        "registry": str(registry_path),
        "promoted": promoted,
        "champion": champion.get("version"),
        "challenger_metrics": challenger["metrics"],
        "baseline_metrics": baseline["metrics"],
        "rows": len(rows),
        "folds": len(folds),
        "new_online_rows": appended,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and safely promote the portable production probability model.")
    parser.add_argument("--prepare-seed", action="store_true")
    parser.add_argument("--source-csv", default="work/data/model/training_matches.csv")
    parser.add_argument("--training-seed", default=str(DEFAULT_SEED_PATH))
    parser.add_argument("--online-rows", default=str(DEFAULT_ONLINE_PATH))
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY_PATH))
    parser.add_argument("--predictions", default=str(DEFAULT_PREDICTIONS_PATH))
    parser.add_argument("--live-feed", default=None)
    args = parser.parse_args()
    print(json.dumps(run(args), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
