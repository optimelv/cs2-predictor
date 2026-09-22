"""Pace one Liquipedia API batch per invocation into a separate evidence archive.

These observations are intentionally not model training rows. Liquipedia and
HLTV identities, tiers, and pre-match features need reconciliation first.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from .collect_liquipedia_team_history import fetch_team_history_batch, parse_team_history_html


DEFAULT_QUEUE = Path("models/liquipedia-gap-queue.json")
DEFAULT_STATE = Path("models/liquipedia-gap-state.json")
DEFAULT_ARCHIVE = Path("models/liquipedia-observed-results.jsonl")
DEFAULT_ASSETS = Path("docs/data/team-assets.json")
DEFAULT_ASSETS_JS = Path("docs/data/team-assets.js")


def make_queue(predictions_path: Path, limit: int = 120) -> list[str]:
    payload = json.loads(predictions_path.read_text(encoding="utf-8"))
    teams = payload.get("model_state", {}).get("teams", [])
    ordered = sorted(teams, key=lambda team: (team.get("vrs_rank") or 100000, -(team.get("matches") or 0), team.get("team_name") or ""))
    return list(dict.fromkeys(str(team.get("team_name") or "").strip() for team in ordered if team.get("team_name")))[:limit]


def observation(row: dict[str, str]) -> dict | None:
    score = re.fullmatch(r"\s*(\d+)\s*:\s*(\d+)\s*", row.get("score_text", ""))
    team = row.get("team_name", "").strip()
    opponent = row.get("opponent_name", "").strip()
    try:
        timestamp = int(row.get("match_timestamp", ""))
        starts_at = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    except (ValueError, TypeError, OverflowError, OSError):
        return None
    if not score or not team or not opponent or team.casefold() == opponent.casefold():
        return None
    scores = (int(score[1]), int(score[2]))
    if scores[0] == scores[1]:
        return None
    if team.casefold() > opponent.casefold():
        team, opponent = opponent, team
        scores = scores[::-1]
    event = row.get("tournament_name", "").strip()
    identity = "|".join((str(timestamp), team.casefold(), opponent.casefold(), event.casefold()))
    source_path = row.get("tournament_href", "")
    source_url = f"https://liquipedia.net{source_path}" if source_path.startswith("/counterstrike/") else None
    return {
        "observation_id": "liquipedia:" + hashlib.sha256(identity.encode()).hexdigest()[:20],
        "source": "Liquipedia MediaWiki API",
        "source_url": source_url,
        "starts_at": starts_at,
        "event_name": event,
        "source_tier": row.get("tier", ""),
        "team1_name": team,
        "team2_name": opponent,
        "score1": scores[0],
        "score2": scores[1],
        "winner_name": team if scores[0] > scores[1] else opponent,
        "source_match_type": row.get("match_type", ""),
    }


def merge_archive(path: Path, rows: list[dict[str, str]]) -> tuple[int, int]:
    existing = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                item = json.loads(line)
                existing[item["observation_id"]] = item
    added = conflicts = 0
    for row in rows:
        item = observation(row)
        if not item:
            continue
        prior = existing.get(item["observation_id"])
        if prior and (prior["score1"], prior["score2"]) != (item["score1"], item["score2"]):
            conflicts += 1
            continue
        if prior is None:
            existing[item["observation_id"]] = item
            added += 1
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n" for item in sorted(existing.values(), key=lambda item: (item["starts_at"], item["observation_id"])))
    path.write_text(body, encoding="utf-8")
    return added, conflicts


def update_assets(path: Path, js_path: Path, rows: list[dict[str, str]]) -> int:
    assets = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    added = 0
    for row in rows:
        for name_key, image_key in (("team_name", "team_logo_url"), ("opponent_name", "opponent_logo_url")):
            name = row.get(name_key, "").strip()
            image = row.get(image_key, "")
            key = re.sub(r"[^a-z0-9]+", " ", name.casefold()).strip()
            if not key or key in assets or not image.startswith("/commons/images/"):
                continue
            assets[key] = {"name": name, "logo_url": f"https://liquipedia.net{image}", "source": "Liquipedia"}
            added += 1
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    js_path.write_text("window.__STRIKESIGNAL_TEAM_ASSETS__ = " + json.dumps(assets, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    return added


def collect_once(queue_path: Path, state_path: Path, archive_path: Path, predictions_path: Path, *, since: str, until: str, batch_size: int = 5, assets_path: Path = DEFAULT_ASSETS, assets_js_path: Path = DEFAULT_ASSETS_JS) -> dict:
    if not queue_path.exists():
        queue_path.write_text(json.dumps(make_queue(predictions_path), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    queue = json.loads(queue_path.read_text(encoding="utf-8"))
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"next_index": 0}
    index = int(state["next_index"])
    if index >= len(queue):
        return {"complete": True, "teams_covered": len(queue)}
    teams = queue[index:index + batch_size]
    # The existing helper uses only the official MediaWiki API and saves raw
    # evidence in runner scratch space. One call per hourly workflow stays far
    # below Liquipedia's action=parse rate limit.
    slug, html = fetch_team_history_batch(teams, since=since, until=until, raw_root=Path("/tmp/strikesignal-liquipedia"), batch_index=index // batch_size + 1)
    rows = parse_team_history_html(html, batch_slug=slug, requested_teams=teams)
    if not rows:
        raise RuntimeError("Liquipedia returned no parseable rows; leaving the cursor unchanged")
    added, conflicts = merge_archive(archive_path, rows)
    logos = update_assets(assets_path, assets_js_path, rows)
    state_path.write_text(json.dumps({"next_index": index + len(teams), "last_success_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "window": [since, until]}, indent=2) + "\n", encoding="utf-8")
    return {"teams": teams, "rows": len(rows), "new_observations": added, "conflicts": conflicts, "new_logo_candidates": logos, "next_index": index + len(teams), "total_teams": len(queue)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since", default="2026-06-09")
    parser.add_argument("--until", default="2026-09-19")
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument("--predictions", type=Path, default=Path("docs/data/predictions.json"))
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--assets-js", type=Path, default=DEFAULT_ASSETS_JS)
    args = parser.parse_args()
    result = collect_once(args.queue, args.state, args.archive, args.predictions, since=args.since, until=args.until, assets_path=args.assets, assets_js_path=args.assets_js)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
