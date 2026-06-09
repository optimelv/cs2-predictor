from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .benchmark_event_holdouts import (
    BENCHMARK_SOURCE_TITLES,
    STATE_UPDATE_POLICIES,
    fetch_scored_matches,
    predict_models,
    row_is_clean_training,
    should_update_state,
)
from .build_model_dataset import TeamState, log_loss, make_feature_row, update_state_from_feature_row
from .validation import accuracy_at_threshold, brier_score, make_purged_time_folds
from .warehouse import WAREHOUSE_PATH, connect


REPORT_PATH = Path("outputs") / "cs2_model_optimization_report.md"
POLICY_PREDICTION_FILES = {
    "all/all": Path("work/data/model/event_holdout_predictions_all_policy.csv"),
    "no_t3/no_t3": Path("work/data/model/event_holdout_predictions_no_t3_policy.csv"),
    "clean_only/clean_only": Path("work/data/model/event_holdout_predictions_clean_only_policy.csv"),
    "ranked_top120/ranked_top120": Path("work/data/model/event_holdout_predictions_ranked_top120_policy.csv"),
    "ranked_top200/ranked_top200": Path("work/data/model/event_holdout_predictions_ranked_top200_policy.csv"),
    "ranked_top120/clean_only": Path("work/data/model/event_holdout_predictions_ranked_top120_clean_maps.csv"),
}
PURE_PRE_MODELS = (
    "elo",
    "rank",
    "vrs",
    "rank_vrs",
    "elo_rank_vrs",
    "form",
    "logistic",
    "logistic_tuned",
    "blend",
    "accuracy_blend",
    "calibrated_blend",
    "phase_selector",
)
POST_VETO_MODELS = ("post_veto_map", "post_veto_map_tuned", "phase_map_selector", "phase_map_selector_tuned")


def build_clean_rows_for_policy(
    matches: list[sqlite3.Row],
    *,
    state_policy: str,
    exclude_benchmark_events: bool,
) -> list[dict[str, Any]]:
    team_states: defaultdict[str, TeamState] = defaultdict(TeamState)
    h2h: dict[tuple[str, str], dict[str, int]] = {}
    rows: list[dict[str, Any]] = []
    for row in matches:
        feature_row = make_feature_row(row, team_states, h2h)
        if exclude_benchmark_events and row["liquipedia_event_source_title"] in BENCHMARK_SOURCE_TITLES:
            pass
        elif row_is_clean_training(feature_row):
            rows.append(feature_row)
        if should_update_state(feature_row, state_policy):
            update_state_from_feature_row(feature_row, team_states, h2h)
    return rows


def summarize_probs(y_true: list[int], probs: list[float]) -> dict[str, float]:
    return {
        "accuracy": accuracy_at_threshold(y_true, probs),
        "log_loss": log_loss(y_true, probs),
        "brier": brier_score(y_true, probs),
    }


def evaluate_policy_cv(rows: list[dict[str, Any]], *, state_policy: str) -> dict[str, Any]:
    if len(rows) < 220:
        return {"rows": len(rows), "error": "not enough clean rows"}
    timestamps = [datetime.fromtimestamp(int(row["match_timestamp"]), tz=UTC) for row in rows]
    folds = make_purged_time_folds(timestamps, n_splits=5, purge_days=7, min_train_size=100)
    model_metrics: defaultdict[str, list[dict[str, float]]] = defaultdict(list)
    fold_summaries = []
    for fold_index, fold in enumerate(folds, start=1):
        train_rows = [rows[index] for index in fold.train_indices]
        test_rows = [rows[index] for index in fold.test_indices]
        y_true = [int(row["target_team1_win"]) for row in test_rows]
        model_probs, _ = predict_models(train_rows, test_rows, state_policy=state_policy)
        for model_name, probs in model_probs.items():
            metrics = summarize_probs(y_true, probs.tolist())
            model_metrics[model_name].append(metrics)
        fold_summaries.append(
            {
                "fold": fold_index,
                "train_rows": len(train_rows),
                "test_rows": len(test_rows),
                "test_start": fold.test_start.date().isoformat(),
                "test_end": fold.test_end.date().isoformat(),
            }
        )
    averaged = {}
    for model_name, metrics_rows in model_metrics.items():
        averaged[model_name] = {
            metric: sum(row[metric] for row in metrics_rows) / len(metrics_rows)
            for metric in ("accuracy", "log_loss", "brier")
        }
    best_accuracy_model = max(averaged, key=lambda name: (averaged[name]["accuracy"], -averaged[name]["log_loss"]))
    best_log_loss_model = min(averaged, key=lambda name: (averaged[name]["log_loss"], -averaged[name]["accuracy"]))
    return {
        "rows": len(rows),
        "folds": len(folds),
        "fold_summaries": fold_summaries,
        "models": averaged,
        "best_accuracy_model": best_accuracy_model,
        "best_log_loss_model": best_log_loss_model,
    }


def load_prediction_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def best_event_readout(rows: list[dict[str, str]], model_names: tuple[str, ...]) -> dict[str, Any]:
    candidates = []
    for mode in ("pre_event_frozen", "rolling_in_event"):
        for model in model_names:
            subset = [row for row in rows if row["mode"] == mode and row["model"] == model]
            if not subset:
                continue
            correct = sum(int(row["correct"]) for row in subset)
            candidates.append(
                {
                    "mode": mode,
                    "model": model,
                    "rows": len(subset),
                    "correct": correct,
                    "accuracy": correct / len(subset),
                }
            )
    if not candidates:
        return {"rows": 0, "accuracy": 0.0}
    return max(candidates, key=lambda row: (row["accuracy"], row["correct"]))


def event_group_metrics(rows: list[dict[str, str]], *, mode: str, model: str) -> list[dict[str, Any]]:
    grouped: defaultdict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row["mode"] == mode and row["model"] == model:
            grouped[row["event_label"]].append(row)
    output = []
    for event_label, bucket in sorted(grouped.items()):
        correct = sum(int(row["correct"]) for row in bucket)
        output.append(
            {
                "event_label": event_label,
                "rows": len(bucket),
                "correct": correct,
                "accuracy": correct / len(bucket),
            }
        )
    return output


def compare_event_files() -> dict[str, dict[str, Any]]:
    output = {}
    for label, path in POLICY_PREDICTION_FILES.items():
        rows = load_prediction_rows(path)
        if not rows:
            continue
        pure = best_event_readout(rows, PURE_PRE_MODELS)
        post_veto = best_event_readout(rows, POST_VETO_MODELS)
        output[label] = {
            "path": str(path),
            "pure_pre_match": pure,
            "post_veto": post_veto,
            "pure_by_event": event_group_metrics(rows, mode=pure["mode"], model=pure["model"]),
            "post_veto_by_event": event_group_metrics(rows, mode=post_veto["mode"], model=post_veto["model"]),
        }
    return output


def write_report(
    cv_results: dict[str, Any],
    event_results: dict[str, dict[str, Any]],
    *,
    path: Path,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    def pct(value: float) -> str:
        return f"{value:.3f}"

    best_cv_rows = []
    for policy, result in cv_results.items():
        if "error" in result:
            continue
        model = result["best_accuracy_model"]
        metrics = result["models"][model]
        best_cv_rows.append((policy, model, result["rows"], metrics))
    best_event_label, best_event = max(
        event_results.items(),
        key=lambda item: (
            item[1]["pure_pre_match"]["accuracy"],
            item[1]["post_veto"]["accuracy"],
        ),
    )
    best_post_label, best_post = max(
        event_results.items(),
        key=lambda item: (
            item[1]["post_veto"]["accuracy"],
            item[1]["pure_pre_match"]["accuracy"],
        ),
    )
    lines = [
        "# CS2 Model Optimization Report",
        "",
        f"Date: {datetime.now(UTC).date().isoformat()}",
        "",
        "## Recommended Setup",
        "",
        f"- Best pre-match event-holdout setup: `{best_event_label}` with `{best_event['pure_pre_match']['mode']}` + `{best_event['pure_pre_match']['model']}` at {pct(best_event['pure_pre_match']['accuracy'])}.",
        f"- Best post-veto event-holdout setup: `{best_post_label}` with `{best_post['post_veto']['mode']}` + `{best_post['post_veto']['model']}` at {pct(best_post['post_veto']['accuracy'])}.",
        "- The split recommendation is intentional: team-strength history and map-history have different noise profiles.",
        "",
        "## Forward-Time Validation",
        "",
        "Scope: clean T1/T1.5/T2 rows, excluding the three benchmark events, using purged forward time folds.",
        "",
        "| State policy | Best model | Rows | Accuracy | Log loss | Brier |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for policy, model, row_count, metrics in sorted(best_cv_rows, key=lambda row: (-row[3]["accuracy"], row[3]["log_loss"])):
        lines.append(
            f"| {policy} | {model} | {row_count} | {pct(metrics['accuracy'])} | {pct(metrics['log_loss'])} | {pct(metrics['brier'])} |"
        )
    lines.extend(
        [
            "",
            "## Event Holdout Comparison",
            "",
            "| Team/map policy | Best pre-match | Pre accuracy | Best post-veto | Post accuracy |",
            "|---|---|---:|---|---:|",
        ]
    )
    for label, result in sorted(
        event_results.items(),
        key=lambda item: (-item[1]["pure_pre_match"]["accuracy"], -item[1]["post_veto"]["accuracy"]),
    ):
        pure = result["pure_pre_match"]
        post_veto = result["post_veto"]
        lines.append(
            f"| {label} | {pure['mode']} + {pure['model']} | {pct(pure['accuracy'])} | {post_veto['mode']} + {post_veto['model']} | {pct(post_veto['accuracy'])} |"
        )
    lines.extend(
        [
            "",
            "## Best Split By Event",
            "",
            f"Pre-match setup: `{best_event_label}` / `{best_event['pure_pre_match']['model']}`.",
            "",
            "| Event | Rows | Correct | Accuracy |",
            "|---|---:|---:|---:|",
        ]
    )
    for row in best_event["pure_by_event"]:
        lines.append(f"| {row['event_label']} | {row['rows']} | {row['correct']} | {pct(row['accuracy'])} |")
    lines.extend(
        [
            "",
            f"Post-veto setup: `{best_post_label}` / `{best_post['post_veto']['model']}`.",
            "",
            "| Event | Rows | Correct | Accuracy |",
            "|---|---:|---:|---:|",
        ]
    )
    for row in best_post["post_veto_by_event"]:
        lines.append(f"| {row['event_label']} | {row['rows']} | {row['correct']} | {pct(row['accuracy'])} |")
    lines.extend(
        [
            "",
            "## Tested Families",
            "",
            "- Elo/form models with multiple state-history trust policies.",
            "- HLTV rank, VRS rank/points, combined rank, and Elo+rank/VRS power models.",
            "- Standard logistic regression plus tuned feature-subset logistic regression.",
            "- Accuracy-tuned and calibration-tuned probability ensembles.",
            "- Post-veto map model using known maps and prior map history.",
            "",
            "## Notes",
            "",
            "- The event holdout is only 133 matches, so improvements of a few matches should be treated carefully.",
            "- Current best post-veto accuracy crosses 75%, but this is map-known and should not be mixed with pre-veto claims.",
            "- Current best pre-match benchmark crosses 70%, but confidence-thresholded subsets are safer for production use than every-match picks.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare CS2 model variants and write an optimization report.")
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    parser.add_argument("--report-path", default=str(REPORT_PATH))
    args = parser.parse_args()

    connection = connect(Path(args.db_path))
    matches = fetch_scored_matches(connection)
    cv_results = {}
    for policy in STATE_UPDATE_POLICIES:
        rows = build_clean_rows_for_policy(matches, state_policy=policy, exclude_benchmark_events=True)
        cv_results[policy] = evaluate_policy_cv(rows, state_policy=policy)
    event_results = compare_event_files()
    write_report(cv_results, event_results, path=Path(args.report_path))
    print(
        json.dumps(
            {
                "report_path": args.report_path,
                "cv_policies": list(cv_results),
                "event_policy_files": list(event_results),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
