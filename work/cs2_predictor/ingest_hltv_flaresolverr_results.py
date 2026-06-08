from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT
from .warehouse import WAREHOUSE_PATH, connect, parse_int, summarize, upsert_team


RESULT_BLOCK_RE = re.compile(r'<div class="result-con"(?P<attrs>[^>]*)>(?P<body>.*?)(?=<div class="result-con"|</div></div><div class="results-sublist"|</div>\s*</div>\s*</div>\s*<div)', re.DOTALL)
LINK_RE = re.compile(r'<a href="(?P<href>/matches/(?P<match_id>\d+)/[^"]+)"', re.DOTALL)
TEAM_RE = re.compile(r'<div class="team[^"]*">(?P<name>.*?)</div>', re.DOTALL)
SCORE_RE = re.compile(r'<td class="result-score">\s*<span class="[^"]*">(?P<score1>\d+)</span>\s*-\s*<span class="[^"]*">(?P<score2>\d+)</span>', re.DOTALL)
EVENT_RE = re.compile(r'<span class="event-name">(?P<event>.*?)</span>', re.DOTALL)
MAP_RE = re.compile(r'<div class="map map-text">(?P<format>.*?)</div>', re.DOTALL)
STARS_RE = re.compile(r'<i class="fa fa-star star')
TIMESTAMP_RE = re.compile(r'data-zonedgrouping-entry-unix="(?P<timestamp>\d+)"')
DATE_HEADLINE_RE = re.compile(r'<div class="standard-headline">Results for (?P<label>[^<]+)</div>', re.DOTALL)


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def parse_date_label(value: str | None) -> str | None:
    if not value:
        return None
    normalized = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", value)
    try:
        return datetime.strptime(normalized, "%B %d %Y").date().isoformat()
    except ValueError:
        return None


def timestamp_to_date(timestamp_ms: int | None) -> str | None:
    if timestamp_ms is None:
        return None
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).date().isoformat()


def parse_result_blocks(raw_html: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    current_date_label: str | None = None
    positions: list[tuple[int, str, re.Match[str]]] = []
    for match in DATE_HEADLINE_RE.finditer(raw_html):
        positions.append((match.start(), "date", match))
    for match in RESULT_BLOCK_RE.finditer(raw_html):
        positions.append((match.start(), "result", match))
    for _, kind, match in sorted(positions, key=lambda item: item[0]):
        if kind == "date":
            current_date_label = parse_date_label(clean_text(match.group("label")))
            continue
        attrs = match.group("attrs") or ""
        body = match.group("body") or ""
        link_match = LINK_RE.search(body)
        if not link_match:
            continue
        teams = [clean_text(team.group("name")) for team in TEAM_RE.finditer(body)]
        teams = [team for team in teams if team]
        score_match = SCORE_RE.search(body)
        event_match = EVENT_RE.search(body)
        map_match = MAP_RE.search(body)
        timestamp_match = TIMESTAMP_RE.search(attrs)
        timestamp_ms = parse_int(timestamp_match.group("timestamp") if timestamp_match else None)
        rows.append(
            {
                "match_id": parse_int(link_match.group("match_id")),
                "match_url": "https://www.hltv.org" + link_match.group("href"),
                "match_timestamp": int(timestamp_ms / 1000) if timestamp_ms else None,
                "match_date": timestamp_to_date(timestamp_ms) or current_date_label,
                "team1_name": teams[0] if len(teams) >= 1 else None,
                "team2_name": teams[1] if len(teams) >= 2 else None,
                "team1_score": parse_int(score_match.group("score1") if score_match else None),
                "team2_score": parse_int(score_match.group("score2") if score_match else None),
                "event_name": clean_text(event_match.group("event") if event_match else None),
                "format": clean_text(map_match.group("format") if map_match else None),
                "stars": len(STARS_RE.findall(body)),
                "raw_html": body,
            }
        )
    unique: dict[int, dict[str, Any]] = {}
    for row in rows:
        match_id = row.get("match_id")
        if match_id is None:
            continue
        previous = unique.get(match_id)
        if previous is None:
            unique[match_id] = row
            continue
        previous_score = sum(1 for value in previous.values() if value not in (None, ""))
        row_score = sum(1 for value in row.values() if value not in (None, ""))
        if row_score > previous_score:
            unique[match_id] = row
    return list(unique.values())


def ingest_row(connection, row: dict[str, Any]) -> bool:
    match_id = parse_int(row.get("match_id"))
    team1_name = row.get("team1_name")
    team2_name = row.get("team2_name")
    if match_id is None or not team1_name or not team2_name:
        return False
    team1_key = upsert_team(connection, team1_name, "hltv_flaresolverr")
    team2_key = upsert_team(connection, team2_name, "hltv_flaresolverr")
    team1_score = parse_int(row.get("team1_score"))
    team2_score = parse_int(row.get("team2_score"))
    winner_team_key = None
    if team1_score is not None and team2_score is not None and team1_score != team2_score:
        winner_team_key = team1_key if team1_score > team2_score else team2_key
    raw_json = json.dumps({key: value for key, value in row.items() if key != "raw_html"}, ensure_ascii=False, sort_keys=True)
    existing = connection.execute("SELECT match_id FROM hltv_result_matches WHERE match_id = ?", (match_id,)).fetchone()
    values = (
        row.get("match_url"),
        row.get("match_date"),
        parse_int(row.get("match_timestamp")),
        row.get("event_name"),
        team1_key,
        team1_name,
        team2_key,
        team2_name,
        team1_score,
        team2_score,
        winner_team_key,
        row.get("format"),
        raw_json,
        match_id,
    )
    if existing:
        connection.execute(
            """
            UPDATE hltv_result_matches
            SET
                match_url = COALESCE(match_url, ?),
                match_date = COALESCE(match_date, ?),
                match_timestamp = COALESCE(match_timestamp, ?),
                event_name = COALESCE(event_name, ?),
                team1_key = COALESCE(team1_key, ?),
                team1_name = COALESCE(team1_name, ?),
                team2_key = COALESCE(team2_key, ?),
                team2_name = COALESCE(team2_name, ?),
                team1_score = COALESCE(team1_score, ?),
                team2_score = COALESCE(team2_score, ?),
                winner_team_key = COALESCE(winner_team_key, ?),
                format = COALESCE(format, ?),
                source = CASE
                    WHEN source IS NULL OR source = '' THEN 'hltv_flaresolverr_results'
                    WHEN instr(source, 'hltv_flaresolverr_results') = 0 THEN source || ';hltv_flaresolverr_results'
                    ELSE source
                END,
                raw_json = COALESCE(raw_json, ?)
            WHERE match_id = ?
            """,
            values,
        )
    else:
        connection.execute(
            """
            INSERT INTO hltv_result_matches(
                match_id, match_url, match_date, match_timestamp, event_name,
                team1_key, team1_name, team2_key, team2_name,
                team1_score, team2_score, winner_team_key, format,
                source, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                match_id,
                row.get("match_url"),
                row.get("match_date"),
                parse_int(row.get("match_timestamp")),
                row.get("event_name"),
                team1_key,
                team1_name,
                team2_key,
                team2_name,
                team1_score,
                team2_score,
                winner_team_key,
                row.get("format"),
                "hltv_flaresolverr_results",
                raw_json,
            ),
        )
    return True


def ingest(raw_path: Path, db_path: Path = WAREHOUSE_PATH) -> dict[str, Any]:
    payload = json.loads(raw_path.read_text(encoding="utf-8"))
    if isinstance(payload.get("rows"), list):
        rows = payload["rows"]
    else:
        raw_html = payload.get("html") or ""
        rows = parse_result_blocks(raw_html)
    connection = connect(db_path)
    loaded = sum(int(ingest_row(connection, row)) for row in rows)
    connection.commit()
    return {
        "raw_path": str(raw_path),
        "source_status": payload.get("status"),
        "rows_parsed": len(rows),
        "loaded": loaded,
        "summary": summarize(connection),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse FlareSolverr-fetched HLTV results HTML into SQLite.")
    parser.add_argument("--raw-path", default=str(RAW_ROOT / "hltv" / "flaresolverr_results_probe.json"))
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    args = parser.parse_args()
    print(json.dumps(ingest(Path(args.raw_path), Path(args.db_path)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
