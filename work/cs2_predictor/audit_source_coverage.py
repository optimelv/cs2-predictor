"""Report observed coverage and chronology gaps without assuming completeness."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
from collections import Counter
from datetime import date, timedelta
from pathlib import Path


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()] if path.exists() else []


def read_seed(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def span(rows: list[dict], key: str) -> dict:
    dates = sorted(str(row.get(key) or "")[:10] for row in rows if row.get(key))
    return {"rows": len(rows), "first": dates[0] if dates else None, "last": dates[-1] if dates else None, "distinct_days": len(set(dates))}


def audit(seed_path: Path, online_path: Path, history_path: Path, liquipedia_path: Path, hltv_path: Path, *, since: str, until: str, full_csv_path: Path | None = None) -> dict:
    seed = read_seed(seed_path)
    online = read_jsonl(online_path)
    history = json.loads(history_path.read_text(encoding="utf-8")).get("matches", [])
    liquipedia = read_jsonl(liquipedia_path)
    hltv = read_jsonl(hltv_path)
    start, end = date.fromisoformat(since), date.fromisoformat(until)
    days = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
    known = {str(row.get("starts_at") or "")[:10] for row in liquipedia + hltv if row.get("starts_at")}
    source_days_missing = [day for day in days if day not in known]
    report = {
        "training_seed": span(seed, "match_date"),
        "online_training": span(online, "match_date"),
        "public_history": span(history, "match_date"),
        "liquipedia_observations": span(liquipedia, "starts_at"),
        "hltv_observations": span(hltv, "starts_at"),
        "training_seed_tiers": dict(Counter(row.get("model_tier") for row in seed)),
        "liquipedia_source_tiers": dict(Counter(row.get("source_tier") for row in liquipedia)),
        "recovery_window": {"start": since, "end": until, "calendar_days": len(days), "days_without_observed_result": source_days_missing, "days_with_observed_result": len(days) - len(source_days_missing)},
        "interpretation": "Observed source coverage is a lower bound. A day without a result may have no match or an uncollected match. Date-only public history is not automatically eligible for chronological model training.",
    }
    if full_csv_path and full_csv_path.exists():
        with full_csv_path.open(encoding="utf-8", newline="") as handle:
            full = list(csv.DictReader(handle))
        report["legacy_full_dataset"] = span(full, "match_date")
        report["legacy_full_tiers"] = dict(Counter(row.get("model_tier") for row in full))
        report["legacy_full_integrity_risks"] = dict(Counter(row.get("integrity_risk") for row in full))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=Path, default=Path("models/portable-training-seed.csv.gz"))
    parser.add_argument("--online", type=Path, default=Path("models/portable-online-training.jsonl"))
    parser.add_argument("--history", type=Path, default=Path("docs/data/history.json"))
    parser.add_argument("--liquipedia", type=Path, default=Path("models/liquipedia-observed-results.jsonl"))
    parser.add_argument("--hltv", type=Path, default=Path("models/observed-hltv-results.jsonl"))
    parser.add_argument("--since", default="2026-06-09")
    parser.add_argument("--until", default="2026-09-19")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--full-csv", type=Path)
    args = parser.parse_args()
    report = audit(args.seed, args.online, args.history, args.liquipedia, args.hltv, since=args.since, until=args.until, full_csv_path=args.full_csv)
    body = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(body, encoding="utf-8")
    print(body)


if __name__ == "__main__":
    main()
