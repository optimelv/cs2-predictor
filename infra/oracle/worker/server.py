from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from aiohttp import ClientSession, ClientTimeout, web
from bs4 import BeautifulSoup


FLARESOLVERR_URL = os.environ.get("FLARESOLVERR_URL", "http://flaresolverr:8191/v1")
HLTV_MATCHES_URL = os.environ.get("HLTV_MATCHES_URL", "https://www.hltv.org/matches")
POLL_SECONDS = max(180, int(os.environ.get("POLL_SECONDS", "300")))
REQUEST_TIMEOUT_SECONDS = int(os.environ.get("REQUEST_TIMEOUT_SECONDS", "90"))
SNAPSHOT_PATH = Path(os.environ.get("SNAPSHOT_PATH", "/data/last-good-snapshot.json"))

state: dict[str, Any] = {
    "snapshot": None,
    "last_error": None,
    "last_attempt_utc": None,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-") or "unknown"


def text(node, selectors: tuple[str, ...]) -> str:
    for selector in selectors:
        found = node.select_one(selector)
        if found:
            value = found.get_text(" ", strip=True)
            if value:
                return value
    return ""


def starts_at(node) -> str | None:
    timed = node.select_one("[data-unix]")
    if not timed:
        return None
    try:
        raw = int(timed.get("data-unix", "0"))
        if raw > 10_000_000_000:
            raw //= 1000
        return datetime.fromtimestamp(raw, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OSError):
        return None


def parse_matches(html: str) -> dict[str, Any]:
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
        classes = " ".join(card.get("class", []))
        live = "live" in classes.casefold() or bool(card.select_one(".matchLive, .match-live"))
        series_format = text(card, (".matchMeta", ".match-meta")) or "bo3"
        matches.append({
            "match_id": f"hltv:{id_match.group(1)}",
            "hltv_match_id": id_match.group(1),
            "source_url": f"https://www.hltv.org{href}",
            "event_id": f"hltv:{slugify(event_name)}",
            "event_name": event_name,
            "team1_name": teams[0],
            "team2_name": teams[1],
            "starts_at": starts_at(card),
            "stage_name": "Scheduled series",
            "series_format": series_format.casefold().replace(" ", ""),
            "status": "live" if live else "upcoming",
            "maps": [],
        })

    if not matches:
        raise RuntimeError("HLTV returned no parseable match cards; preserving the last good snapshot.")

    events_by_id: dict[str, dict[str, Any]] = {}
    for match in matches:
        event = events_by_id.setdefault(match["event_id"], {
            "id": match["event_id"],
            "name": match["event_name"],
            "status": "ongoing",
            "participants": [],
            "matches": [],
            "format": {"type": "mixed", "label": "Event schedule", "stages": []},
        })
        for team in (match["team1_name"], match["team2_name"]):
            if team not in event["participants"]:
                event["participants"].append(team)
        event["matches"].append(match)

    fetched_at = utc_now()
    return {
        "ok": True,
        "contract_version": "1.0",
        "fetched_at_utc": fetched_at,
        "poll_after_ms": POLL_SECONDS * 1000,
        "events": list(events_by_id.values()),
        "matches": matches,
        "rankings": None,
        "source": "HLTV via private FlareSolverr",
    }


async def fetch_snapshot() -> dict[str, Any]:
    payload = {
        "cmd": "request.get",
        "url": HLTV_MATCHES_URL,
        "maxTimeout": REQUEST_TIMEOUT_SECONDS * 1000,
    }
    timeout = ClientTimeout(total=REQUEST_TIMEOUT_SECONDS + 15)
    async with ClientSession(timeout=timeout) as session:
        async with session.post(FLARESOLVERR_URL, json=payload) as response:
            response.raise_for_status()
            result = await response.json()
    if result.get("status") != "ok":
        raise RuntimeError(f"FlareSolverr request failed: {result.get('message') or result.get('status')}")
    html = (result.get("solution") or {}).get("response") or ""
    return parse_matches(html)


def save_snapshot(snapshot: dict[str, Any]) -> None:
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = SNAPSHOT_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, indent=2, sort_keys=True), encoding="utf-8")
    temporary.replace(SNAPSHOT_PATH)


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


def main() -> None:
    app = web.Application()
    app.router.add_get("/healthz", health)
    app.router.add_get("/snapshot", snapshot)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    web.run_app(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
    main()
