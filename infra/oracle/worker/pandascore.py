"""PandaScore Fixtures REST feed; no paid statistics or image requests."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from aiohttp import ClientSession, ClientTimeout
from event_policy import product_tier

API = "https://api.pandascore.co/csgo"
# Provider IDs and names were checked against the authenticated team records.
TEAM_NAMES = {3272: "The MongolZ", 131505: "Aurora", 133458: "BetBoom", 3216: "NAVI", 130564: "Falcons", 3246: "HEROIC"}
STATUSES = {"not_started": "upcoming", "running": "live", "finished": "finished", "canceled": "cancelled", "postponed": "postponed"}


class PandaScoreAccessError(RuntimeError):
    def __init__(self, status: int, retry_after: str | None = None):
        self.retry_seconds = max(1800, min(86400, int(retry_after))) if str(retry_after or "").isdigit() else 3600
        super().__init__(f"PandaScore returned HTTP {status}; preserving the last verified snapshot")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def stamp(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if parsed.tzinfo else None
    except ValueError:
        return None


def score(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def event_name(row: dict) -> str:
    league, serie = row.get("league") or {}, row.get("serie") or {}
    return " ".join(part for part in (league.get("name"), serie.get("full_name") or serie.get("name")) if isinstance(part, str) and part.strip()).strip()


def tournament_tier(row: dict) -> str:
    tier = str(row.get("tier") or "").lower()
    if tier not in {"s", "a", "b"}:
        return "excluded"
    # Existing curation still excludes qualifiers and unreviewed Tier-2 families.
    return product_tier(event_name(row) + " " + str(row.get("name") or ""), "tier_1" if tier in {"s", "a"} else "tier_2")


def normalize_match(row: dict, tournaments: dict[int, dict]) -> dict | None:
    if not isinstance(row, dict) or not isinstance(row.get("id"), int):
        return None
    tournament = tournaments.get(row.get("tournament_id"))
    if not tournament or tournament_tier(tournament) not in {"tier_1", "tier_2"}:
        return None
    opponents = row.get("opponents") or []
    if len(opponents) != 2 or any(item.get("type") != "Team" or not isinstance(item.get("opponent"), dict) for item in opponents):
        return None
    teams = [item["opponent"] for item in opponents]
    if any(not isinstance(team.get("id"), int) or not team.get("name") for team in teams) or teams[0]["id"] == teams[1]["id"]:
        return None
    names = [TEAM_NAMES.get(team["id"], team["name"]) for team in teams]
    status = STATUSES.get(row.get("status"))
    if not status:
        return None
    results = {item.get("team_id"): score(item.get("score")) for item in row.get("results") or [] if isinstance(item, dict)}
    # Upcoming zeroes are counters, not a played 0:0 result.
    scores = [results.get(team["id"]) if status in {"finished", "live"} else None for team in teams]
    winner = names[[team["id"] for team in teams].index(row["winner_id"])] if status == "finished" and row.get("winner_id") in [team["id"] for team in teams] else None
    if status == "finished" and not winner and all(value is not None for value in scores) and scores[0] != scores[1]:
        winner = names[0 if scores[0] > scores[1] else 1]
    games = row.get("number_of_games")
    return {
        "match_id": f"pandascore:{row['id']}", "source_match_id": f"pandascore:{row['id']}",
        "source": "pandascore", "pandascore_match_id": row["id"],
        "event_id": f"pandascore:series:{tournament['serie_id']}", "event_name": event_name(tournament),
        "product_tier": tournament_tier(tournament), "publisher_tier": tournament.get("tier"),
        "team1_name": names[0], "team2_name": names[1],
        "team1_pandascore_id": teams[0]["id"], "team2_pandascore_id": teams[1]["id"],
        "provider_team1_name": teams[0]["name"], "provider_team2_name": teams[1]["name"],
        "starts_at": stamp(row.get("begin_at")) or stamp(row.get("scheduled_at")),
        "scheduled_at": stamp(row.get("scheduled_at")), "source_modified_at_utc": stamp(row.get("modified_at")),
        "status": status, "score1": scores[0], "score2": scores[1], "winner_name": winner,
        "series_format": f"bo{games}" if isinstance(games, int) and not isinstance(games, bool) and games in {1, 3, 5} else "unknown",
        "stage_name": str(tournament.get("name") or "Published schedule"),
        "round_name": str(row.get("name") or "").split(":", 1)[0],
        "forfeit": row.get("forfeit") is True, "maps": [], "lineups": {},
    }


def reconcile_ids(matches: list[dict], previous: list[dict]) -> None:
    """Keep source IDs and reuse a known fixture only on an unambiguous match."""
    compact = lambda value: re.sub(r"[^a-z0-9]", "", str(value).casefold())
    for match in matches:
        same_source = [old for old in previous if old.get("source_match_id") == match["source_match_id"]]
        candidates = same_source or [old for old in previous
            if compact(old.get("event_name")) == compact(match["event_name"])
            and [compact(old.get(key)) for key in ("team1_name", "team2_name")] == [compact(match[key]) for key in ("team1_name", "team2_name")]
            and old.get("series_format") == match["series_format"]
            and stamp(old.get("starts_at")) and match.get("scheduled_at")
            and abs((datetime.fromisoformat(stamp(old["starts_at"]).replace("Z", "+00:00")) - datetime.fromisoformat(match["scheduled_at"].replace("Z", "+00:00"))).total_seconds()) <= 300]
        if len(candidates) == 1:
            match["match_id"] = candidates[0]["match_id"]
            if candidates[0].get("slot_id"):
                match["slot_id"] = candidates[0]["slot_id"]


async def get_page(session, path: str, params: dict) -> list[dict]:
    async with session.get(f"{API}/{path}", params=params) as response:
        if response.status in {401, 403, 429}:
            raise PandaScoreAccessError(response.status, response.headers.get("Retry-After"))
        if response.status != 200:
            raise RuntimeError(f"PandaScore returned HTTP {response.status}")
        rows = await response.json()
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError("PandaScore returned an invalid list")
        return rows


async def get_all(session, path: str, params: dict) -> list[dict]:
    collected = []
    for page in range(1, 6):
        rows = await get_page(session, path, {**params, "page": page, "per_page": 100})
        collected.extend(rows)
        if len(rows) < 100:
            return collected
    raise RuntimeError(f"PandaScore {path} exceeds five pages; refusing incomplete coverage")


async def fetch_snapshot(token: str, previous: dict | None, started_utc: str, poll_seconds: int = 300, session_factory=ClientSession) -> dict:
    if not token:
        raise RuntimeError("PANDASCORE_TOKEN is missing")
    now = datetime.now(timezone.utc)
    floor = (now - timedelta(days=60)).isoformat()
    ceiling = (now + timedelta(days=60)).isoformat()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": "StrikeSignal/0.1"}
    async with session_factory(timeout=ClientTimeout(total=30), headers=headers) as session:
        catalog = await get_all(session, "tournaments", {"filter[tier]": "s,a,b", "range[begin_at]": f"{floor},{ceiling}", "sort": "-begin_at", "per_page": 100})
        eligible = {row["id"]: row for row in catalog if isinstance(row.get("id"), int) and isinstance(row.get("serie_id"), int) and tournament_tier(row) in {"tier_1", "tier_2"}}
        matches = []
        counts = {}
        if eligible:
            tournament_ids = ",".join(map(str, eligible))
            for kind in ("upcoming", "running", "past"):
                load = get_page if kind == "past" else get_all
                rows = await load(session, f"matches/{kind}", {"filter[tournament_id]": tournament_ids, "sort": "-begin_at" if kind == "past" else "begin_at", "per_page": 100})
                counts[kind] = len(rows)
                matches.extend(value for row in rows if (value := normalize_match(row, eligible)))
    reconcile_ids(matches, (previous or {}).get("matches") or [])
    matches = list({row["source_match_id"]: row for row in matches}.values())
    events = {}
    for tournament in eligible.values():
        serie = tournament.get("serie") or {}
        eid = f"pandascore:series:{tournament['serie_id']}"
        begin, end = stamp(serie.get("begin_at")), stamp(serie.get("end_at"))
        status = "finished" if serie.get("winner_id") else "upcoming" if begin and begin > utc_now() else "ongoing" if end and end >= utc_now() else "unknown"
        events.setdefault(eid, {"id": eid, "name": event_name(tournament), "source": "pandascore", "status": status, "product_tier": tournament_tier(tournament), "publisher_tier": tournament.get("tier"), "start_date": begin[:10] if begin else None, "end_date": end[:10] if end else None, "participants": [], "matches": [], "format": {"type": "mixed", "label": "Published schedule"}})
    for match in matches:
        event = events[match["event_id"]]
        event["participants"] = list(dict.fromkeys([*event["participants"], match["team1_name"], match["team2_name"]]))
        event["matches"].append(match)
    for event in events.values():
        rounds = {}
        for match in event["matches"]:
            title = match["stage_name"] + " · " + re.sub(r"\s+\d+$", "", match["round_name"])
            rid = re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-")
            current = rounds.setdefault(rid, {"id": rid, "name": title, "bracket": "main", "order": len(rounds) + 1, "matches": []})
            match["slot_id"] = match.get("slot_id") or f"{event['id']}:{match['source_match_id']}"
            current["matches"].append(match)
        if rounds:
            event["bracket"] = {"rounds": list(rounds.values())}
    return {"ok": True, "contract_version": "1.1", "fetched_at_utc": utc_now(), "poll_after_ms": max(300, poll_seconds) * 1000, "events": list(events.values()), "matches": matches, "players": [], "rankings": None, "source": "pandascore", "model_eligible_since_utc": started_utc, "source_health": {"provider": "pandascore", "tier_scope": ["s", "a", "b"], "counts": counts, "excluded_tournaments": len(catalog) - len(eligible), "access_error": None, "detail_coverage": "fixtures_only"}}
