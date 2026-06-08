from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT
from .warehouse import (
    WAREHOUSE_PATH,
    connect,
    parse_int,
    rebuild_team_event_stage_results,
    rebuild_team_map_win_rates,
    rebuild_team_phase_performance,
    summarize,
    upsert_player,
    upsert_team,
)


TEAM_BOX_RE = re.compile(r'<div class="standard-box teamsBox">(?P<body>.*?)(?=<div class="section-spacer)', re.DOTALL)
TEAM_RE = re.compile(
    r'<a href="/team/(?P<team_id>\d+)/[^"]+"[^>]*>.*?<div class="teamName">(?P<team_name>.*?)</div>.*?</a>\s*<div class="(?P<score_class>[^"]*)">(?P<score>\d+)</div>',
    re.DOTALL,
)
EVENT_RE = re.compile(r'<div class="event text-ellipsis"><a href="/events/(?P<event_id>\d+)/[^"]+" title="(?P<event_name>[^"]+)">', re.DOTALL)
UNIX_RE = re.compile(r'data-unix="(?P<timestamp_ms>\d+)"')
FORMAT_RE = re.compile(r'<div class="padding preformatted-text">(?P<text>.*?)</div>', re.DOTALL)
VETO_LINE_RE = re.compile(r"<div>(?P<line>\d+\..*?)</div>", re.DOTALL)
MAP_BLOCK_RE = re.compile(r'<div class="mapholder">(?P<body>.*?)(?=<div class="mapholder">|</div>\s*</div>\s*</div>\s*<div class="col-6)', re.DOTALL)
MAP_NAME_RE = re.compile(r'<div class="mapname">(?P<map_name>.*?)</div>', re.DOTALL)
MAP_STATS_ID_RE = re.compile(r"/stats/matches/mapstatsid/(?P<stats_id>\d+)/")
MAP_TEAM_SCORE_RE = re.compile(
    r'<div class="results-teamname[^"]*">(?P<team_name>.*?)</div>\s*<div class="results-team-score">(?P<score>\d+)</div>',
    re.DOTALL,
)
PICK_SIDE_RE = re.compile(r'<(?:div|span) class="results-(?P<side>left|right)[^"]*\bpick\b(?P<body>.*?)(?=</(?:div|span)>\s*</div>|<div class="results-center")', re.DOTALL)
LINEUPS_RE = re.compile(r'<div class="lineups" id="lineups"(?P<body>.*?)(?=<div class="section-spacer"></div>\s*<div class="past-matches"|<div class="past-matches"|$)', re.DOTALL)
LINEUP_BLOCK_RE = re.compile(r'<div class="lineup standard-box">(?P<body>.*?)(?=<div class="lineup standard-box">|</div>\s*</div>\s*</div>\s*</div>)', re.DOTALL)
LINEUP_TEAM_RE = re.compile(r'<a href="/team/(?P<team_id>\d+)/[^"]+" class="text-ellipsis">(?P<team_name>.*?)</a>', re.DOTALL)
LINEUP_RANK_RE = re.compile(r"World rank:\s*</span>#(?P<rank>\d+)", re.DOTALL)
PLAYER_LINK_RE = re.compile(r'<a href="/player/(?P<player_id>\d+)/[^"]+"[^>]*>(?P<body>.*?)</a>', re.DOTALL)
PLAYER_NICK_RE = re.compile(r'<span class="player-nick">(?P<nick>.*?)</span>', re.DOTALL)
STATS_CONTENT_RE = re.compile(r'<div class="stats-content" id="(?P<content_id>[^"]+)">(?P<body>.*?)(?=<div class="stats-content" id=|</div>\s*</div>\s*</div>\s*<div class="section-spacer")', re.DOTALL)
TR_RE = re.compile(r"<tr(?P<attrs>[^>]*)>(?P<body>.*?)</tr>", re.DOTALL)
STATS_TEAM_RE = re.compile(r'<a href="/team/(?P<team_id>\d+)/[^"]+" class="teamName team">(?P<team_name>.*?)</a>', re.DOTALL)
KD_RE = re.compile(r'<td class="kd text-center traditional-data">(?P<kills>\d+)-(?P<deaths>\d+)</td>', re.DOTALL)
ADR_RE = re.compile(r'<td class="adr text-center traditional-data">(?P<adr>[-\d.]+)</td>', re.DOTALL)
KAST_RE = re.compile(r'<td class="kast text-center traditional-data">(?P<kast>[-\d.]+)%</td>', re.DOTALL)
SWING_RE = re.compile(r'<td class="roundSwing text-center[^"]*">(?P<swing>[+\-\d.]+)%</td>', re.DOTALL)
RATING_RE = re.compile(r'<td class="rating text-center[^"]*">(?P<rating>[-\d.]+)</td>', re.DOTALL)


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def parse_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace("%", ""))
    except ValueError:
        return None


def timestamp_parts(timestamp_ms: int | None) -> tuple[str | None, int | None]:
    if timestamp_ms is None:
        return None, None
    timestamp_seconds = int(timestamp_ms / 1000)
    match_date = datetime.fromtimestamp(timestamp_seconds, tz=timezone.utc).date().isoformat()
    return match_date, timestamp_seconds


def parse_format(value: str | None) -> dict[str, Any]:
    text = clean_text(value)
    best_of = None
    location = None
    if text:
        best_match = re.search(r"Best of\s+(\d+)", text, re.IGNORECASE)
        best_of = parse_int(best_match.group(1) if best_match else None)
        location_match = re.search(r"\((LAN|Online)\)", text, re.IGNORECASE)
        location = location_match.group(1) if location_match else None
    return {"raw": text, "best_of": best_of, "location": location}


def parse_teams(raw_html: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    teams_box = TEAM_BOX_RE.search(raw_html)
    body = teams_box.group("body") if teams_box else raw_html
    teams = []
    for match in TEAM_RE.finditer(body):
        teams.append(
            {
                "team_id": parse_int(match.group("team_id")),
                "team_name": clean_text(match.group("team_name")),
                "score": parse_int(match.group("score")),
                "score_class": match.group("score_class"),
            }
        )
    event_match = EVENT_RE.search(body)
    timestamp_match = UNIX_RE.search(body)
    format_match = FORMAT_RE.search(raw_html)
    match_date, match_timestamp = timestamp_parts(parse_int(timestamp_match.group("timestamp_ms") if timestamp_match else None))
    return teams[:2], {
        "event_id": parse_int(event_match.group("event_id") if event_match else None),
        "event_name": html.unescape(event_match.group("event_name")) if event_match else None,
        "match_date": match_date,
        "match_timestamp": match_timestamp,
        "format": parse_format(format_match.group("text") if format_match else None),
    }


def parse_veto_line(line: str) -> dict[str, Any]:
    line = clean_text(line) or ""
    text = re.sub(r"^\d+\.\s*", "", line)
    if " was left over" in text:
        return {"team_name": None, "action": "left over", "map_name": text.replace(" was left over", "").strip(), "raw_text": line}
    match = re.match(r"(?P<team>.+?)\s+(?P<action>removed|picked)\s+(?P<map>.+)$", text)
    if match:
        return {
            "team_name": match.group("team").strip(),
            "action": match.group("action"),
            "map_name": match.group("map").strip(),
            "raw_text": line,
        }
    return {"team_name": None, "action": "unknown", "map_name": None, "raw_text": line}


def parse_vetoes(raw_html: str) -> list[dict[str, Any]]:
    return [parse_veto_line(match.group("line")) for match in VETO_LINE_RE.finditer(raw_html)]


def parse_maps(raw_html: str) -> list[dict[str, Any]]:
    rows = []
    for map_index, match in enumerate(MAP_BLOCK_RE.finditer(raw_html), start=1):
        body = match.group("body")
        map_name_match = MAP_NAME_RE.search(body)
        stats_id_match = MAP_STATS_ID_RE.search(body)
        team_scores = [
            {"team_name": clean_text(score.group("team_name")), "score": parse_int(score.group("score"))}
            for score in MAP_TEAM_SCORE_RE.finditer(body)
        ]
        picked_by_team_name = None
        pick_match = PICK_SIDE_RE.search(body)
        if pick_match:
            pick_scores = [
                clean_text(score.group("team_name"))
                for score in MAP_TEAM_SCORE_RE.finditer(pick_match.group("body") or "")
            ]
            picked_by_team_name = pick_scores[0] if pick_scores else None
        rows.append(
            {
                "map_index": map_index,
                "map_name": clean_text(map_name_match.group("map_name") if map_name_match else None),
                "stats_id": parse_int(stats_id_match.group("stats_id") if stats_id_match else None),
                "team1_name": team_scores[0]["team_name"] if len(team_scores) >= 1 else None,
                "team1_score": team_scores[0]["score"] if len(team_scores) >= 1 else None,
                "team2_name": team_scores[1]["team_name"] if len(team_scores) >= 2 else None,
                "team2_score": team_scores[1]["score"] if len(team_scores) >= 2 else None,
                "picked_by_team_name": picked_by_team_name,
            }
        )
    return [row for row in rows if row.get("map_name")]


def parse_lineups(raw_html: str) -> list[dict[str, Any]]:
    lineups_match = LINEUPS_RE.search(raw_html)
    body = lineups_match.group("body") if lineups_match else ""
    rows = []
    for team_side, lineup_match in enumerate(LINEUP_BLOCK_RE.finditer(body), start=1):
        lineup_body = lineup_match.group("body")
        team_match = LINEUP_TEAM_RE.search(lineup_body)
        rank_match = LINEUP_RANK_RE.search(lineup_body)
        team_name = clean_text(team_match.group("team_name") if team_match else None)
        team_id = parse_int(team_match.group("team_id") if team_match else None)
        for player_match in PLAYER_LINK_RE.finditer(lineup_body):
            player_body = player_match.group("body")
            nick_match = PLAYER_NICK_RE.search(player_body)
            player_name = clean_text(nick_match.group("nick") if nick_match else player_body)
            if not player_name:
                continue
            rows.append(
                {
                    "team_side": team_side,
                    "team_name": team_name,
                    "team_id": team_id,
                    "team_rank": parse_int(rank_match.group("rank") if rank_match else None),
                    "player_id": parse_int(player_match.group("player_id")),
                    "player_name": player_name,
                }
            )
    seen = set()
    unique = []
    for row in rows:
        key = (row["team_side"], row["player_id"], row["player_name"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def parse_stats(raw_html: str, match_id: int, maps: list[dict[str, Any]], teams: list[dict[str, Any]]) -> list[dict[str, Any]]:
    map_by_stats_id = {str(row.get("stats_id")): row for row in maps if row.get("stats_id")}
    team_side_by_name = {
        (team.get("team_name") or "").casefold(): index + 1
        for index, team in enumerate(teams[:2])
        if team.get("team_name")
    }
    stats_rows = []
    for content_match in STATS_CONTENT_RE.finditer(raw_html):
        content_id = content_match.group("content_id").replace("-content", "")
        body = content_match.group("body")
        if content_id == "all":
            stats_id = -match_id
            map_name = "All"
            map_index = 0
        else:
            stats_id = parse_int(content_id)
            map_row = map_by_stats_id.get(str(stats_id)) or {}
            map_name = map_row.get("map_name")
            map_index = map_row.get("map_index")
        current_team_name = None
        current_team_id = None
        current_team_side = None
        for tr in TR_RE.finditer(body):
            tr_body = tr.group("body")
            team_match = STATS_TEAM_RE.search(tr_body)
            if team_match:
                current_team_name = clean_text(team_match.group("team_name"))
                current_team_id = parse_int(team_match.group("team_id"))
                current_team_side = team_side_by_name.get((current_team_name or "").casefold())
                continue
            player_match = PLAYER_LINK_RE.search(tr_body)
            if not player_match:
                continue
            nick_match = PLAYER_NICK_RE.search(player_match.group("body"))
            player_name = clean_text(nick_match.group("nick") if nick_match else player_match.group("body"))
            if not player_name:
                continue
            kd_match = KD_RE.search(tr_body)
            adr_match = ADR_RE.search(tr_body)
            kast_match = KAST_RE.search(tr_body)
            swing_match = SWING_RE.search(tr_body)
            rating_match = RATING_RE.search(tr_body)
            kills = parse_int(kd_match.group("kills") if kd_match else None)
            deaths = parse_int(kd_match.group("deaths") if kd_match else None)
            stats_rows.append(
                {
                    "stats_id": stats_id,
                    "map_name": map_name,
                    "map_index": map_index,
                    "team_side": current_team_side,
                    "team_name": current_team_name,
                    "team_id": current_team_id,
                    "player_id": parse_int(player_match.group("player_id")),
                    "player_name": player_name,
                    "kills": kills,
                    "deaths": deaths,
                    "kill_deaths_difference": (kills - deaths) if kills is not None and deaths is not None else None,
                    "adr": parse_float(adr_match.group("adr") if adr_match else None),
                    "kast": parse_float(kast_match.group("kast") if kast_match else None),
                    "impact": parse_float(swing_match.group("swing") if swing_match else None),
                    "rating_2_0": parse_float(rating_match.group("rating") if rating_match else None),
                    "rating_version": "3.0",
                }
            )
    return [row for row in stats_rows if row.get("stats_id") is not None and row.get("team_side")]


def parse_match_detail_html(match_id: int, match_url: str, raw_html: str) -> dict[str, Any]:
    teams, meta = parse_teams(raw_html)
    maps = parse_maps(raw_html)
    vetoes = parse_vetoes(raw_html)
    picked_by_map = {
        veto.get("map_name"): veto.get("team_name")
        for veto in vetoes
        if veto.get("action") == "picked" and veto.get("map_name") and veto.get("team_name")
    }
    for map_row in maps:
        map_row["picked_by_team_name"] = map_row.get("picked_by_team_name") or picked_by_map.get(map_row.get("map_name"))
    lineups = parse_lineups(raw_html)
    lineups_by_team_side = {}
    for row in lineups:
        lineups_by_team_side.setdefault(row["team_side"], row)
    for index, team in enumerate(teams[:2], start=1):
        lineup = lineups_by_team_side.get(index)
        if lineup:
            team["rank"] = lineup.get("team_rank")
    return {
        "match_id": match_id,
        "match_url": match_url,
        "status": "ok",
        **meta,
        "teams": teams,
        "maps": maps,
        "vetoes": vetoes,
        "lineups": lineups,
        "player_stats": parse_stats(raw_html, match_id, maps, teams),
    }


def team_key_for(connection, name: str | None) -> str | None:
    return upsert_team(connection, name, "hltv_flaresolverr_match_detail") if name else None


def ingest_match_detail(connection, detail: dict[str, Any]) -> bool:
    if detail.get("status") != "ok":
        return False
    match_id = parse_int(detail.get("match_id"))
    if match_id is None:
        return False
    teams = detail.get("teams") or []
    if len(teams) < 2:
        return False
    team1, team2 = teams[0], teams[1]
    team1_key = team_key_for(connection, team1.get("team_name"))
    team2_key = team_key_for(connection, team2.get("team_name"))
    winner_key = None
    if parse_int(team1.get("score")) is not None and parse_int(team2.get("score")) is not None:
        if int(team1["score"]) > int(team2["score"]):
            winner_key = team1_key
        elif int(team2["score"]) > int(team1["score"]):
            winner_key = team2_key
    format_row = detail.get("format") or {}
    raw_json = json.dumps({key: value for key, value in detail.items() if key not in {"player_stats"}}, ensure_ascii=False, sort_keys=True)
    connection.execute(
        """
        UPDATE hltv_result_matches
        SET
            match_url = COALESCE(match_url, ?),
            match_date = COALESCE(match_date, ?),
            match_timestamp = COALESCE(match_timestamp, ?),
            event_name = COALESCE(event_name, ?),
            event_id = COALESCE(event_id, ?),
            team1_key = COALESCE(team1_key, ?),
            team1_name = COALESCE(team1_name, ?),
            team1_id = COALESCE(team1_id, ?),
            team1_rank = COALESCE(team1_rank, ?),
            team2_key = COALESCE(team2_key, ?),
            team2_name = COALESCE(team2_name, ?),
            team2_id = COALESCE(team2_id, ?),
            team2_rank = COALESCE(team2_rank, ?),
            team1_score = COALESCE(team1_score, ?),
            team2_score = COALESCE(team2_score, ?),
            winner_team_key = COALESCE(winner_team_key, ?),
            status = COALESCE(status, 'over'),
            format = COALESCE(format, ?),
            format_location = COALESCE(format_location, ?),
            hltv_fetched_at_utc = ?,
            source = CASE
                WHEN instr(source, 'hltv_flaresolverr_match_detail') = 0 THEN source || ';hltv_flaresolverr_match_detail'
                ELSE source
            END,
            raw_json = COALESCE(raw_json, ?)
        WHERE match_id = ?
        """,
        (
            detail.get("match_url"),
            detail.get("match_date"),
            detail.get("match_timestamp"),
            detail.get("event_name"),
            detail.get("event_id"),
            team1_key,
            team1.get("team_name"),
            team1.get("team_id"),
            team1.get("rank"),
            team2_key,
            team2.get("team_name"),
            team2.get("team_id"),
            team2.get("rank"),
            team1.get("score"),
            team2.get("score"),
            winner_key,
            f"bo{format_row.get('best_of')}" if format_row.get("best_of") else None,
            format_row.get("location"),
            datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            raw_json,
            match_id,
        ),
    )

    connection.execute("DELETE FROM hltv_match_maps WHERE match_id = ?", (match_id,))
    for map_row in detail.get("maps") or []:
        picked_by_team_key = team_key_for(connection, map_row.get("picked_by_team_name"))
        winner_team_key = None
        winner_team_name = None
        if map_row.get("team1_score") is not None and map_row.get("team2_score") is not None:
            if int(map_row["team1_score"]) > int(map_row["team2_score"]):
                winner_team_name = map_row.get("team1_name")
            elif int(map_row["team2_score"]) > int(map_row["team1_score"]):
                winner_team_name = map_row.get("team2_name")
            winner_team_key = team_key_for(connection, winner_team_name)
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_match_maps(
                match_id, map_index, map_name, team1_name, team2_name, team1_score,
                team2_score, winner_team_key, winner_team_name, stats_id,
                picked_by_team_key, picked_by_team_name, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                match_id,
                map_row.get("map_index"),
                map_row.get("map_name"),
                map_row.get("team1_name"),
                map_row.get("team2_name"),
                map_row.get("team1_score"),
                map_row.get("team2_score"),
                winner_team_key,
                winner_team_name,
                map_row.get("stats_id"),
                picked_by_team_key,
                map_row.get("picked_by_team_name"),
                json.dumps(map_row, ensure_ascii=False, sort_keys=True),
            ),
        )

    connection.execute("DELETE FROM hltv_match_vetoes WHERE match_id = ?", (match_id,))
    for veto_index, veto in enumerate(detail.get("vetoes") or [], start=1):
        team_key = team_key_for(connection, veto.get("team_name"))
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_match_vetoes(
                match_id, veto_index, team_key, team_name, map_name, action, raw_text
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (match_id, veto_index, team_key, veto.get("team_name"), veto.get("map_name"), veto.get("action"), veto.get("raw_text")),
        )

    connection.execute("DELETE FROM hltv_match_players WHERE match_id = ?", (match_id,))
    for player in detail.get("lineups") or []:
        if not player.get("player_name"):
            continue
        team_key = team_key_for(connection, player.get("team_name"))
        player_key = upsert_player(
            connection,
            player.get("player_name"),
            source="hltv_flaresolverr_match_detail",
            hltv_player_id=player.get("player_id"),
        )
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_match_players(
                match_id, team_side, team_key, team_name, hltv_team_id,
                player_key, player_name, hltv_player_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                match_id,
                player.get("team_side"),
                team_key,
                player.get("team_name"),
                player.get("team_id"),
                player_key,
                player.get("player_name"),
                player.get("player_id"),
            ),
        )

    connection.execute("DELETE FROM hltv_match_player_stats WHERE match_id = ?", (match_id,))
    for stat in detail.get("player_stats") or []:
        if not stat.get("player_name"):
            continue
        team_key = team_key_for(connection, stat.get("team_name"))
        player_key = upsert_player(
            connection,
            stat.get("player_name"),
            source="hltv_flaresolverr_match_stats",
            hltv_player_id=stat.get("player_id"),
        )
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_match_player_stats(
                stats_id, match_id, map_name, map_index, match_date,
                team_side, team_key, team_name, hltv_team_id,
                player_key, player_name, hltv_player_id,
                kills, deaths, kast, adr, impact, kill_deaths_difference, rating_2_0, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                stat.get("stats_id"),
                match_id,
                stat.get("map_name"),
                stat.get("map_index"),
                detail.get("match_date"),
                stat.get("team_side"),
                team_key,
                stat.get("team_name"),
                stat.get("team_id"),
                player_key,
                stat.get("player_name"),
                stat.get("player_id"),
                stat.get("kills"),
                stat.get("deaths"),
                stat.get("kast"),
                stat.get("adr"),
                stat.get("impact"),
                stat.get("kill_deaths_difference"),
                stat.get("rating_2_0"),
                json.dumps(stat, ensure_ascii=False, sort_keys=True),
            ),
        )
    return True


def ingest(raw_path: Path, as_of_date: str, db_path: Path = WAREHOUSE_PATH) -> dict[str, Any]:
    payload = json.loads(raw_path.read_text(encoding="utf-8"))
    details = payload.get("details") if isinstance(payload, dict) else payload
    connection = connect(db_path)
    loaded = 0
    errors = 0
    for detail in details or []:
        if detail.get("status") == "ok":
            loaded += int(ingest_match_detail(connection, detail))
        else:
            errors += 1
    team_map_rows = rebuild_team_map_win_rates(connection, as_of_date=as_of_date)
    event_stage_rows = rebuild_team_event_stage_results(connection, as_of_date=as_of_date)
    phase_rows = rebuild_team_phase_performance(connection, as_of_date=as_of_date)
    connection.commit()
    return {
        "raw_path": str(raw_path),
        "rows_seen": len(details or []),
        "details_loaded": loaded,
        "errors_seen": errors,
        "team_map_win_rates": team_map_rows,
        "team_event_stage_results": event_stage_rows,
        "team_phase_performance": phase_rows,
        "summary": summarize(connection),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest parsed FlareSolverr HLTV match-detail rows into SQLite.")
    parser.add_argument("--raw-path", default=str(RAW_ROOT / "hltv" / "flaresolverr_match_details.json"))
    parser.add_argument("--as-of-date", default="2026-06-08")
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    args = parser.parse_args()
    print(json.dumps(ingest(Path(args.raw_path), args.as_of_date, Path(args.db_path)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
