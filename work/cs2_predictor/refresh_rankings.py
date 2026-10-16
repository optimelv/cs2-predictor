"""Refresh published standings and future model inputs from Valve's dated release."""
from __future__ import annotations

import json
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .collectors import ValveCollector
from .export_site_predictions import normalize_team_name, team_lookup
from .http import RateLimitedHttpClient


class ValveHttpClient(RateLimitedHttpClient):
    def get_text(self, url: str, *, bucket="default", min_interval_seconds=0.0, timeout=30, headers=None) -> str:
        self._sleep_for_bucket(bucket, min_interval_seconds)
        # curl handles the host's HTTPS transport consistently in local and CI runs.
        return subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location",
                               "--connect-timeout", "10", "--max-time", str(timeout),
                               "--user-agent", self.user_agent, url],
                              check=True, capture_output=True, text=True).stdout


def apply_rankings(payload: dict, rows: list[dict], source_url: str, checked_at: str) -> dict:
    as_of = rows[0]["ranking_date"] if rows else ""
    if (len(rows) < 30
            or [row["rank"] for row in rows] != list(range(1, len(rows) + 1))
            or any(row["points"] <= 0 or row["ranking_date"] != as_of or not row["team_name"] or not row["roster_names"] for row in rows)
            or not as_of or as_of > checked_at[:10]):
        raise ValueError("Invalid or incomplete Valve global standings; preserving the last release")
    previous_date = payload.get("coverage", {}).get("vrs", {}).get("as_of", "")
    if as_of < previous_date:
        raise ValueError("Refusing to replace newer standings with an older release")
    standings = {
        "source": "Valve Regional Standings", "source_url": source_url,
        "as_of": as_of, "checked_at_utc": checked_at, "scope": "global",
        "status": "official_snapshot",
        "method_note": "Official ranks and points at the source date. Form indicators are separate model estimates.",
        "teams": [{"rank": row["rank"], "points": row["points"], "team_name": row["team_name"],
                   "players": row["roster_names"].split(", ")} for row in rows[:30]],
    }
    payload.setdefault("coverage", {})["vrs"] = standings
    # Historical training observations keep their original pre-match features.
    state = payload.setdefault("model_state", {})
    counts = Counter(normalize_team_name(row["team_name"]) for row in rows)
    # Valve ranks lineups: an ambiguous organization must not inherit an arbitrary roster's points.
    by_name = team_lookup({"teams": [row for row in rows if counts[normalize_team_name(row["team_name"])] == 1]})
    for team in state.get("teams", []):
        ranking = by_name.get(normalize_team_name(team["team_name"]))
        team.update(vrs_rank=ranking["rank"] if ranking else None,
                    vrs_points=ranking["points"] if ranking else 0, ranking_date=as_of)
    state["vrs_as_of"] = as_of
    state["vrs_source_url"] = source_url
    return standings


def main() -> None:
    now = datetime.now(timezone.utc)
    collector = ValveCollector(ValveHttpClient("StrikeSignal/1.0 (public Valve standings)"))
    files = collector.list_standing_files([now.year - 1, now.year])
    latest = max((file for file in files if file.region == "global" and file.ranking_date <= now.date()),
                 key=lambda file: file.ranking_date)
    markdown = collector.fetch_standing_markdown(latest, Path("work/data/raw/valve"))
    rows = collector.parse_standing_markdown(markdown, latest)
    predictions_path = Path("docs/data/predictions.json")
    payload = json.loads(predictions_path.read_text())
    standings = apply_rankings(payload, rows,
        f"https://github.com/ValveSoftware/counter-strike_regional_standings/blob/main/{latest.path}",
        now.isoformat(timespec="seconds").replace("+00:00", "Z"))
    coverage = json.loads(Path("docs/data/coverage.json").read_text())
    coverage["vrs"] = standings
    live_path = Path("docs/data/live-snapshot.json")
    if live_path.exists():
        live = json.loads(live_path.read_text())
        live["rankings"] = standings
        live_path.write_text(json.dumps(live, indent=2) + "\n")
    for name, data, variable in [("predictions", payload, "DATA"), ("coverage", coverage, "COVERAGE")]:
        Path(f"docs/data/{name}.json").write_text(json.dumps(data, indent=2) + "\n")
        Path(f"docs/data/{name}.js").write_text(f"window.__STRIKESIGNAL_{variable}__ = {json.dumps(data)};\n")
    print(json.dumps({"rankings_as_of": standings["as_of"], "source_rows": len(rows), "public_rows": 30}))


if __name__ == "__main__":
    main()
