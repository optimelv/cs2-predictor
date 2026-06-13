from __future__ import annotations

import csv
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .paths import BRONZE_ROOT, DATA_ROOT


WAREHOUSE_PATH = DATA_ROOT / "cs2_predictor.sqlite3"


SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    started_at_utc TEXT NOT NULL,
    completed_at_utc TEXT,
    status TEXT NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS teams (
    team_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_aliases (
    alias TEXT PRIMARY KEY,
    team_key TEXT NOT NULL,
    source TEXT NOT NULL,
    FOREIGN KEY (team_key) REFERENCES teams(team_key)
);

CREATE TABLE IF NOT EXISTS players (
    player_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    real_name TEXT,
    hltv_player_id INTEGER,
    liquipedia_href TEXT,
    created_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_aliases (
    alias TEXT PRIMARY KEY,
    player_key TEXT NOT NULL,
    source TEXT NOT NULL,
    FOREIGN KEY (player_key) REFERENCES players(player_key)
);

CREATE TABLE IF NOT EXISTS valve_rankings (
    ranking_date TEXT NOT NULL,
    region TEXT NOT NULL,
    rank INTEGER NOT NULL,
    points REAL NOT NULL,
    team_key TEXT NOT NULL,
    team_name TEXT NOT NULL,
    roster_names TEXT,
    roster_size INTEGER,
    details_relative_path TEXT,
    PRIMARY KEY (ranking_date, region, rank, team_name)
);

CREATE TABLE IF NOT EXISTS valve_roster_match_factors (
    ranking_date TEXT NOT NULL,
    team_key TEXT NOT NULL,
    team_name TEXT NOT NULL,
    match_id TEXT NOT NULL,
    match_sequence INTEGER,
    match_date TEXT,
    opponent_name TEXT,
    result TEXT,
    age_weight REAL,
    event_weight TEXT,
    bounty_collected TEXT,
    opponent_network TEXT,
    lan_wins TEXT,
    head_to_head_adjustment REAL,
    roster_names TEXT,
    PRIMARY KEY (ranking_date, team_name, match_id)
);

CREATE TABLE IF NOT EXISTS liquipedia_matches (
    team_key TEXT NOT NULL,
    team_name TEXT NOT NULL,
    match_timestamp INTEGER,
    match_date_text TEXT,
    tier TEXT,
    match_type TEXT,
    tournament_name TEXT,
    tournament_href TEXT,
    result_label TEXT,
    score_text TEXT,
    opponent_name TEXT,
    opponent_href TEXT,
    page_title TEXT,
    coverage_start TEXT,
    coverage_end TEXT,
    vod_count INTEGER,
    PRIMARY KEY (team_name, match_timestamp, opponent_name, tournament_name, score_text)
);

CREATE TABLE IF NOT EXISTS liquipedia_rosters (
    team_key TEXT NOT NULL,
    team_name TEXT NOT NULL,
    player_key TEXT NOT NULL,
    player_handle TEXT NOT NULL,
    player_real_name TEXT,
    player_href TEXT,
    role TEXT,
    join_date TEXT,
    page_title TEXT,
    PRIMARY KEY (team_name, player_handle)
);

CREATE TABLE IF NOT EXISTS hltv_team_rankings (
    snapshot_date TEXT NOT NULL,
    rank INTEGER NOT NULL,
    points INTEGER,
    team_key TEXT NOT NULL,
    team_name TEXT NOT NULL,
    rank_change_text TEXT,
    team_href TEXT,
    details_href TEXT,
    player_names TEXT,
    player_hrefs TEXT,
    PRIMARY KEY (snapshot_date, rank)
);

CREATE TABLE IF NOT EXISTS hltv_player_queue (
    hltv_player_id INTEGER PRIMARY KEY,
    player_name TEXT NOT NULL,
    player_href TEXT NOT NULL,
    discovered_from TEXT NOT NULL,
    priority_rank INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hltv_player_snapshots (
    hltv_player_id INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL,
    player_name TEXT NOT NULL,
    player_href TEXT NOT NULL,
    rating_3_0 REAL,
    maps_3m INTEGER,
    firepower INTEGER,
    entrying INTEGER,
    trading INTEGER,
    opening INTEGER,
    clutching INTEGER,
    sniping INTEGER,
    utility INTEGER,
    rating_2_0 REAL,
    dpr REAL,
    kast REAL,
    impact REAL,
    adr REAL,
    kpr REAL,
    maps INTEGER,
    rounds INTEGER,
    raw_json TEXT,
    PRIMARY KEY (hltv_player_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS map_pool_snapshots (
    snapshot_date TEXT NOT NULL,
    map_name TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    notes TEXT,
    PRIMARY KEY (snapshot_date, map_name, source)
);

CREATE TABLE IF NOT EXISTS hltv_result_matches (
    match_id INTEGER PRIMARY KEY,
    match_url TEXT NOT NULL,
    match_date TEXT,
    match_timestamp INTEGER,
    event_name TEXT,
    event_id INTEGER,
    team1_key TEXT,
    team1_name TEXT,
    team1_id INTEGER,
    team1_rank INTEGER,
    team2_key TEXT,
    team2_name TEXT,
    team2_id INTEGER,
    team2_rank INTEGER,
    team1_score INTEGER,
    team2_score INTEGER,
    winner_team_key TEXT,
    winner_team_id INTEGER,
    status TEXT,
    format TEXT,
    format_location TEXT,
    liquipedia_source_title TEXT,
    liquipedia_event_source_title TEXT,
    liquipedia_event_tier TEXT,
    liquipedia_publisher_tier TEXT,
    liquipedia_stage_name TEXT,
    liquipedia_round_name TEXT,
    liquipedia_match_section TEXT,
    liquipedia_bracket_type TEXT,
    liquipedia_bracket_id TEXT,
    liquipedia_bracket_slot TEXT,
    liquipedia_bracket_group TEXT,
    match_phase TEXT,
    is_playoff INTEGER,
    is_elimination_match INTEGER,
    stars INTEGER,
    has_scorebot INTEGER,
    hltv_fetched_at_utc TEXT,
    source TEXT NOT NULL,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS liquipedia_events (
    source_title TEXT PRIMARY KEY,
    event_name TEXT,
    event_tier TEXT,
    publisher_tier TEXT,
    event_type TEXT,
    organizer TEXT,
    series TEXT,
    start_date TEXT,
    end_date TEXT,
    prizepool_usd REAL,
    country TEXT,
    city TEXT,
    venue TEXT,
    team_count INTEGER,
    map_pool TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS hltv_match_maps (
    match_id INTEGER NOT NULL,
    map_index INTEGER NOT NULL,
    map_name TEXT NOT NULL,
    team1_name TEXT,
    team2_name TEXT,
    team1_score INTEGER,
    team2_score INTEGER,
    winner_team_key TEXT,
    winner_team_name TEXT,
    stats_id INTEGER,
    picked_by_team_key TEXT,
    picked_by_team_name TEXT,
    raw_json TEXT,
    PRIMARY KEY (match_id, map_index),
    FOREIGN KEY (match_id) REFERENCES hltv_result_matches(match_id)
);

CREATE TABLE IF NOT EXISTS hltv_match_vetoes (
    match_id INTEGER NOT NULL,
    veto_index INTEGER NOT NULL,
    team_key TEXT,
    team_name TEXT,
    hltv_team_id INTEGER,
    map_name TEXT,
    action TEXT NOT NULL,
    raw_text TEXT,
    PRIMARY KEY (match_id, veto_index),
    FOREIGN KEY (match_id) REFERENCES hltv_result_matches(match_id)
);

CREATE TABLE IF NOT EXISTS hltv_match_players (
    match_id INTEGER NOT NULL,
    team_side INTEGER NOT NULL,
    team_key TEXT,
    team_name TEXT,
    hltv_team_id INTEGER,
    player_key TEXT NOT NULL,
    player_name TEXT NOT NULL,
    hltv_player_id INTEGER,
    PRIMARY KEY (match_id, team_side, player_key),
    FOREIGN KEY (match_id) REFERENCES hltv_result_matches(match_id)
);

CREATE TABLE IF NOT EXISTS hltv_match_player_stats (
    stats_id INTEGER NOT NULL,
    match_id INTEGER,
    map_name TEXT,
    map_index INTEGER,
    match_date TEXT,
    team_side INTEGER NOT NULL,
    team_key TEXT,
    team_name TEXT,
    hltv_team_id INTEGER,
    player_key TEXT NOT NULL,
    player_name TEXT NOT NULL,
    hltv_player_id INTEGER,
    kills INTEGER,
    hs_kills INTEGER,
    assists INTEGER,
    flash_assists INTEGER,
    deaths INTEGER,
    kast REAL,
    adr REAL,
    impact REAL,
    kills_per_round REAL,
    deaths_per_round REAL,
    kill_deaths_difference INTEGER,
    first_kills_difference INTEGER,
    rating_1_0 REAL,
    rating_2_0 REAL,
    raw_json TEXT,
    PRIMARY KEY (stats_id, team_side, player_key)
);

CREATE TABLE IF NOT EXISTS hltv_match_map_rounds (
    stats_id INTEGER NOT NULL,
    round_index INTEGER NOT NULL,
    match_id INTEGER,
    map_name TEXT,
    outcome TEXT,
    score_text TEXT,
    t_team_id INTEGER,
    ct_team_id INTEGER,
    raw_json TEXT,
    PRIMARY KEY (stats_id, round_index)
);

CREATE TABLE IF NOT EXISTS hltv_player_stats_windows (
    hltv_player_id INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    player_name TEXT,
    player_ign TEXT,
    current_team_name TEXT,
    current_team_id INTEGER,
    maps_played INTEGER,
    rounds_played INTEGER,
    kills INTEGER,
    deaths INTEGER,
    headshots INTEGER,
    kd_ratio REAL,
    damage_per_round REAL,
    grenade_damage_per_round REAL,
    kills_per_round REAL,
    assists_per_round REAL,
    deaths_per_round REAL,
    rating_1_0 REAL,
    rating_2_0 REAL,
    opening_kills INTEGER,
    opening_deaths INTEGER,
    opening_kill_ratio REAL,
    opening_kill_rating REAL,
    team_win_percent_after_first_kill REAL,
    first_kill_in_won_rounds REAL,
    rifle_kills INTEGER,
    sniper_kills INTEGER,
    smg_kills INTEGER,
    pistol_kills INTEGER,
    grenade_kills INTEGER,
    other_kills INTEGER,
    matches_count INTEGER,
    raw_json TEXT,
    PRIMARY KEY (hltv_player_id, snapshot_date, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS hltv_api_function_tests (
    tested_at_utc TEXT NOT NULL,
    api_name TEXT NOT NULL,
    function_name TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    raw_json TEXT,
    PRIMARY KEY (tested_at_utc, api_name, function_name)
);

CREATE TABLE IF NOT EXISTS team_event_stage_results (
    as_of_date TEXT NOT NULL,
    source TEXT NOT NULL,
    event_name TEXT NOT NULL,
    liquipedia_source_title TEXT,
    liquipedia_event_source_title TEXT,
    team_key TEXT NOT NULL,
    team_name TEXT NOT NULL,
    stage_name TEXT NOT NULL,
    round_name TEXT NOT NULL,
    match_phase TEXT NOT NULL,
    matches INTEGER NOT NULL,
    series_wins INTEGER NOT NULL,
    series_losses INTEGER NOT NULL,
    map_wins INTEGER NOT NULL,
    map_losses INTEGER NOT NULL,
    first_match_date TEXT,
    last_match_date TEXT,
    PRIMARY KEY (
        as_of_date, source, event_name, team_key, stage_name, round_name, match_phase
    )
);

CREATE TABLE IF NOT EXISTS team_phase_performance (
    as_of_date TEXT NOT NULL,
    source TEXT NOT NULL,
    team_key TEXT NOT NULL,
    team_name TEXT NOT NULL,
    match_phase TEXT NOT NULL,
    matches INTEGER NOT NULL,
    series_wins INTEGER NOT NULL,
    series_losses INTEGER NOT NULL,
    series_win_rate REAL NOT NULL,
    map_wins INTEGER NOT NULL,
    map_losses INTEGER NOT NULL,
    map_win_rate REAL,
    first_match_date TEXT,
    last_match_date TEXT,
    PRIMARY KEY (as_of_date, source, team_key, match_phase)
);

CREATE TABLE IF NOT EXISTS team_map_win_rates (
    as_of_date TEXT NOT NULL,
    source TEXT NOT NULL,
    team_key TEXT NOT NULL,
    team_name TEXT NOT NULL,
    map_name TEXT NOT NULL,
    opponent_filter TEXT NOT NULL DEFAULT 'all',
    matches INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    win_rate REAL NOT NULL,
    avg_round_diff REAL,
    sample_start_date TEXT,
    sample_end_date TEXT,
    PRIMARY KEY (as_of_date, source, team_key, map_name, opponent_filter)
);

CREATE TABLE IF NOT EXISTS collection_queue (
    queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    url_or_title TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1000,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at_utc TEXT NOT NULL,
    UNIQUE (source, entity_type, entity_key, url_or_title)
);

CREATE INDEX IF NOT EXISTS idx_valve_rankings_latest ON valve_rankings(ranking_date, region, rank);
CREATE INDEX IF NOT EXISTS idx_liquipedia_matches_team_time ON liquipedia_matches(team_key, match_timestamp);
CREATE INDEX IF NOT EXISTS idx_hltv_player_queue_status ON hltv_player_queue(status, priority_rank);
CREATE INDEX IF NOT EXISTS idx_collection_queue_status ON collection_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_hltv_result_matches_date ON hltv_result_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_hltv_result_matches_teams ON hltv_result_matches(team1_key, team2_key);
CREATE INDEX IF NOT EXISTS idx_hltv_match_maps_team_map ON hltv_match_maps(map_name, winner_team_key);
CREATE INDEX IF NOT EXISTS idx_hltv_match_players_player ON hltv_match_players(player_key);
CREATE INDEX IF NOT EXISTS idx_hltv_match_player_stats_match ON hltv_match_player_stats(match_id, map_name);
CREATE INDEX IF NOT EXISTS idx_hltv_match_player_stats_player ON hltv_match_player_stats(player_key, match_date);
CREATE INDEX IF NOT EXISTS idx_hltv_player_stats_windows_player ON hltv_player_stats_windows(hltv_player_id, end_date);
CREATE INDEX IF NOT EXISTS idx_team_phase_performance_team ON team_phase_performance(team_key, as_of_date);
CREATE INDEX IF NOT EXISTS idx_team_map_win_rates_team ON team_map_win_rates(team_key, as_of_date);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def slugify(value: str) -> str:
    lowered = value.casefold().strip()
    lowered = re.sub(r"[^a-z0-9]+", "_", lowered)
    return lowered.strip("_") or "unknown"


def parse_int(value: object) -> Optional[int]:
    if value is None:
        return None
    text = str(value)
    match = re.search(r"-?\d+", text.replace(",", ""))
    return int(match.group(0)) if match else None


def parse_float(value: object) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == "-":
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text.replace(",", ""))
    return float(match.group(0)) if match else None


def clean_join_date(value: str) -> str:
    match = re.search(r"\d{4}-\d{2}-\d{2}", value or "")
    return match.group(0) if match else (value or "")


def connect(path: Path = WAREHOUSE_PATH) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)
    ensure_hltv_player_snapshot_columns(connection)
    ensure_hltv_match_detail_columns(connection)
    return connection


def ensure_hltv_player_snapshot_columns(connection: sqlite3.Connection) -> None:
    existing_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(hltv_player_snapshots)").fetchall()
    }
    expected_columns = {
        "rating_3_0": "REAL",
        "maps_3m": "INTEGER",
        "firepower": "INTEGER",
        "entrying": "INTEGER",
        "trading": "INTEGER",
        "opening": "INTEGER",
        "clutching": "INTEGER",
        "sniping": "INTEGER",
        "utility": "INTEGER",
    }
    for column_name, column_type in expected_columns.items():
        if column_name not in existing_columns:
            connection.execute(f"ALTER TABLE hltv_player_snapshots ADD COLUMN {column_name} {column_type}")


def ensure_hltv_match_detail_columns(connection: sqlite3.Connection) -> None:
    result_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(hltv_result_matches)").fetchall()
    }
    result_expected = {
        "team1_rank": "INTEGER",
        "team2_rank": "INTEGER",
        "winner_team_id": "INTEGER",
        "status": "TEXT",
        "format_location": "TEXT",
        "liquipedia_source_title": "TEXT",
        "liquipedia_event_source_title": "TEXT",
        "liquipedia_event_tier": "TEXT",
        "liquipedia_publisher_tier": "TEXT",
        "liquipedia_stage_name": "TEXT",
        "liquipedia_round_name": "TEXT",
        "liquipedia_match_section": "TEXT",
        "liquipedia_bracket_type": "TEXT",
        "liquipedia_bracket_id": "TEXT",
        "liquipedia_bracket_slot": "TEXT",
        "liquipedia_bracket_group": "TEXT",
        "match_phase": "TEXT",
        "is_playoff": "INTEGER",
        "is_elimination_match": "INTEGER",
        "has_scorebot": "INTEGER",
        "hltv_fetched_at_utc": "TEXT",
    }
    for column_name, column_type in result_expected.items():
        if column_name not in result_columns:
            connection.execute(f"ALTER TABLE hltv_result_matches ADD COLUMN {column_name} {column_type}")
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_hltv_result_matches_phase ON hltv_result_matches(match_phase, match_date)"
    )

    veto_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(hltv_match_vetoes)").fetchall()
    }
    if "hltv_team_id" not in veto_columns:
        connection.execute("ALTER TABLE hltv_match_vetoes ADD COLUMN hltv_team_id INTEGER")

    stage_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(team_event_stage_results)").fetchall()
    }
    if "liquipedia_event_source_title" not in stage_columns:
        connection.execute(
            "ALTER TABLE team_event_stage_results ADD COLUMN liquipedia_event_source_title TEXT"
        )


def upsert_team(connection: sqlite3.Connection, name: str, source: str) -> str:
    team_key = slugify(name)
    now = utc_now()
    connection.execute(
        """
        INSERT INTO teams(team_key, display_name, created_at_utc)
        VALUES (?, ?, ?)
        ON CONFLICT(team_key) DO UPDATE SET display_name = excluded.display_name
        """,
        (team_key, name, now),
    )
    connection.execute(
        """
        INSERT INTO team_aliases(alias, team_key, source)
        VALUES (?, ?, ?)
        ON CONFLICT(alias) DO UPDATE SET team_key = excluded.team_key, source = excluded.source
        """,
        (name.casefold(), team_key, source),
    )
    return team_key


def upsert_player(
    connection: sqlite3.Connection,
    display_name: str,
    *,
    source: str,
    real_name: Optional[str] = None,
    hltv_player_id: Optional[int] = None,
    liquipedia_href: Optional[str] = None,
) -> str:
    player_key = f"hltv_{hltv_player_id}" if hltv_player_id else slugify(display_name)
    now = utc_now()
    connection.execute(
        """
        INSERT INTO players(player_key, display_name, real_name, hltv_player_id, liquipedia_href, created_at_utc)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_key) DO UPDATE SET
            display_name = excluded.display_name,
            real_name = COALESCE(excluded.real_name, players.real_name),
            hltv_player_id = COALESCE(excluded.hltv_player_id, players.hltv_player_id),
            liquipedia_href = COALESCE(excluded.liquipedia_href, players.liquipedia_href)
        """,
        (player_key, display_name, real_name, hltv_player_id, liquipedia_href, now),
    )
    connection.execute(
        """
        INSERT INTO player_aliases(alias, player_key, source)
        VALUES (?, ?, ?)
        ON CONFLICT(alias) DO UPDATE SET player_key = excluded.player_key, source = excluded.source
        """,
        (display_name.casefold(), player_key, source),
    )
    return player_key


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists() or not path.read_text(encoding="utf-8").strip():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_valve_rankings(connection: sqlite3.Connection, path: Path = BRONZE_ROOT / "valve_rankings.csv") -> int:
    rows = read_csv(path)
    for row in rows:
        team_key = upsert_team(connection, row["team_name"], "valve_vrs")
        connection.execute(
            """
            INSERT OR REPLACE INTO valve_rankings(
                ranking_date, region, rank, points, team_key, team_name, roster_names,
                roster_size, details_relative_path
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["ranking_date"],
                row["region"],
                parse_int(row["rank"]),
                parse_float(row["points"]),
                team_key,
                row["team_name"],
                row.get("roster_names"),
                parse_int(row.get("roster_size")),
                row.get("details_relative_path"),
            ),
        )
    return len(rows)


def load_valve_match_factors(
    connection: sqlite3.Connection,
    path: Path = BRONZE_ROOT / "valve_roster_match_factors.csv",
) -> int:
    rows = read_csv(path)
    for row in rows:
        team_key = upsert_team(connection, row["team_name"], "valve_vrs")
        connection.execute(
            """
            INSERT OR REPLACE INTO valve_roster_match_factors(
                ranking_date, team_key, team_name, match_id, match_sequence, match_date,
                opponent_name, result, age_weight, event_weight, bounty_collected,
                opponent_network, lan_wins, head_to_head_adjustment, roster_names
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["ranking_date"],
                team_key,
                row["team_name"],
                row["match_id"],
                parse_int(row.get("match_sequence")),
                row.get("match_date"),
                row.get("opponent_name"),
                row.get("result"),
                parse_float(row.get("age_weight")),
                row.get("event_weight"),
                row.get("bounty_collected"),
                row.get("opponent_network"),
                row.get("lan_wins"),
                parse_float(row.get("head_to_head_adjustment")),
                row.get("roster_names"),
            ),
        )
    return len(rows)


def load_liquipedia_matches(
    connection: sqlite3.Connection,
    path: Path = BRONZE_ROOT / "liquipedia_team_matches.csv",
) -> int:
    rows = read_csv(path)
    for row in rows:
        team_key = upsert_team(connection, row["team_name"], "liquipedia")
        connection.execute(
            """
            INSERT OR REPLACE INTO liquipedia_matches(
                team_key, team_name, match_timestamp, match_date_text, tier, match_type,
                tournament_name, tournament_href, result_label, score_text,
                opponent_name, opponent_href, page_title, coverage_start, coverage_end, vod_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                team_key,
                row["team_name"],
                parse_int(row.get("match_timestamp")),
                row.get("match_date_text"),
                row.get("tier"),
                row.get("match_type"),
                row.get("tournament_name"),
                row.get("tournament_href"),
                row.get("result_label"),
                row.get("score_text"),
                row.get("opponent_name"),
                row.get("opponent_href"),
                row.get("page_title"),
                row.get("coverage_start"),
                row.get("coverage_end"),
                parse_int(row.get("vod_count")),
            ),
        )
    return len(rows)


def load_liquipedia_rosters(
    connection: sqlite3.Connection,
    path: Path = BRONZE_ROOT / "liquipedia_team_rosters.csv",
) -> int:
    rows = read_csv(path)
    for row in rows:
        team_key = upsert_team(connection, row["team_name"], "liquipedia")
        player_key = upsert_player(
            connection,
            row["player_handle"],
            source="liquipedia",
            real_name=row.get("player_real_name"),
            liquipedia_href=row.get("player_href"),
        )
        connection.execute(
            """
            INSERT OR REPLACE INTO liquipedia_rosters(
                team_key, team_name, player_key, player_handle, player_real_name,
                player_href, role, join_date, page_title
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                team_key,
                row["team_name"],
                player_key,
                row["player_handle"],
                row.get("player_real_name"),
                row.get("player_href"),
                row.get("role"),
                clean_join_date(row.get("join_date", "")),
                row.get("page_title"),
            ),
        )
    return len(rows)


def load_hltv_team_rankings(
    connection: sqlite3.Connection,
    path: Path = BRONZE_ROOT / "hltv_team_rankings_2026_06_01_top200.csv",
    snapshot_date: str = "2026-06-01",
) -> int:
    if not path.exists():
        path = BRONZE_ROOT / "hltv_team_rankings_2026_06_01_top40.csv"
    rows = read_csv(path)
    for row in rows:
        team_key = upsert_team(connection, row["team_name"], "hltv")
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_team_rankings(
                snapshot_date, rank, points, team_key, team_name, rank_change_text,
                team_href, details_href, player_names, player_hrefs
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_date,
                parse_int(row.get("rank")),
                parse_int(row.get("points_text")),
                team_key,
                row["team_name"],
                row.get("rank_change_text"),
                row.get("team_href"),
                row.get("details_href"),
                row.get("player_names"),
                row.get("player_hrefs"),
            ),
        )

        player_names = [item.strip() for item in row.get("player_names", "").split(",") if item.strip()]
        player_hrefs = [item.strip() for item in row.get("player_hrefs", "").split(",") if item.strip()]
        for player_name, player_href in zip(player_names, player_hrefs):
            player_id = parse_int(player_href)
            if player_id is None:
                continue
            upsert_player(connection, player_name, source="hltv", hltv_player_id=player_id)
            connection.execute(
                """
                INSERT INTO hltv_player_queue(
                    hltv_player_id, player_name, player_href, discovered_from,
                    priority_rank, updated_at_utc
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(hltv_player_id) DO UPDATE SET
                    player_name = excluded.player_name,
                    player_href = excluded.player_href,
                    priority_rank = MIN(hltv_player_queue.priority_rank, excluded.priority_rank),
                    updated_at_utc = excluded.updated_at_utc
                """,
                (
                    player_id,
                    player_name,
                    player_href,
                    f"hltv_team_rankings:{snapshot_date}",
                    parse_int(row.get("rank")),
                    utc_now(),
                ),
            )
    return len(rows)


def load_map_pool_snapshots(
    connection: sqlite3.Connection,
    path: Path = BRONZE_ROOT / "map_pool_snapshots.csv",
) -> int:
    rows = read_csv(path)
    for row in rows:
        connection.execute(
            """
            INSERT OR REPLACE INTO map_pool_snapshots(
                snapshot_date, map_name, status, source, notes
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                row["snapshot_date"],
                row["map_name"],
                row["status"],
                row["source"],
                row.get("notes"),
            ),
        )
    return len(rows)


def load_hltv_result_matches(
    connection: sqlite3.Connection,
    path: Path = BRONZE_ROOT / "hltv_result_matches.csv",
) -> int:
    rows = read_csv(path)
    for row in rows:
        team1_key = upsert_team(connection, row["team1_name"], "hltv") if row.get("team1_name") else None
        team2_key = upsert_team(connection, row["team2_name"], "hltv") if row.get("team2_name") else None
        winner_team_key = None
        if row.get("winner_team_name"):
            winner_team_key = upsert_team(connection, row["winner_team_name"], "hltv")
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_result_matches(
                match_id, match_url, match_date, match_timestamp, event_name, event_id,
                team1_key, team1_name, team1_id, team2_key, team2_name, team2_id,
                team1_score, team2_score, winner_team_key, format,
                liquipedia_source_title, liquipedia_event_source_title,
                liquipedia_event_tier, liquipedia_publisher_tier,
                liquipedia_stage_name, liquipedia_round_name, liquipedia_match_section,
                liquipedia_bracket_type, liquipedia_bracket_id, liquipedia_bracket_slot,
                liquipedia_bracket_group, match_phase, is_playoff, is_elimination_match,
                stars, source, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                parse_int(row["match_id"]),
                row["match_url"],
                row.get("match_date"),
                parse_int(row.get("match_timestamp")),
                row.get("event_name"),
                parse_int(row.get("event_id")),
                team1_key,
                row.get("team1_name"),
                parse_int(row.get("team1_id")),
                team2_key,
                row.get("team2_name"),
                parse_int(row.get("team2_id")),
                parse_int(row.get("team1_score")),
                parse_int(row.get("team2_score")),
                winner_team_key,
                row.get("format"),
                row.get("liquipedia_source_title"),
                row.get("liquipedia_event_source_title"),
                row.get("liquipedia_event_tier"),
                row.get("liquipedia_publisher_tier"),
                row.get("liquipedia_stage_name"),
                row.get("liquipedia_round_name"),
                row.get("liquipedia_match_section"),
                row.get("liquipedia_bracket_type"),
                row.get("liquipedia_bracket_id"),
                row.get("liquipedia_bracket_slot"),
                row.get("liquipedia_bracket_group"),
                row.get("match_phase"),
                parse_int(row.get("is_playoff")),
                parse_int(row.get("is_elimination_match")),
                parse_int(row.get("stars")),
                row.get("source") or "hltv",
                row.get("raw_json"),
            ),
        )
    return len(rows)


def load_liquipedia_events(
    connection: sqlite3.Connection,
    path: Path = BRONZE_ROOT / "liquipedia_events.csv",
) -> int:
    rows = read_csv(path)
    for row in rows:
        connection.execute(
            """
            INSERT OR REPLACE INTO liquipedia_events(
                source_title, event_name, event_tier, publisher_tier, event_type,
                organizer, series, start_date, end_date, prizepool_usd,
                country, city, venue, team_count, map_pool, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["source_title"],
                row.get("event_name"),
                row.get("event_tier"),
                row.get("publisher_tier"),
                row.get("event_type"),
                row.get("organizer"),
                row.get("series"),
                row.get("start_date"),
                row.get("end_date"),
                parse_float(row.get("prizepool_usd")),
                row.get("country"),
                row.get("city"),
                row.get("venue"),
                parse_int(row.get("team_count")),
                row.get("map_pool"),
                row.get("raw_json"),
            ),
        )
    return len(rows)


def load_hltv_match_maps(
    connection: sqlite3.Connection,
    path: Path = BRONZE_ROOT / "hltv_match_maps.csv",
) -> int:
    rows = read_csv(path)
    for row in rows:
        winner_team_key = None
        if row.get("winner_team_name"):
            winner_team_key = upsert_team(connection, row["winner_team_name"], "hltv")
        picked_by_team_key = None
        if row.get("picked_by_team_name"):
            picked_by_team_key = upsert_team(connection, row["picked_by_team_name"], "hltv")
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
                parse_int(row["match_id"]),
                parse_int(row["map_index"]),
                row["map_name"],
                row.get("team1_name"),
                row.get("team2_name"),
                parse_int(row.get("team1_score")),
                parse_int(row.get("team2_score")),
                winner_team_key,
                row.get("winner_team_name"),
                parse_int(row.get("stats_id")),
                picked_by_team_key,
                row.get("picked_by_team_name"),
                row.get("raw_json"),
            ),
        )
    return len(rows)


def load_hltv_match_vetoes(
    connection: sqlite3.Connection,
    path: Path = BRONZE_ROOT / "hltv_match_vetoes.csv",
) -> int:
    rows = read_csv(path)
    for row in rows:
        team_key = None
        if row.get("team_name"):
            team_key = upsert_team(connection, row["team_name"], "hltv")
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_match_vetoes(
                match_id, veto_index, team_key, team_name, map_name, action, raw_text
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                parse_int(row["match_id"]),
                parse_int(row["veto_index"]),
                team_key,
                row.get("team_name"),
                row.get("map_name"),
                row["action"],
                row.get("raw_text"),
            ),
        )
    return len(rows)


def rebuild_team_map_win_rates(
    connection: sqlite3.Connection,
    *,
    as_of_date: str,
    source: str = "hltv",
) -> int:
    connection.execute(
        "DELETE FROM team_map_win_rates WHERE as_of_date = ? AND source = ?",
        (as_of_date, source),
    )
    rows = connection.execute(
        """
        WITH team_maps AS (
            SELECT
                r.match_date,
                r.team1_key AS team_key,
                r.team1_name AS team_name,
                mm.map_name,
                CASE WHEN mm.winner_team_key = r.team1_key THEN 1 ELSE 0 END AS won,
                CASE
                    WHEN mm.team1_score IS NOT NULL AND mm.team2_score IS NOT NULL
                    THEN mm.team1_score - mm.team2_score
                END AS round_diff
            FROM hltv_match_maps mm
            JOIN hltv_result_matches r ON r.match_id = mm.match_id
            WHERE r.team1_key IS NOT NULL AND mm.map_name NOT IN ('Default', 'TBA')
            UNION ALL
            SELECT
                r.match_date,
                r.team2_key AS team_key,
                r.team2_name AS team_name,
                mm.map_name,
                CASE WHEN mm.winner_team_key = r.team2_key THEN 1 ELSE 0 END AS won,
                CASE
                    WHEN mm.team1_score IS NOT NULL AND mm.team2_score IS NOT NULL
                    THEN mm.team2_score - mm.team1_score
                END AS round_diff
            FROM hltv_match_maps mm
            JOIN hltv_result_matches r ON r.match_id = mm.match_id
            WHERE r.team2_key IS NOT NULL AND mm.map_name NOT IN ('Default', 'TBA')
        )
        SELECT
            m.team_key,
            COALESCE(MAX(t.display_name), MAX(m.team_name)) AS team_name,
            map_name,
            COUNT(*) AS matches,
            SUM(won) AS wins,
            COUNT(*) - SUM(won) AS losses,
            CAST(SUM(won) AS REAL) / COUNT(*) AS win_rate,
            AVG(round_diff) AS avg_round_diff,
            MIN(match_date) AS sample_start_date,
            MAX(match_date) AS sample_end_date
        FROM team_maps m
        LEFT JOIN teams t ON t.team_key = m.team_key
        GROUP BY m.team_key, map_name
        """,
    ).fetchall()
    for row in rows:
        connection.execute(
            """
            INSERT OR REPLACE INTO team_map_win_rates(
                as_of_date, source, team_key, team_name, map_name, opponent_filter,
                matches, wins, losses, win_rate, avg_round_diff, sample_start_date, sample_end_date
            )
            VALUES (?, ?, ?, ?, ?, 'all', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                as_of_date,
                source,
                row["team_key"],
                row["team_name"],
                row["map_name"],
                row["matches"],
                row["wins"],
                row["losses"],
                row["win_rate"],
                row["avg_round_diff"],
                row["sample_start_date"],
                row["sample_end_date"],
            ),
        )
    return len(rows)


def rebuild_team_event_stage_results(
    connection: sqlite3.Connection,
    *,
    as_of_date: str,
    source: str = "hltv",
) -> int:
    connection.execute(
        "DELETE FROM team_event_stage_results WHERE as_of_date = ? AND source = ?",
        (as_of_date, source),
    )
    rows = connection.execute(
        """
        WITH map_sides AS (
            SELECT
                r.match_id,
                r.team1_key AS team_key,
                SUM(CASE WHEN mm.winner_team_key = r.team1_key THEN 1 ELSE 0 END) AS map_wins,
                SUM(CASE WHEN mm.winner_team_key = r.team2_key THEN 1 ELSE 0 END) AS map_losses
            FROM hltv_result_matches r
            LEFT JOIN hltv_match_maps mm ON mm.match_id = r.match_id
                AND mm.map_name NOT IN ('TBA', 'Default')
                AND mm.winner_team_key IS NOT NULL
            GROUP BY r.match_id, r.team1_key
            UNION ALL
            SELECT
                r.match_id,
                r.team2_key AS team_key,
                SUM(CASE WHEN mm.winner_team_key = r.team2_key THEN 1 ELSE 0 END) AS map_wins,
                SUM(CASE WHEN mm.winner_team_key = r.team1_key THEN 1 ELSE 0 END) AS map_losses
            FROM hltv_result_matches r
            LEFT JOIN hltv_match_maps mm ON mm.match_id = r.match_id
                AND mm.map_name NOT IN ('TBA', 'Default')
                AND mm.winner_team_key IS NOT NULL
            GROUP BY r.match_id, r.team2_key
        ),
        team_matches AS (
            SELECT
                r.match_id,
                COALESCE(r.event_name, 'unknown') AS event_name,
                COALESCE(r.liquipedia_source_title, '') AS liquipedia_source_title,
                COALESCE(r.liquipedia_event_source_title, r.liquipedia_source_title, '') AS liquipedia_event_source_title,
                r.team1_key AS team_key,
                r.team1_name AS team_name,
                COALESCE(r.liquipedia_stage_name, 'unknown') AS stage_name,
                COALESCE(r.liquipedia_round_name, 'unknown') AS round_name,
                COALESCE(r.match_phase, 'unknown') AS match_phase,
                r.match_date,
                CASE WHEN r.winner_team_key = r.team1_key THEN 1 ELSE 0 END AS series_win,
                CASE WHEN r.winner_team_key IS NOT NULL AND r.winner_team_key != r.team1_key THEN 1 ELSE 0 END AS series_loss,
                COALESCE(ms.map_wins, 0) AS map_wins,
                COALESCE(ms.map_losses, 0) AS map_losses
            FROM hltv_result_matches r
            LEFT JOIN map_sides ms ON ms.match_id = r.match_id AND ms.team_key = r.team1_key
            WHERE r.team1_key IS NOT NULL AND r.team2_key IS NOT NULL AND r.winner_team_key IS NOT NULL
            UNION ALL
            SELECT
                r.match_id,
                COALESCE(r.event_name, 'unknown') AS event_name,
                COALESCE(r.liquipedia_source_title, '') AS liquipedia_source_title,
                COALESCE(r.liquipedia_event_source_title, r.liquipedia_source_title, '') AS liquipedia_event_source_title,
                r.team2_key AS team_key,
                r.team2_name AS team_name,
                COALESCE(r.liquipedia_stage_name, 'unknown') AS stage_name,
                COALESCE(r.liquipedia_round_name, 'unknown') AS round_name,
                COALESCE(r.match_phase, 'unknown') AS match_phase,
                r.match_date,
                CASE WHEN r.winner_team_key = r.team2_key THEN 1 ELSE 0 END AS series_win,
                CASE WHEN r.winner_team_key IS NOT NULL AND r.winner_team_key != r.team2_key THEN 1 ELSE 0 END AS series_loss,
                COALESCE(ms.map_wins, 0) AS map_wins,
                COALESCE(ms.map_losses, 0) AS map_losses
            FROM hltv_result_matches r
            LEFT JOIN map_sides ms ON ms.match_id = r.match_id AND ms.team_key = r.team2_key
            WHERE r.team1_key IS NOT NULL AND r.team2_key IS NOT NULL AND r.winner_team_key IS NOT NULL
        )
        SELECT
            event_name,
            liquipedia_source_title,
            liquipedia_event_source_title,
            tm.team_key,
            COALESCE(MAX(t.display_name), MAX(tm.team_name)) AS team_name,
            stage_name,
            round_name,
            match_phase,
            COUNT(*) AS matches,
            SUM(series_win) AS series_wins,
            SUM(series_loss) AS series_losses,
            SUM(map_wins) AS map_wins,
            SUM(map_losses) AS map_losses,
            MIN(match_date) AS first_match_date,
            MAX(match_date) AS last_match_date
        FROM team_matches tm
        LEFT JOIN teams t ON t.team_key = tm.team_key
        GROUP BY event_name, liquipedia_source_title, liquipedia_event_source_title, tm.team_key, stage_name, round_name, match_phase
        """,
    ).fetchall()
    for row in rows:
        connection.execute(
            """
            INSERT OR REPLACE INTO team_event_stage_results(
                as_of_date, source, event_name, liquipedia_source_title,
                liquipedia_event_source_title, team_key,
                team_name, stage_name, round_name, match_phase, matches,
                series_wins, series_losses, map_wins, map_losses,
                first_match_date, last_match_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                as_of_date,
                source,
                row["event_name"],
                row["liquipedia_source_title"],
                row["liquipedia_event_source_title"],
                row["team_key"],
                row["team_name"],
                row["stage_name"],
                row["round_name"],
                row["match_phase"],
                row["matches"],
                row["series_wins"],
                row["series_losses"],
                row["map_wins"],
                row["map_losses"],
                row["first_match_date"],
                row["last_match_date"],
            ),
        )
    return len(rows)


def rebuild_team_phase_performance(
    connection: sqlite3.Connection,
    *,
    as_of_date: str,
    source: str = "hltv",
) -> int:
    connection.execute(
        "DELETE FROM team_phase_performance WHERE as_of_date = ? AND source = ?",
        (as_of_date, source),
    )
    rows = connection.execute(
        """
        SELECT
            tp.team_key,
            COALESCE(MAX(t.display_name), MAX(tp.team_name)) AS team_name,
            match_phase,
            SUM(matches) AS matches,
            SUM(series_wins) AS series_wins,
            SUM(series_losses) AS series_losses,
            CAST(SUM(series_wins) AS REAL) / SUM(matches) AS series_win_rate,
            SUM(map_wins) AS map_wins,
            SUM(map_losses) AS map_losses,
            CASE
                WHEN SUM(map_wins) + SUM(map_losses) > 0
                THEN CAST(SUM(map_wins) AS REAL) / (SUM(map_wins) + SUM(map_losses))
            END AS map_win_rate,
            MIN(first_match_date) AS first_match_date,
            MAX(last_match_date) AS last_match_date
        FROM team_event_stage_results tp
        LEFT JOIN teams t ON t.team_key = tp.team_key
        WHERE as_of_date = ? AND source = ?
        GROUP BY tp.team_key, match_phase
        """,
        (as_of_date, source),
    ).fetchall()
    for row in rows:
        connection.execute(
            """
            INSERT OR REPLACE INTO team_phase_performance(
                as_of_date, source, team_key, team_name, match_phase, matches,
                series_wins, series_losses, series_win_rate, map_wins, map_losses,
                map_win_rate, first_match_date, last_match_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                as_of_date,
                source,
                row["team_key"],
                row["team_name"],
                row["match_phase"],
                row["matches"],
                row["series_wins"],
                row["series_losses"],
                row["series_win_rate"],
                row["map_wins"],
                row["map_losses"],
                row["map_win_rate"],
                row["first_match_date"],
                row["last_match_date"],
            ),
        )
    return len(rows)


def seed_collection_queue_for_vrs_top(
    connection: sqlite3.Connection,
    *,
    latest_date: Optional[str] = None,
    top_n: int = 200,
) -> int:
    if latest_date is None:
        latest_date = connection.execute(
            "SELECT MAX(ranking_date) FROM valve_rankings WHERE region = 'global'"
        ).fetchone()[0]
    rows = connection.execute(
        """
        SELECT rank, team_name, details_relative_path
        FROM valve_rankings
        WHERE ranking_date = ? AND region = 'global' AND rank <= ?
        ORDER BY rank
        """,
        (latest_date, top_n),
    ).fetchall()

    now = utc_now()
    for row in rows:
        team_key = upsert_team(connection, row["team_name"], "valve_vrs")
        for entity_type, suffix in (("liquipedia_team_matches", "/Matches"), ("liquipedia_team_roster", "")):
            connection.execute(
                """
                INSERT OR IGNORE INTO collection_queue(
                    source, entity_type, entity_key, url_or_title, priority, updated_at_utc
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                ("liquipedia", entity_type, team_key, f"{row['team_name']}{suffix}", int(row["rank"]), now),
            )
        if row["details_relative_path"]:
            connection.execute(
                """
                INSERT OR IGNORE INTO collection_queue(
                    source, entity_type, entity_key, url_or_title, priority, updated_at_utc
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                ("valve_vrs", "team_detail", team_key, row["details_relative_path"], int(row["rank"]), now),
            )
    return len(rows)


def load_all_bronze(connection: sqlite3.Connection, *, as_of_date: Optional[str] = None) -> dict[str, int]:
    counts = {
        "valve_rankings": load_valve_rankings(connection),
        "valve_roster_match_factors": load_valve_match_factors(connection),
        "liquipedia_matches": load_liquipedia_matches(connection),
        "liquipedia_rosters": load_liquipedia_rosters(connection),
        "hltv_team_rankings": load_hltv_team_rankings(connection),
        "liquipedia_events": load_liquipedia_events(connection),
        "map_pool_snapshots": load_map_pool_snapshots(connection),
        "hltv_result_matches": load_hltv_result_matches(connection),
        "hltv_match_maps": load_hltv_match_maps(connection),
        "hltv_match_vetoes": load_hltv_match_vetoes(connection),
    }
    effective_as_of_date = as_of_date or datetime.now(timezone.utc).date().isoformat()
    rebuild_team_map_win_rates(
        connection,
        as_of_date=effective_as_of_date,
    )
    rebuild_team_event_stage_results(connection, as_of_date=effective_as_of_date)
    rebuild_team_phase_performance(connection, as_of_date=effective_as_of_date)
    seed_collection_queue_for_vrs_top(connection, top_n=200)
    connection.commit()
    return counts


def summarize(connection: sqlite3.Connection) -> dict[str, object]:
    table_names = [
        "teams",
        "players",
        "valve_rankings",
        "valve_roster_match_factors",
        "liquipedia_matches",
        "liquipedia_rosters",
        "liquipedia_events",
        "hltv_team_rankings",
        "hltv_player_queue",
        "hltv_player_snapshots",
        "map_pool_snapshots",
        "hltv_result_matches",
        "hltv_match_maps",
        "hltv_match_vetoes",
        "hltv_match_players",
        "hltv_match_player_stats",
        "hltv_match_map_rounds",
        "hltv_player_stats_windows",
        "hltv_api_function_tests",
        "team_event_stage_results",
        "team_phase_performance",
        "team_map_win_rates",
        "collection_queue",
    ]
    counts = {
        table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in table_names
    }
    latest_vrs = connection.execute(
        "SELECT MAX(ranking_date) FROM valve_rankings WHERE region = 'global'"
    ).fetchone()[0]
    latest_hltv = connection.execute(
        "SELECT MAX(snapshot_date) FROM hltv_team_rankings"
    ).fetchone()[0]
    return {
        "warehouse_path": str(WAREHOUSE_PATH),
        "latest_vrs_global_date": latest_vrs,
        "latest_hltv_snapshot_date": latest_hltv,
        "counts": counts,
    }
