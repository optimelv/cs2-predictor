from __future__ import annotations

import asyncio
import argparse
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from aiohttp import ClientSession, ClientTimeout, web
from bs4 import BeautifulSoup


FLARESOLVERR_URL = os.environ.get("FLARESOLVERR_URL", "http://flaresolverr:8191/v1")
HLTV_MATCHES_URL = os.environ.get("HLTV_MATCHES_URL", "https://www.hltv.org/matches")
HLTV_RESULTS_URL = os.environ.get("HLTV_RESULTS_URL", "https://www.hltv.org/results")
POLL_SECONDS = max(180, int(os.environ.get("POLL_SECONDS", "300")))
REQUEST_TIMEOUT_SECONDS = int(os.environ.get("REQUEST_TIMEOUT_SECONDS", "90"))
MAX_DETAIL_MATCHES = max(0, min(8, int(os.environ.get("MAX_DETAIL_MATCHES", "6"))))
SNAPSHOT_PATH = Path(os.environ.get("SNAPSHOT_PATH", "/data/last-good-snapshot.json"))
SOURCE_LABEL = os.environ.get("SOURCE_LABEL", "HLTV via FlareSolverr")
TIER_TWO_EVENT_PATTERN = re.compile(r"\b(?:cct|roman imperium|esl challenger|thunderpick world championship)\b", re.I)
TIER_ONE_EVENT_PATTERN = re.compile(r"\b(?:major|iem|blast|esl pro league|pgl masters|esports world cup|fissure playground)\b", re.I)

state: dict[str, Any] = {
    "snapshot": None,
    "last_error": None,
    "last_attempt_utc": None,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-") or "unknown"


def product_tier(event_name: str, declared_tier: str = "") -> str:
    tier = declared_tier.strip().casefold()
    if tier in {"tier_1", "tier 1", "major", "s-tier", "s tier", "a-tier", "a tier"}:
        return "tier_1"
    if tier in {"tier_2", "tier 2", "b-tier", "b tier"}:
        return "tier_2"
    if re.fullmatch(r"(?:c-tier|c tier|tier[_ -]?3|d-tier|d tier)", tier):
        return "excluded"
    if TIER_TWO_EVENT_PATTERN.search(event_name):
        return "tier_2"
    if TIER_ONE_EVENT_PATTERN.search(event_name):
        return "tier_1"
    return "pending"


def text(node, selectors: tuple[str, ...]) -> str:
    for selector in selectors:
        found = node.select_one(selector)
        if found:
            value = found.get_text(" ", strip=True)
            if value:
                return value
    return ""


def starts_at(node) -> str | None:
    timed = node if node.get("data-unix") else node.select_one("[data-unix]")
    if not timed:
        return None
    try:
        raw = int(timed.get("data-unix", "0"))
        if raw > 10_000_000_000:
            raw //= 1000
        return datetime.fromtimestamp(raw, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OSError):
        return None


def clean_series_format(value: str) -> str:
    compact = re.sub(r"\s+", "", value.casefold())
    match = re.search(r"bo[1-9]", compact)
    return match.group(0) if match else "bo3"


def score_pair(value: str) -> tuple[int | None, int | None]:
    found = re.search(r"(\d+)\s*[-:]\s*(\d+)", value or "")
    return (int(found.group(1)), int(found.group(2))) if found else (None, None)


def event_reference(node, fallback_name: str) -> tuple[str, str | None]:
    link = node.select_one('a[href*="/events/"]')
    href = link.get("href", "") if link else ""
    event_match = re.search(r"/events/(\d+)/", href)
    event_id = f"hltv:{event_match.group(1)}" if event_match else f"hltv:{slugify(fallback_name)}"
    return event_id, f"https://www.hltv.org{href}" if href.startswith("/") else href or None


def parse_matches(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(".upcomingMatch, .liveMatch, a.match.a-reset")
    matches: list[dict[str, Any]] = []
    seen: set[str] = set()

    for card in cards:
        anchor = card if card.name == "a" else card.select_one('a[href*="/matches/"]')
        href = (anchor or card).get("href", "")
        id_match = re.search(r"/matches/(\d+)/", href)
        if not id_match or id_match.group(1) in seen:
            continue
        teams = [item.get_text(" ", strip=True) for item in card.select(".matchTeamName, .match-teamname")]
        teams = [team for team in teams if team]
        if len(teams) < 2 or teams[0] == teams[1]:
            continue
        seen.add(id_match.group(1))
        event_name = text(card, (".matchEventName", ".match-event-name", ".event-name")) or "HLTV schedule"
        event_id, event_url = event_reference(card, event_name)
        classes = " ".join(card.get("class", []))
        live = "live" in classes.casefold() or bool(card.select_one(".matchLive, .match-live"))
        series_format = clean_series_format(text(card, (".matchMeta", ".match-meta")) or "bo3")
        matches.append({
            "match_id": f"hltv:{id_match.group(1)}",
            "hltv_match_id": id_match.group(1),
            "source_url": f"https://www.hltv.org{href}",
            "event_id": event_id,
            "event_name": event_name,
            "product_tier": product_tier(event_name),
            "event_url": event_url,
            "team1_name": teams[0],
            "team2_name": teams[1],
            "starts_at": starts_at(card),
            "stage_name": "Scheduled series",
            "series_format": series_format,
            "status": "live" if live else "upcoming",
            "maps": [],
        })

    return matches


def parse_results(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    matches: list[dict[str, Any]] = []
    seen: set[str] = set()
    for card in soup.select("a.result-con, .result-con"):
        anchor = card if card.name == "a" else card.select_one('a[href*="/matches/"]')
        href = (anchor or card).get("href", "")
        id_match = re.search(r"/matches/(\d+)/", href)
        if not id_match or id_match.group(1) in seen:
            continue
        teams = [item.get_text(" ", strip=True) for item in card.select(".team")]
        teams = [team for team in teams if team]
        if len(teams) < 2 or teams[0] == teams[1]:
            continue
        score1, score2 = score_pair(text(card, (".result-score", ".result-score span")))
        event_name = text(card, (".event-name", ".matchEventName")) or "HLTV results"
        event_id, event_url = event_reference(card, event_name)
        seen.add(id_match.group(1))
        matches.append({
            "match_id": f"hltv:{id_match.group(1)}",
            "hltv_match_id": id_match.group(1),
            "source_url": f"https://www.hltv.org{href}",
            "event_id": event_id,
            "event_name": event_name,
            "product_tier": product_tier(event_name),
            "event_url": event_url,
            "team1_name": teams[0],
            "team2_name": teams[1],
            "starts_at": starts_at(card),
            "stage_name": "Completed series",
            "series_format": clean_series_format(text(card, (".map-text", ".match-format")) or "bo3"),
            "status": "finished",
            "score1": score1,
            "score2": score2,
            "winner_name": teams[0] if score1 is not None and score2 is not None and score1 > score2 else teams[1] if score1 is not None and score2 is not None else "",
            "maps": [],
        })
    return matches


def parse_match_detail(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    map_results: list[dict[str, Any]] = []
    for map_node in soup.select(".mapholder"):
        map_name = text(map_node, (".mapname", ".map-name"))
        if not map_name or map_name.casefold() in {"tba", "default"}:
            continue
        left = text(map_node, (".results-left .results-team-score", ".results-left .results-team-score-total"))
        right = text(map_node, (".results-right .results-team-score", ".results-right .results-team-score-total"))
        score1 = int(left) if left.isdigit() else None
        score2 = int(right) if right.isdigit() else None
        status = "finished" if score1 is not None and score2 is not None else "upcoming"
        map_results.append({"map_name": map_name, "score1": score1, "score2": score2, "status": status})

    veto_text = text(soup, (".veto-box", ".standard-box.veto-box", ".veto-box .padding"))
    event_name = text(soup, (".timeAndEvent .event a", ".event a", ".event"))
    event_id, event_url = event_reference(soup, event_name or "HLTV event")
    series_score1 = text(soup, (".team1-gradient .won", ".team1-gradient .lost", ".team1-gradient .team-score"))
    series_score2 = text(soup, (".team2-gradient .won", ".team2-gradient .lost", ".team2-gradient .team-score"))
    lineup_groups: list[list[dict[str, Any]]] = []
    for lineup in soup.select(".lineup")[:2]:
        players: list[dict[str, Any]] = []
        seen_players: set[str] = set()
        for anchor in lineup.select('a[href*="/player/"]'):
            href = anchor.get("href", "")
            player_match = re.search(r"/player/(\d+)/", href)
            nickname = anchor.get_text(" ", strip=True)
            if not player_match or not nickname or player_match.group(1) in seen_players:
                continue
            seen_players.add(player_match.group(1))
            players.append({
                "player_id": f"hltv:{player_match.group(1)}",
                "hltv_player_id": player_match.group(1),
                "nickname": nickname,
                "source_url": f"https://www.hltv.org{href}",
            })
        if players:
            lineup_groups.append(players[:5])
    return {
        "event_id": event_id,
        "event_name": event_name,
        "event_url": event_url,
        "stage_name": text(soup, (".timeAndEvent .text", ".event-series", ".match-info-box-con")) or "Scheduled series",
        "series_format": clean_series_format(text(soup, (".preformatted-text", ".match-info-box")) or "bo3"),
        "score1": int(series_score1) if series_score1.isdigit() else None,
        "score2": int(series_score2) if series_score2.isdigit() else None,
        "maps": [item["map_name"] for item in map_results],
        "map_results": map_results,
        "veto_text": veto_text,
        "lineups": {
            "team1": lineup_groups[0] if lineup_groups else [],
            "team2": lineup_groups[1] if len(lineup_groups) > 1 else [],
        },
    }


def merge_match_detail(match: dict[str, Any], detail: dict[str, Any]) -> dict[str, Any]:
    merged = {**match}
    for key, value in detail.items():
        if value not in (None, "", []):
            merged[key] = value
    if merged.get("lineups"):
        for player in merged["lineups"].get("team1", []):
            player["team_name"] = merged["team1_name"]
        for player in merged["lineups"].get("team2", []):
            player["team_name"] = merged["team2_name"]
    score1, score2 = merged.get("score1"), merged.get("score2")
    if isinstance(score1, int) and isinstance(score2, int) and score1 != score2:
        required = 3 if merged.get("series_format") == "bo5" else 2
        if max(score1, score2) >= required:
            merged["status"] = "finished"
            merged["winner_name"] = merged["team1_name"] if score1 > score2 else merged["team2_name"]
    return merged


def events_from_matches(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events_by_id: dict[str, dict[str, Any]] = {}
    for match in matches:
        event = events_by_id.setdefault(match["event_id"], {
            "id": match["event_id"],
            "name": match["event_name"],
            "source_url": match.get("event_url"),
            "status": "ongoing",
            "product_tier": product_tier(match["event_name"]),
            "participants": [],
            "matches": [],
            "format": {"type": "mixed", "label": "Event schedule", "stages": []},
        })
        for team in (match["team1_name"], match["team2_name"]):
            if team not in event["participants"]:
                event["participants"].append(team)
        event["matches"].append(match)
    for event in events_by_id.values():
        statuses = {match.get("status") for match in event["matches"]}
        event["status"] = "ongoing" if "live" in statuses else "upcoming" if "upcoming" in statuses else "finished"
        stage_rows: list[dict[str, Any]] = []
        seen_stages: set[str] = set()
        for match in event["matches"]:
            stage_name = str(match.get("stage_name") or "").strip()
            if not stage_name or stage_name in {"Scheduled series", "Completed series"} or stage_name in seen_stages:
                continue
            seen_stages.add(stage_name)
            lowered = stage_name.casefold()
            stage_type = (
                "swiss" if "swiss" in lowered
                else "double_elimination" if "upper" in lowered or "lower" in lowered
                else "gsl" if "group" in lowered
                else "single_elimination" if any(token in lowered for token in ("round of", "quarter", "semi", "final", "playoff"))
                else "mixed"
            )
            stage_rows.append({
                "id": slugify(stage_name),
                "name": stage_name,
                "type": stage_type,
                "status": "finished" if match.get("status") == "finished" else "live" if match.get("status") == "live" else "pending",
                "order": len(stage_rows) + 1,
            })
        stage_text = " ".join(stage["name"].casefold() for stage in stage_rows)
        if "swiss" in stage_text:
            format_type = "swiss"
        elif "upper" in stage_text or "lower" in stage_text:
            format_type = "double_elimination"
        elif "group" in stage_text and any(token in stage_text for token in ("playoff", "quarter", "semi", "final")):
            format_type = "mixed"
        elif "group" in stage_text:
            format_type = "gsl"
        elif any(token in stage_text for token in ("round of", "quarter", "semi", "final")):
            format_type = "single_elimination"
        else:
            format_type = "mixed"
        event["format"] = {
            "type": format_type,
            "label": " + ".join(stage["name"] for stage in stage_rows) or "Event schedule",
            "stages": stage_rows,
            "settings": {},
        }
        bracket_rounds: list[dict[str, Any]] = []
        bracket_by_id: dict[str, dict[str, Any]] = {}
        for match in event["matches"]:
            stage_name = str(match.get("stage_name") or "").strip()
            lowered = stage_name.casefold()
            if not any(token in lowered for token in ("round of", "quarter", "semi", "final", "upper", "lower")):
                continue
            lane = "lower" if "lower" in lowered else "upper" if "upper" in lowered else "main"
            round_id = f"{lane}:{slugify(stage_name)}"
            round_row = bracket_by_id.get(round_id)
            if round_row is None:
                round_row = {
                    "id": round_id,
                    "name": stage_name,
                    "order": len(bracket_rounds) + 1,
                    "bracket": lane,
                    "matches": [],
                }
                bracket_by_id[round_id] = round_row
                bracket_rounds.append(round_row)
            round_row["matches"].append({
                **match,
                "slot_id": f"{round_id}:{len(round_row['matches']) + 1}",
                "round_name": stage_name,
                "feeds_from": [],
            })
        if bracket_rounds:
            event["bracket"] = {
                "type": format_type if format_type in {"single_elimination", "double_elimination"} else "single_elimination",
                "rounds": bracket_rounds,
            }
        active_stage = next((stage["name"] for stage in stage_rows if stage["status"] == "live"), None)
        event["current_stage"] = active_stage or (stage_rows[-1]["name"] if stage_rows else "Schedule")
    return list(events_by_id.values())


def players_from_matches(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    players: dict[str, dict[str, Any]] = {}
    for match in matches:
        for side in ("team1", "team2"):
            for player in (match.get("lineups") or {}).get(side, []):
                if player.get("player_id"):
                    players[player["player_id"]] = {**players.get(player["player_id"], {}), **player}
    return list(players.values())


async def fetch_url(session: ClientSession, url: str) -> str:
    payload = {
        "cmd": "request.get",
        "url": url,
        "maxTimeout": REQUEST_TIMEOUT_SECONDS * 1000,
    }
    async with session.post(FLARESOLVERR_URL, json=payload) as response:
        response.raise_for_status()
        result = await response.json()
    if result.get("status") != "ok":
        raise RuntimeError(f"FlareSolverr request failed: {result.get('message') or result.get('status')}")
    return (result.get("solution") or {}).get("response") or ""


def wants_detail(match: dict[str, Any], now: datetime) -> bool:
    if match.get("status") == "live":
        return True
    starts = match.get("starts_at")
    if not starts:
        return False
    try:
        start_time = datetime.fromisoformat(str(starts).replace("Z", "+00:00"))
    except ValueError:
        return False
    return now - timedelta(hours=2) <= start_time <= now + timedelta(hours=6)


async def fetch_snapshot() -> dict[str, Any]:
    timeout = ClientTimeout(total=REQUEST_TIMEOUT_SECONDS + 15)
    detail_errors: list[str] = []
    async with ClientSession(timeout=timeout) as session:
        schedule_html = await fetch_url(session, HLTV_MATCHES_URL)
        results_html = await fetch_url(session, HLTV_RESULTS_URL)
        scheduled = parse_matches(schedule_html)
        results = parse_results(results_html)[:80]
        by_id = {match["match_id"]: match for match in [*results, *scheduled]}
        matches = list(by_id.values())

        now = datetime.now(timezone.utc)
        near_start = [match for match in matches if wants_detail(match, now)]
        recent_results = [match for match in results if match.get("source_url")][:2]
        detail_candidates = list({match["match_id"]: match for match in [*near_start, *recent_results]}.values())[:MAX_DETAIL_MATCHES]
        for match in detail_candidates:
            try:
                detail_html = await fetch_url(session, match["source_url"])
                by_id[match["match_id"]] = merge_match_detail(match, parse_match_detail(detail_html))
            except Exception as exc:
                detail_errors.append(f"{match['match_id']}: {type(exc).__name__}")

    matches = sorted(
        by_id.values(),
        key=lambda match: match.get("starts_at") or "9999-12-31T00:00:00Z",
    )
    if not matches:
        raise RuntimeError("HLTV returned no parseable schedule or result cards; preserving the last good snapshot.")

    return {
        "ok": True,
        "contract_version": "1.1",
        "fetched_at_utc": utc_now(),
        "poll_after_ms": POLL_SECONDS * 1000,
        "events": events_from_matches(matches),
        "matches": matches,
        "players": players_from_matches(matches),
        "rankings": None,
        "source": SOURCE_LABEL,
        "source_health": {
            "scheduled_matches": len(scheduled),
            "recent_results": len(results),
            "detail_matches": len(detail_candidates),
            "detail_errors": detail_errors,
        },
    }


def save_snapshot(snapshot: dict[str, Any], path: Path = SNAPSHOT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(snapshot, indent=2, sort_keys=True), encoding="utf-8")
    temporary.replace(path)


def load_snapshot() -> dict[str, Any] | None:
    if not SNAPSHOT_PATH.exists():
        return None
    try:
        payload = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) and payload.get("ok") else None
    except (OSError, json.JSONDecodeError):
        return None


async def refresh() -> None:
    state["last_attempt_utc"] = utc_now()
    try:
        snapshot = await fetch_snapshot()
        save_snapshot(snapshot)
        state["snapshot"] = snapshot
        state["last_error"] = None
    except Exception as exc:
        state["last_error"] = repr(exc)


async def refresh_loop(app: web.Application) -> None:
    while True:
        await refresh()
        await asyncio.sleep(POLL_SECONDS)


async def on_startup(app: web.Application) -> None:
    state["snapshot"] = load_snapshot()
    await refresh()
    app["refresh_task"] = asyncio.create_task(refresh_loop(app))


async def on_cleanup(app: web.Application) -> None:
    task = app.get("refresh_task")
    if task:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


async def health(_: web.Request) -> web.Response:
    return web.json_response({
        "ok": state["snapshot"] is not None,
        "last_attempt_utc": state["last_attempt_utc"],
        "last_good_utc": (state["snapshot"] or {}).get("fetched_at_utc"),
        "last_error": state["last_error"],
    }, status=200 if state["snapshot"] else 503)


async def snapshot(_: web.Request) -> web.Response:
    if not state["snapshot"]:
        return web.json_response({"ok": False, "error": "No good snapshot is available yet."}, status=503)
    return web.json_response(state["snapshot"], headers={"Cache-Control": "no-store"})


def serve() -> None:
    app = web.Application()
    app.router.add_get("/healthz", health)
    app.router.add_get("/snapshot", snapshot)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    web.run_app(app, host="0.0.0.0", port=8080)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build or serve the provider-neutral StrikeSignal live snapshot.")
    parser.add_argument("--once", action="store_true", help="Fetch one snapshot, write it, and exit.")
    parser.add_argument("--output", default=str(SNAPSHOT_PATH), help="Snapshot path used by --once.")
    args = parser.parse_args()
    if args.once:
        snapshot = asyncio.run(fetch_snapshot())
        output = Path(args.output)
        save_snapshot(snapshot, output)
        print(json.dumps({
            "ok": True,
            "output": str(output),
            "matches": len(snapshot.get("matches") or []),
            "events": len(snapshot.get("events") or []),
            "source": snapshot.get("source"),
            "source_health": snapshot.get("source_health"),
        }, indent=2, sort_keys=True))
        return
    serve()


if __name__ == "__main__":
    main()
