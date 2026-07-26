from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from .export_site_predictions import active_map_pool, map_profiles_snapshot, veto_profiles_snapshot


def write_payload(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    path.with_suffix(".js").write_text(
        "window.__STRIKESIGNAL_DATA__ = " + json.dumps(payload, indent=2, sort_keys=True) + ";\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh map and veto strategy profiles without rebuilding the full site payload.")
    parser.add_argument("--db-path", default="work/data/cs2_predictor.sqlite3")
    parser.add_argument("--predictions", default="docs/data/predictions.json")
    args = parser.parse_args()

    predictions_path = Path(args.predictions)
    payload = json.loads(predictions_path.read_text(encoding="utf-8"))
    connection = sqlite3.connect(args.db_path)
    connection.row_factory = sqlite3.Row
    pool = active_map_pool(connection)
    model_state = payload.setdefault("model_state", {})
    model_state["map_pool"] = pool
    model_state["map_profiles"] = map_profiles_snapshot(connection)
    model_state["veto_profiles"] = veto_profiles_snapshot(connection, pool)
    write_payload(predictions_path, payload)
    print(json.dumps({
        "map_profiles": len(model_state["map_profiles"]),
        "veto_profiles": len(model_state["veto_profiles"]),
        "map_pool": pool,
    }, indent=2))


if __name__ == "__main__":
    main()
