from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional, Sequence
from urllib.parse import urlencode

from lxml import html

from .http import RateLimitedHttpClient
from .storage import write_text


VALVE_API_ROOT = "https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/contents"
VALVE_RAW_ROOT = "https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/main"
LIQUIPEDIA_API_ROOT = "https://liquipedia.net/counterstrike/api.php"


def _compact_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _slugify(value: str) -> str:
    lowered = value.lower().strip()
    lowered = re.sub(r"[^a-z0-9]+", "_", lowered)
    return lowered.strip("_") or "unknown"


def _extract_link_target(markdown_cell: str) -> str:
    match = re.search(r"\(([^)]+)\)", markdown_cell)
    return match.group(1) if match else ""


def _strip_tag_text(node: html.HtmlElement) -> str:
    return _compact_whitespace(" ".join(node.itertext()))


@dataclass(frozen=True)
class ValveStandingFile:
    path: str
    download_url: str
    region: str
    ranking_date: date


@dataclass(frozen=True)
class LiquipediaPage:
    title: str
    html_text: str


class ValveCollector:
    def __init__(self, client: RateLimitedHttpClient) -> None:
        self.client = client

    def list_standing_files(self, years: Sequence[int]) -> List[ValveStandingFile]:
        pattern = re.compile(
            r"standings_(?P<region>[a-z]+)_(?P<year>\d{4})_(?P<month>\d{2})_(?P<day>\d{2})\.md$"
        )
        files: List[ValveStandingFile] = []

        for year in years:
            url = f"{VALVE_API_ROOT}/live/{year}"
            listing = self.client.get_json(url, bucket="github_api", min_interval_seconds=0.3)
            for item in listing:
                if item.get("type") != "file":
                    continue
                name = item.get("name", "")
                match = pattern.match(name)
                if not match:
                    continue
                files.append(
                    ValveStandingFile(
                        path=item["path"],
                        download_url=item["download_url"],
                        region=match.group("region"),
                        ranking_date=date(
                            int(match.group("year")),
                            int(match.group("month")),
                            int(match.group("day")),
                        ),
                    )
                )

        files.sort(key=lambda item: (item.ranking_date, item.region, item.path))
        return files

    def fetch_standing_markdown(self, standing_file: ValveStandingFile, raw_root: Path) -> str:
        text = self.client.get_text(
            standing_file.download_url,
            bucket="github_raw",
            min_interval_seconds=0.1,
        )
        raw_path = raw_root / standing_file.path.replace("/", "__")
        write_text(raw_path, text)
        return text

    def parse_standing_markdown(self, markdown_text: str, standing_file: ValveStandingFile) -> List[Dict[str, object]]:
        rows: List[Dict[str, object]] = []
        for line in markdown_text.splitlines():
            if not line.startswith("|"):
                continue
            stripped = line.strip()
            if stripped.startswith("| Standing") or stripped.startswith("| :-"):
                continue

            columns = [part.strip() for part in stripped.strip("|").split("|")]
            if len(columns) < 5:
                continue

            try:
                rank = int(columns[0])
                points = int(columns[1])
            except ValueError:
                continue

            roster_names = [name.strip() for name in columns[3].split(",") if name.strip()]
            details_rel = _extract_link_target(columns[4])
            rows.append(
                {
                    "source": "valve_vrs",
                    "ranking_date": standing_file.ranking_date.isoformat(),
                    "region": standing_file.region,
                    "rank": rank,
                    "points": points,
                    "team_name": columns[2],
                    "roster_names": ", ".join(roster_names),
                    "roster_size": len(roster_names),
                    "details_relative_path": details_rel,
                }
            )
        return rows

    def fetch_detail_markdown(
        self,
        standing_file: ValveStandingFile,
        details_relative_path: str,
        raw_root: Path,
    ) -> str:
        year = standing_file.ranking_date.year
        details_path = f"live/{year}/{details_relative_path}"
        url = f"{VALVE_RAW_ROOT}/{details_path}"
        text = self.client.get_text(url, bucket="github_raw", min_interval_seconds=0.1)
        raw_path = raw_root / details_path.replace("/", "__")
        write_text(raw_path, text)
        return text

    def parse_detail_markdown(
        self,
        markdown_text: str,
        *,
        ranking_date: date,
        team_name: str,
    ) -> List[Dict[str, object]]:
        rows: List[Dict[str, object]] = []
        in_table = False
        for line in markdown_text.splitlines():
            if line.startswith("| Match Played"):
                in_table = True
                continue
            if in_table and not line.startswith("|"):
                break
            if in_table:
                stripped = line.strip()
                if stripped.startswith("| -:") or stripped.startswith("| Match Played"):
                    continue
                columns = [part.strip() for part in stripped.strip("|").split("|")]
                if len(columns) < 12:
                    continue
                rows.append(
                    {
                        "source": "valve_vrs",
                        "ranking_date": ranking_date.isoformat(),
                        "team_name": team_name,
                        "match_sequence": columns[0],
                        "match_id": columns[1],
                        "match_date": columns[2],
                        "opponent_name": columns[3],
                        "result": columns[4],
                        "age_weight": columns[5],
                        "event_weight": columns[6],
                        "bounty_collected": columns[7],
                        "opponent_network": columns[8],
                        "lan_wins": columns[9],
                        "head_to_head_adjustment": columns[10],
                        "roster_names": columns[11],
                    }
                )
        return rows


class LiquipediaCollector:
    def __init__(self, client: RateLimitedHttpClient) -> None:
        self.client = client
        self._title_cache: Dict[str, str] = {}

    def _build_api_url(self, params: Dict[str, str]) -> str:
        return f"{LIQUIPEDIA_API_ROOT}?{urlencode(params)}"

    def find_team_title(self, team_name: str) -> Optional[str]:
        cache_key = team_name.casefold()
        if cache_key in self._title_cache:
            return self._title_cache[cache_key]

        url = self._build_api_url(
            {
                "action": "opensearch",
                "format": "json",
                "search": team_name,
                "limit": "10",
                "namespace": "0",
            }
        )
        payload = self.client.get_json(
            url,
            bucket="liquipedia_search",
            min_interval_seconds=2.1,
        )
        candidates = payload[1] if isinstance(payload, list) and len(payload) > 1 else []
        normalized = team_name.casefold()
        pages_with_endpoints = {
            candidate.split("/", 1)[0]
            for candidate in candidates
            if "/Matches" in candidate or "/Results" in candidate
        }

        preferred: Optional[str] = None
        exact_matches = [candidate for candidate in candidates if candidate.casefold() == normalized]
        for candidate in exact_matches:
            if candidate in pages_with_endpoints:
                preferred = candidate
                break

        if preferred is None and not team_name.casefold().startswith("team "):
            team_prefixed = self.find_team_title(f"Team {team_name}")
            if team_prefixed:
                preferred = team_prefixed

        if preferred is None:
            for candidate in candidates:
                if candidate not in pages_with_endpoints:
                    continue
                if candidate.casefold().endswith(" academy") or candidate.casefold().endswith(" junior"):
                    continue
                preferred = candidate
                break

        if preferred:
            self._title_cache[cache_key] = preferred
        return preferred

    def fetch_parsed_page(self, title: str, raw_root: Path) -> LiquipediaPage:
        url = self._build_api_url(
            {
                "action": "parse",
                "format": "json",
                "page": title,
            }
        )
        payload = self.client.get_json(
            url,
            bucket="liquipedia_parse",
            min_interval_seconds=30.5,
        )
        page_html = payload.get("parse", {}).get("text", {}).get("*", "")
        if not page_html:
            raise ValueError(
                f"Liquipedia parse returned empty HTML for {title}: "
                f"{json.dumps(payload)[:500]}"
            )
        raw_path = raw_root / f"{_slugify(title)}.html"
        write_text(raw_path, page_html)
        return LiquipediaPage(title=title, html_text=page_html)

    def parse_team_matches(self, page: LiquipediaPage, source_team_name: str) -> List[Dict[str, object]]:
        document = html.fromstring(page.html_text)
        summary_nodes = document.xpath("//div[@style='font-weight:bold']")
        coverage_text = _strip_tag_text(summary_nodes[0]) if summary_nodes else ""
        range_match = re.search(r"For matches between (.+) and (.+):", coverage_text)
        coverage_start = range_match.group(1) if range_match else ""
        coverage_end = range_match.group(2) if range_match else ""

        row_nodes = document.xpath("//table[contains(@class, 'table2__table')]//tr[contains(@class, 'table2__row--body')]")
        rows: List[Dict[str, object]] = []
        for row_node in row_nodes:
            cells = row_node.xpath("./td")
            if len(cells) < 10:
                continue

            date_cell = cells[0]
            tournament_cell = cells[5]
            score_label_cell = cells[6]
            score_cell = cells[7]
            opponent_cell = cells[8]

            match_timestamp = ""
            timer_nodes = date_cell.xpath(".//*[@data-timestamp]")
            if timer_nodes:
                match_timestamp = timer_nodes[0].get("data-timestamp", "")

            tournament_link = tournament_cell.xpath(".//a")
            opponent_link = opponent_cell.xpath(".//a")
            result_label_node = score_label_cell.xpath(".//*[@data-label-type]")

            rows.append(
                {
                    "source": "liquipedia",
                    "team_name": source_team_name,
                    "page_title": page.title,
                    "coverage_start": coverage_start,
                    "coverage_end": coverage_end,
                    "match_timestamp": match_timestamp,
                    "match_date_text": _strip_tag_text(date_cell),
                    "tier": _strip_tag_text(cells[1]),
                    "match_type": _strip_tag_text(cells[2]),
                    "game": _strip_tag_text(cells[3]),
                    "event_stage": _strip_tag_text(cells[4]),
                    "tournament_name": _strip_tag_text(tournament_cell),
                    "tournament_href": tournament_link[0].get("href", "") if tournament_link else "",
                    "result_label": result_label_node[0].get("data-label-type", "") if result_label_node else "",
                    "score_text": _strip_tag_text(score_cell),
                    "opponent_name": _strip_tag_text(opponent_cell),
                    "opponent_href": opponent_link[0].get("href", "") if opponent_link else "",
                    "vod_count": len(cells[9].xpath(".//a")),
                }
            )
        return rows

    def parse_team_roster(self, page: LiquipediaPage, source_team_name: str) -> List[Dict[str, object]]:
        document = html.fromstring(page.html_text)
        active_rows = document.xpath(
            (
                "//h2[@id='Player_Roster']"
                "/following::h3[@id='Active'][1]"
                "/following::table[contains(@class, 'table2__table')][1]"
                "//tr[contains(@class, 'table2__row--body')]"
            )
        )
        rows: List[Dict[str, object]] = []
        for row_node in active_rows:
            cells = row_node.xpath("./td")
            if len(cells) < 4:
                continue
            player_links = cells[0].xpath(".//a")
            handle = _compact_whitespace(player_links[0].text_content()) if player_links else _strip_tag_text(cells[0]).split()[0]
            player_href = player_links[0].get("href", "") if player_links else ""
            role_text = _strip_tag_text(cells[2])
            if role_text.casefold() == "coach":
                continue
            rows.append(
                {
                    "source": "liquipedia",
                    "team_name": source_team_name,
                    "page_title": page.title,
                    "player_handle": handle,
                    "player_display": _strip_tag_text(cells[0]),
                    "player_real_name": _strip_tag_text(cells[1]),
                    "player_href": player_href,
                    "role": role_text,
                    "join_date": _strip_tag_text(cells[3]),
                }
            )
        return rows
