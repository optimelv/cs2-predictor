from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import sqlite3
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import unquote, urlencode
from urllib.request import Request, urlopen

from lxml import html

from .paths import BRONZE_ROOT, RAW_ROOT
from .warehouse import connect, load_liquipedia_matches, slugify, summarize


LIQUIPEDIA_API_ROOT = "https://liquipedia.net/counterstrike/api.php"
USER_AGENT = "CS2PredictorDataResearch/0.1 (local research; contact: none)"


def compact_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def slugify(value: str) -> str:
    lowered = value.casefold().strip()
    lowered = re.sub(r"[^a-z0-9]+", "_", lowered)
    return lowered.strip("_") or "unknown"


def strip_text(node: html.HtmlElement) -> str:
    return compact_whitespace(" ".join(node.itertext()))


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists() or not path.read_text(encoding="utf-8").strip():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def dedupe_rows(rows: Iterable[dict[str, str]], keys: list[str]) -> list[dict[str, str]]:
    seen = set()
    output = []
    for row in rows:
        marker = tuple(row.get(key, "") for key in keys)
        if marker in seen:
            continue
        seen.add(marker)
        output.append(row)
    return output


def batched(items: list[str], batch_size: int) -> Iterable[list[str]]:
    for index in range(0, len(items), batch_size):
        yield items[index : index + batch_size]


def first_counterstrike_href(cell: html.HtmlElement) -> str:
    for link in cell.xpath(".//a"):
        href = link.get("href", "")
        if href.startswith("/counterstrike/"):
            return href
    return ""


def title_from_href(href: str) -> str:
    if not href:
        return ""
    title = href.split("/counterstrike/", 1)[-1].split("#", 1)[0]
    return unquote(title).replace("_", " ")


def latest_valve_teams(connection: sqlite3.Connection, top_n: int) -> list[str]:
    rows = connection.execute(
        """
        SELECT team_name
        FROM valve_rankings
        WHERE region = 'global'
          AND ranking_date = (
              SELECT MAX(ranking_date)
              FROM valve_rankings
              WHERE region = 'global'
          )
          AND rank <= ?
        ORDER BY rank
        """,
        (top_n,),
    ).fetchall()
    return [str(row[0]) for row in rows]


def latest_hltv_teams(connection: sqlite3.Connection, top_n: int) -> list[str]:
    rows = connection.execute(
        """
        SELECT team_name
        FROM hltv_team_rankings
        WHERE snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM hltv_team_rankings
          )
          AND rank <= ?
        ORDER BY rank
        """,
        (top_n,),
    ).fetchall()
    return [str(row[0]) for row in rows]


def ranked_team_queue(connection: sqlite3.Connection, top_n: int, ranking_source: str) -> list[str]:
    teams: list[str] = []
    if ranking_source in {"valve", "combined"}:
        teams.extend(latest_valve_teams(connection, top_n))
    if ranking_source in {"hltv", "combined"}:
        teams.extend(latest_hltv_teams(connection, top_n))
    return list(dict.fromkeys(compact_whitespace(team) for team in teams if compact_whitespace(team)))


def requested_team_history_names() -> set[str]:
    covered: set[str] = set()
    history_path = BRONZE_ROOT / "liquipedia_team_history_requested_teams.csv"
    for row in read_csv(history_path):
        team_name = compact_whitespace(row.get("team_name", ""))
        if team_name:
            covered.add(team_name)

    # Backfill coverage from older runs before the explicit history file existed.
    expanded_path = BRONZE_ROOT / "liquipedia_team_matches_expanded.csv"
    for row in read_csv(expanded_path):
        for team_name in (row.get("requested_teams", "") or "").split(", "):
            team_name = compact_whitespace(team_name)
            if team_name:
                covered.add(team_name)
    return covered


def read_requested_team_history() -> set[str]:
    return {team_name.casefold() for team_name in requested_team_history_names()}


def write_requested_team_history(teams: Iterable[str]) -> int:
    history_path = BRONZE_ROOT / "liquipedia_team_history_requested_teams.csv"
    covered = requested_team_history_names()
    covered.update(compact_whitespace(team) for team in teams if compact_whitespace(team))
    rows = [{"team_name": team} for team in sorted(covered, key=str.casefold)]
    return write_csv(history_path, rows, ["team_name"])


def filter_missing_teams(connection: sqlite3.Connection, teams: list[str]) -> list[str]:
    covered_names = {
        compact_whitespace(str(row[0]))
        for row in connection.execute(
            """
            SELECT DISTINCT team_name
            FROM liquipedia_matches
            WHERE team_name IS NOT NULL
              AND team_name != ''
            """
        ).fetchall()
        if compact_whitespace(str(row[0]))
    }
    covered_names.update(requested_team_history_names())
    covered_names.update(
        compact_whitespace(str(row[0]))
        for row in connection.execute(
            """
            SELECT alias
            FROM team_aliases
            WHERE source = 'hltv_match_detail_alias'
              AND alias IS NOT NULL
              AND alias != ''
            """
        ).fetchall()
        if compact_whitespace(str(row[0]))
    )
    covered_casefold = {team.casefold() for team in covered_names}
    covered_slugs = {slugify(team) for team in covered_names}

    def variants(team: str) -> set[str]:
        base = slugify(team)
        values = {base}
        if base.startswith("the_"):
            values.add(base.removeprefix("the_"))
        trusted = {
            "the_mongolz": "mongolz",
            "natus_vincere": "navi",
            "gamerlegion": "gl",
            "liquid": "tl",
            "vitality": "vit",
            "flyquest": "fq",
        }
        if base in trusted:
            values.add(trusted[base])
        return values

    return [
        team
        for team in teams
        if team.casefold() not in covered_casefold
        and not (variants(team) & covered_slugs)
    ]


def fetch_team_history_batch(
    teams: list[str],
    *,
    since: str,
    until: str,
    raw_root: Path,
    batch_index: int,
) -> tuple[str, str]:
    wikitext = (
        "{{Team matches table"
        f"|teams={', '.join(teams)}"
        f"|sdate={since}"
        f"|edate={until}"
        "}}"
    )
    params = {
        "action": "parse",
        "format": "json",
        "contentmodel": "wikitext",
        "text": wikitext,
        "prop": "text",
    }
    request = Request(
        f"{LIQUIPEDIA_API_ROOT}?{urlencode(params)}",
        headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"},
    )
    with urlopen(request, timeout=90) as response:
        payload = response.read()
        if response.headers.get("Content-Encoding") == "gzip":
            payload = gzip.decompress(payload)
    data = json.loads(payload.decode("utf-8"))
    page_html = data.get("parse", {}).get("text", {}).get("*", "")
    if not page_html:
        raise ValueError(f"Liquipedia parse returned empty HTML for {teams}")
    raw_root.mkdir(parents=True, exist_ok=True)
    batch_slug = f"batch_{batch_index:04d}_{slugify('_'.join(teams[:2]))}"
    (raw_root / f"{batch_slug}.html").write_text(page_html, encoding="utf-8")
    return batch_slug, page_html


def parse_team_history_html(
    page_html: str,
    *,
    batch_slug: str,
    requested_teams: list[str],
) -> list[dict[str, str]]:
    if "scribunto-error" in page_html:
        text = compact_whitespace(re.sub(r"<.*?>", " ", page_html))
        raise ValueError(text[:500] or "Liquipedia returned a parser error")

    document = html.fromstring(page_html)
    summary_nodes = document.xpath("//div[@style='font-weight:bold']")
    coverage_text = strip_text(summary_nodes[0]) if summary_nodes else ""
    range_match = re.search(r"For matches between (.+) and (.+):", coverage_text)
    coverage_start = range_match.group(1) if range_match else ""
    coverage_end = range_match.group(2) if range_match else ""

    rows: list[dict[str, str]] = []
    row_nodes = document.xpath("//table[contains(@class, 'table2__table')]//tr[contains(@class, 'table2__row--body')]")
    for row_node in row_nodes:
        cells = row_node.xpath("./td")
        if len(cells) < 12:
            continue
        timer_nodes = cells[0].xpath(".//*[@data-timestamp]")
        result_label_nodes = cells[7].xpath(".//*[@data-label-type]")
        rows.append(
            {
                "source": "liquipedia_match_history_query",
                "team_name": strip_text(cells[6]),
                "page_title": f"Team match history query/{batch_slug}",
                "coverage_start": coverage_start,
                "coverage_end": coverage_end,
                "match_timestamp": timer_nodes[0].get("data-timestamp", "") if timer_nodes else "",
                "match_date_text": strip_text(cells[0]),
                "tier": strip_text(cells[1]),
                "match_type": strip_text(cells[2]),
                "game": strip_text(cells[3]),
                "event_stage": strip_text(cells[4]),
                "tournament_name": strip_text(cells[5]),
                "tournament_href": first_counterstrike_href(cells[5]),
                "result_label": result_label_nodes[0].get("data-label-type", "") if result_label_nodes else "",
                "score_text": strip_text(cells[8]).replace("\xa0", " "),
                "opponent_name": strip_text(cells[10]),
                "opponent_href": first_counterstrike_href(cells[10]),
                "vod_count": str(len(cells[11].xpath(".//a"))),
                "requested_teams": ", ".join(requested_teams),
            }
        )
    return rows


def build_event_title_queue(match_rows: list[dict[str, str]], parsed_titles: set[str]) -> list[dict[str, str]]:
    grouped: dict[str, dict[str, object]] = {}
    for row in match_rows:
        source_title = title_from_href(row.get("tournament_href", ""))
        if not source_title:
            continue
        entry = grouped.setdefault(
            source_title,
            {
                "source_title": source_title,
                "rows_seen": 0,
                "first_match_timestamp": "",
                "last_match_timestamp": "",
                "tiers": set(),
                "teams": set(),
                "tournament_names": set(),
                "hrefs": set(),
            },
        )
        entry["rows_seen"] = int(entry["rows_seen"]) + 1
        timestamp = row.get("match_timestamp", "")
        if timestamp:
            if not entry["first_match_timestamp"] or timestamp < entry["first_match_timestamp"]:
                entry["first_match_timestamp"] = timestamp
            if not entry["last_match_timestamp"] or timestamp > entry["last_match_timestamp"]:
                entry["last_match_timestamp"] = timestamp
        entry["tiers"].add(row.get("tier", ""))
        entry["teams"].add(row.get("team_name", ""))
        entry["teams"].add(row.get("opponent_name", ""))
        entry["tournament_names"].add(row.get("tournament_name", ""))
        entry["hrefs"].add(row.get("tournament_href", ""))

    queue: list[dict[str, str]] = []
    for source_title, entry in grouped.items():
        queue.append(
            {
                "source_title": source_title,
                "rows_seen": str(entry["rows_seen"]),
                "first_match_timestamp": str(entry["first_match_timestamp"]),
                "last_match_timestamp": str(entry["last_match_timestamp"]),
                "tiers_seen": ", ".join(sorted(item for item in entry["tiers"] if item)),
                "teams_seen": ", ".join(sorted(item for item in entry["teams"] if item)[:30]),
                "tournament_names_seen": " | ".join(sorted(item for item in entry["tournament_names"] if item)[:10]),
                "hrefs_seen": " | ".join(sorted(item for item in entry["hrefs"] if item)[:10]),
                "already_parsed": "1" if source_title in parsed_titles else "0",
            }
        )
    queue.sort(
        key=lambda row: (
            row["already_parsed"],
            -int(row["rows_seen"]),
            row["source_title"],
        )
    )
    return queue


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Liquipedia team match-history batches for ranked CS2 teams.")
    parser.add_argument("--top-n", type=int, default=50)
    parser.add_argument("--ranking-source", choices=["valve", "hltv", "combined"], default="combined")
    parser.add_argument("--since", default="2025-06-08")
    parser.add_argument("--until", default=datetime.now(UTC).date().isoformat())
    parser.add_argument("--batch-size", type=int, default=5)
    parser.add_argument("--max-batches", type=int, default=0)
    parser.add_argument("--stop-after-errors", type=int, default=2)
    parser.add_argument("--only-missing-teams", action="store_true")
    parser.add_argument("--sleep-seconds", type=float, default=2.5)
    parser.add_argument("--update-main", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--load-db", action=argparse.BooleanOptionalAction, default=True)
    args = parser.parse_args()

    connection = connect()
    team_queue = ranked_team_queue(connection, args.top_n, args.ranking_source)
    if args.only_missing_teams:
        team_queue = filter_missing_teams(connection, team_queue)
    raw_root = RAW_ROOT / "liquipedia_team_history_batches"
    collected_rows: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    for batch_index, team_batch in enumerate(batched(team_queue, args.batch_size), start=1):
        if args.max_batches and batch_index > args.max_batches:
            break
        if batch_index > 1:
            time.sleep(args.sleep_seconds)
        try:
            batch_slug, page_html = fetch_team_history_batch(
                team_batch,
                since=args.since,
                until=args.until,
                raw_root=raw_root,
                batch_index=batch_index,
            )
            collected_rows.extend(
                parse_team_history_html(
                    page_html,
                    batch_slug=batch_slug,
                    requested_teams=team_batch,
                )
            )
        except Exception as exc:
            errors.append({"batch_index": str(batch_index), "teams": ", ".join(team_batch), "error": str(exc)})
            if args.stop_after_errors and len(errors) >= args.stop_after_errors:
                break

    fields = [
        "source",
        "team_name",
        "page_title",
        "coverage_start",
        "coverage_end",
        "match_timestamp",
        "match_date_text",
        "tier",
        "match_type",
        "game",
        "event_stage",
        "tournament_name",
        "tournament_href",
        "result_label",
        "score_text",
        "opponent_name",
        "opponent_href",
        "vod_count",
        "requested_teams",
    ]
    expanded_path = BRONZE_ROOT / "liquipedia_team_matches_expanded.csv"
    collected_rows = dedupe_rows(
        collected_rows,
        ["team_name", "match_timestamp", "opponent_name", "tournament_name", "score_text"],
    )
    write_csv(expanded_path, collected_rows, fields)
    successful_requested_teams = {
        team
        for row in collected_rows
        for team in (row.get("requested_teams", "") or "").split(", ")
        if compact_whitespace(team)
    }
    requested_team_history_rows = write_requested_team_history(successful_requested_teams)

    main_path = BRONZE_ROOT / "liquipedia_team_matches.csv"
    if args.update_main:
        existing_rows = read_csv(main_path)
        merged_rows = dedupe_rows(
            existing_rows + collected_rows,
            ["team_name", "match_timestamp", "opponent_name", "tournament_name", "score_text"],
        )
        main_fields = fields[:-1]
        normalized_rows = [{field: row.get(field, "") for field in main_fields} for row in merged_rows]
        write_csv(main_path, normalized_rows, main_fields)
    else:
        merged_rows = collected_rows

    parsed_titles = {
        str(row[0])
        for row in connection.execute("SELECT source_title FROM liquipedia_events").fetchall()
    }
    parsed_titles.update(
        str(row[0])
        for row in connection.execute(
            """
            SELECT DISTINCT liquipedia_source_title
            FROM hltv_result_matches
            WHERE liquipedia_source_title IS NOT NULL
              AND liquipedia_source_title != ''
            """
        ).fetchall()
    )
    queue_rows = build_event_title_queue(merged_rows, parsed_titles)
    queue_fields = [
        "source_title",
        "rows_seen",
        "first_match_timestamp",
        "last_match_timestamp",
        "tiers_seen",
        "teams_seen",
        "tournament_names_seen",
        "hrefs_seen",
        "already_parsed",
    ]
    write_csv(BRONZE_ROOT / "liquipedia_event_title_queue.csv", queue_rows, queue_fields)

    loaded_rows = 0
    if args.load_db and args.update_main:
        loaded_rows = load_liquipedia_matches(connection, main_path)
        connection.commit()

    tier_counts: defaultdict[str, int] = defaultdict(int)
    for row in collected_rows:
        tier_counts[row.get("tier", "") or "unknown"] += 1
    summary = {
        "ranking_source": args.ranking_source,
        "top_n": args.top_n,
        "teams_queued": len(team_queue),
        "batches_attempted": (len(team_queue) + args.batch_size - 1) // args.batch_size if args.batch_size else 0,
        "rows_collected": len(collected_rows),
        "rows_merged": len(merged_rows),
        "events_in_queue": len(queue_rows),
        "events_not_yet_parsed": sum(1 for row in queue_rows if row["already_parsed"] == "0"),
        "tier_counts_collected": dict(sorted(tier_counts.items())),
        "errors": errors,
        "db_rows_loaded": loaded_rows,
        "requested_team_history_rows": requested_team_history_rows,
        "warehouse_summary": summarize(connection),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
