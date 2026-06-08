from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import time
import zlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import unquote, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from dateutil import parser as date_parser

from .paths import BRONZE_ROOT, RAW_ROOT
from .warehouse import (
    connect,
    load_hltv_match_maps,
    load_hltv_match_vetoes,
    load_hltv_result_matches,
    load_liquipedia_events,
    rebuild_team_event_stage_results,
    rebuild_team_map_win_rates,
    rebuild_team_phase_performance,
    summarize,
)


LIQUIPEDIA_API_ROOT = "https://liquipedia.net/counterstrike/api.php"
USER_AGENT = "CS2PredictorDataResearch/0.1 (local research; contact: none)"
DEFAULT_TITLES = [
    "Intel Extreme Masters/2026/Cologne",
    "Intel Extreme Masters/2026/Atlanta",
    "Intel Extreme Masters/2026/Rio",
    "BLAST/Open/2026/Spring",
    "PGL/2026/Astana",
]
KNOWN_MAPS = {
    "Ancient",
    "Anubis",
    "Cache",
    "Cobblestone",
    "Dust II",
    "Dust2",
    "Inferno",
    "Mirage",
    "Nuke",
    "Overpass",
    "Train",
    "Tuscan",
    "Vertigo",
}
PHASE_ORDER = {
    "grand_final": 100,
    "final": 95,
    "semifinal": 85,
    "quarterfinal": 75,
    "round_of_16": 65,
    "round_of_32": 55,
    "playoffs": 50,
    "swiss_high": 45,
    "swiss_mid": 35,
    "swiss_low": 30,
    "swiss_round": 25,
    "group_stage": 20,
    "qualifier": 10,
    "showmatch": 5,
    "regular": 1,
    "unknown": 0,
}


def compact_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def slugify(value: str) -> str:
    lowered = value.casefold().strip()
    lowered = re.sub(r"[^a-z0-9]+", "_", lowered)
    return lowered.strip("_") or "unknown"


def parse_int(value: object) -> int | None:
    if value is None:
        return None
    text = str(value).replace(",", "").strip()
    if not text or text.upper() in {"W", "L", "FF", "DQ"}:
        return None
    match = re.search(r"-?\d+", text)
    return int(match.group(0)) if match else None


def clean_wiki_text(value: str) -> str:
    text = value or ""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = text.replace("&nbsp;", " ")
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = re.sub(r"<.*?>", "", text)
    text = re.sub(r"\[\[[^|\]]+\|([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\{\{Abbr/([^}|]+).*?\}\}", r"\1", text)
    text = re.sub(r"\{\{Flag\|([^}|]+).*?\}\}", "", text)
    text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = text.replace("'''", "").replace("''", "")
    return compact_whitespace(text)


def fetch_wikitext(title: str, raw_root: Path) -> str:
    params = {
        "action": "query",
        "format": "json",
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "titles": title,
    }
    url = f"{LIQUIPEDIA_API_ROOT}?{urlencode(params)}"
    request = Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"},
    )
    response = urlopen(request, timeout=30)
    payload = response.read()
    if response.headers.get("Content-Encoding") == "gzip":
        payload = gzip.decompress(payload)
    data = json.loads(payload.decode("utf-8"))
    page = next(iter(data.get("query", {}).get("pages", {}).values()))
    if "missing" in page:
        raise ValueError(f"Liquipedia page not found: {title}")
    resolved_title = page.get("title", title)
    revision = page.get("revisions", [{}])[0]
    text = revision.get("slots", {}).get("main", {}).get("*", "")
    if not text:
        raise ValueError(f"Liquipedia page had empty wikitext: {title}")
    raw_root.mkdir(parents=True, exist_ok=True)
    (raw_root / f"{slugify(resolved_title)}.wiki").write_text(text, encoding="utf-8")
    return text


def find_template_blocks_with_spans(text: str, template_name: str) -> list[tuple[int, int, str]]:
    blocks: list[tuple[int, int, str]] = []
    pattern = re.compile(r"\{\{\s*" + re.escape(template_name) + r"(?=[\s|}\n\r])", re.I)
    for match in pattern.finditer(text):
        start = match.start()
        depth = 0
        index = start
        while index < len(text) - 1:
            pair = text[index : index + 2]
            if pair == "{{":
                depth += 1
                index += 2
                continue
            if pair == "}}":
                depth -= 1
                index += 2
                if depth == 0:
                    blocks.append((start, index, text[start:index]))
                    break
                continue
            index += 1
    return blocks


def find_template_blocks(text: str, template_name: str) -> list[str]:
    return [block for _start, _end, block in find_template_blocks_with_spans(text, template_name)]


def split_top_level(template_text: str) -> list[str]:
    inner = template_text.strip()
    if inner.startswith("{{"):
        inner = inner[2:]
    if inner.endswith("}}"):
        inner = inner[:-2]

    parts: list[str] = []
    current: list[str] = []
    template_depth = 0
    link_depth = 0
    index = 0
    while index < len(inner):
        pair = inner[index : index + 2]
        if pair == "{{":
            template_depth += 1
            current.append(pair)
            index += 2
            continue
        if pair == "}}" and template_depth > 0:
            template_depth -= 1
            current.append(pair)
            index += 2
            continue
        if pair == "[[":
            link_depth += 1
            current.append(pair)
            index += 2
            continue
        if pair == "]]" and link_depth > 0:
            link_depth -= 1
            current.append(pair)
            index += 2
            continue
        char = inner[index]
        if char == "|" and template_depth == 0 and link_depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(char)
        index += 1
    parts.append("".join(current).strip())
    return parts


def parse_template(template_text: str) -> tuple[str, dict[str, str], list[str]]:
    parts = split_top_level(template_text)
    name = compact_whitespace(parts[0])
    params: dict[str, str] = {}
    positional: list[str] = []
    for part in parts[1:]:
        key_match = re.match(r"^\s*([A-Za-z0-9_ -]+)\s*=", part, flags=re.S)
        if key_match:
            key = compact_whitespace(key_match.group(1)).casefold()
            params[key] = part[key_match.end() :].strip()
        else:
            positional.append(part.strip())
    return name, params, positional


def parse_team_opponent(value: str) -> tuple[str, int | None]:
    if not value:
        return "", None
    team_name = clean_wiki_text(value)
    score = None
    if value.strip().startswith("{{"):
        _, params, positional = parse_template(value)
        team_name = clean_wiki_text(params.get("team") or (positional[0] if positional else ""))
        score = parse_int(params.get("score"))
    return team_name, score


def parse_date(value: str) -> tuple[str, int | None]:
    cleaned = clean_wiki_text(value)
    if not cleaned:
        return "", None
    cleaned = re.sub(r"\b(?:CEST|CET|EDT|EST|UTC|PDT|PST|CDT|CST)\b", "", cleaned)
    try:
        parsed = date_parser.parse(cleaned, fuzzy=True)
    except (ValueError, OverflowError):
        return cleaned, None
    return parsed.date().isoformat(), int(parsed.timestamp())


def score_from_map_params(params: dict[str, str], team_number: int) -> int | None:
    direct = parse_int(params.get(f"score{team_number}"))
    if direct is not None:
        return direct

    total = 0
    found = False
    base_keys = [f"t{team_number}t", f"t{team_number}ct"]
    overtime_pattern = re.compile(rf"^o\d+t{team_number}(?:t|ct)$")
    for key, value in params.items():
        normalized = key.casefold()
        if normalized in base_keys or overtime_pattern.match(normalized):
            parsed = parse_int(value)
            if parsed is not None:
                total += parsed
                found = True
    return total if found else None


def normalize_map_name(value: str) -> str:
    cleaned = clean_wiki_text(value)
    if cleaned.casefold() == "dust ii":
        return "Dust2"
    return cleaned


def source_title_stage(source_title: str) -> str:
    parts = [part for part in source_title.replace("_", " ").split("/") if part]
    if not parts:
        return ""
    tail = parts[-1]
    if re.search(r"\b(?:Stage|Playoffs|Qualifier|Final|Group|Round)\b", tail, flags=re.I):
        return clean_wiki_text(tail)
    return ""


def parent_event_source_title(source_title: str, metadata: dict[str, object]) -> str:
    if metadata.get("event_name"):
        return source_title
    parts = source_title.split("/")
    if len(parts) > 1:
        return "/".join(parts[:-1])
    return source_title


def heading_stack_at(text: str, position: int) -> list[str]:
    stack: dict[int, str] = {}
    heading_re = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$", flags=re.M)
    for match in heading_re.finditer(text[:position]):
        level = len(match.group(1))
        heading = clean_wiki_text(match.group(2))
        if not heading:
            continue
        for old_level in list(stack):
            if old_level >= level:
                stack.pop(old_level, None)
        stack[level] = heading
    return [stack[level] for level in sorted(stack)]


def nearest_stage_template(text: str, position: int) -> str:
    window = text[max(0, position - 3000) : position]
    matches = list(re.finditer(r"\{\{\s*Stage\s*\|([^|}]*)", window, flags=re.I))
    if not matches:
        return ""
    return clean_wiki_text(matches[-1].group(1))


def bracket_group_from_text(value: str) -> str:
    lowered = value.casefold()
    if re.search(r"\bhigh\b|advancement", lowered):
        return "high"
    if re.search(r"\bmid\b", lowered):
        return "mid"
    if re.search(r"\blow\b|elimination", lowered):
        return "low"
    return ""


def infer_match_phase(*values: str) -> str:
    text = " ".join(value for value in values if value).casefold()
    if "showmatch" in text:
        return "showmatch"
    if "grand final" in text or re.search(r"\bfinal\b", text):
        return "grand_final"
    if "semi" in text:
        return "semifinal"
    if "quarter" in text:
        return "quarterfinal"
    if "round of 16" in text:
        return "round_of_16"
    if "round of 32" in text:
        return "round_of_32"
    if "playoff" in text:
        return "playoffs"
    if re.search(r"\bround\s+\d+", text):
        group = bracket_group_from_text(text)
        if group:
            return f"swiss_{group}"
        return "swiss_round"
    if "group" in text:
        return "group_stage"
    if "qualifier" in text:
        return "qualifier"
    return "regular" if text else "unknown"


def is_playoff_phase(phase: str) -> int:
    return int(phase in {"grand_final", "final", "semifinal", "quarterfinal", "round_of_16", "playoffs"})


def is_elimination_phase(phase: str, round_name: str, bracket_group: str) -> int:
    if phase in {"grand_final", "final", "semifinal", "quarterfinal", "round_of_16", "round_of_32", "playoffs"}:
        return 1
    text = f"{round_name} {bracket_group}".casefold()
    return int("low" in text or "elimination" in text)


def build_container_contexts(text: str) -> list[dict[str, object]]:
    contexts: list[dict[str, object]] = []
    for template_name in ("Matchlist", "Bracket"):
        for start, end, block in find_template_blocks_with_spans(text, template_name):
            name, params, _positional = parse_template(block)
            headings = heading_stack_at(text, start)
            stage_from_heading = next(
                (
                    heading
                    for heading in reversed(headings)
                    if re.search(r"\b(?:Stage|Group|Playoff|Round|Quarter|Semi|Final|High|Low|Mid)\b", heading, flags=re.I)
                ),
                "",
            )
            bracket_title = clean_wiki_text(params.get("title", ""))
            match_section = clean_wiki_text(params.get("matchsection", ""))
            context = {
                "start": start,
                "end": end,
                "template_name": template_name.casefold(),
                "template_full_name": name,
                "bracket_id": clean_wiki_text(params.get("id", "")),
                "bracket_title": bracket_title,
                "match_section": match_section,
                "stage_template": nearest_stage_template(text, start),
                "heading_stage": stage_from_heading,
                "heading_path": " > ".join(headings),
                "params": params,
            }
            contexts.append(context)
    contexts.sort(key=lambda item: (int(item["start"]), -(int(item["end"]) - int(item["start"]))))
    return contexts


def context_for_match(
    text: str,
    source_title: str,
    match_start: int,
    match_end: int,
    match_block: str,
    containers: list[dict[str, object]],
) -> dict[str, str]:
    candidates = [
        container
        for container in containers
        if int(container["start"]) <= match_start and match_end <= int(container["end"])
    ]
    container = min(
        candidates,
        key=lambda item: int(item["end"]) - int(item["start"]),
        default={},
    )
    params = container.get("params", {}) if container else {}
    bracket_slot = ""
    slot_header = ""
    if isinstance(params, dict):
        for key, value in params.items():
            if match_block == value or match_block.strip() in value:
                bracket_slot = key
                slot_header = clean_wiki_text(params.get(f"{key}header", ""))
                break
        if not slot_header and bracket_slot:
            round_match = re.match(r"(R\d+)M\d+", bracket_slot, flags=re.I)
            if round_match:
                slot_header = clean_wiki_text(params.get(f"{round_match.group(1)}M1header", ""))
    if re.fullmatch(r"![^!]+!x", slot_header.casefold()):
        slot_header = ""

    bracket_title = str(container.get("bracket_title", "") or "")
    match_section = str(container.get("match_section", "") or "")
    stage_name = (
        str(container.get("stage_template", "") or "")
        or str(container.get("heading_stage", "") or "")
        or source_title_stage(source_title)
        or "unknown"
    )
    round_name = slot_header or bracket_title or match_section or stage_name or "unknown"
    bracket_group = bracket_group_from_text(" ".join([round_name, bracket_title, match_section]))
    phase = infer_match_phase(stage_name, round_name, bracket_title, match_section, source_title_stage(source_title))
    return {
        "liquipedia_source_title": source_title,
        "liquipedia_stage_name": stage_name,
        "liquipedia_round_name": round_name,
        "liquipedia_match_section": match_section,
        "liquipedia_bracket_type": str(container.get("template_name", "") or ""),
        "liquipedia_bracket_id": str(container.get("bracket_id", "") or ""),
        "liquipedia_bracket_slot": bracket_slot,
        "liquipedia_bracket_group": bracket_group,
        "match_phase": phase,
        "is_playoff": str(is_playoff_phase(phase)),
        "is_elimination_match": str(is_elimination_phase(phase, round_name, bracket_group)),
    }


def parse_map_template(value: str) -> dict[str, object]:
    if not value.strip().startswith("{{"):
        return {"map_name": normalize_map_name(value), "raw": value}
    _, params, _ = parse_template(value)
    map_name = normalize_map_name(params.get("map") or params.get("1") or "TBA")
    score1 = score_from_map_params(params, 1)
    score2 = score_from_map_params(params, 2)
    stats_id = parse_int(params.get("stats") or params.get("hltv"))
    picked_by = clean_wiki_text(params.get("pick", ""))
    return {
        "map_name": map_name or "TBA",
        "team1_score": score1,
        "team2_score": score2,
        "stats_id": stats_id,
        "picked_by_team_name": picked_by,
        "finished": clean_wiki_text(params.get("finished", "")),
        "raw": value,
    }


def parse_event_metadata(text: str) -> dict[str, object]:
    infoboxes = find_template_blocks(text, "Infobox league")
    if not infoboxes:
        return {}
    _, params, _ = parse_template(infoboxes[0])
    pool = []
    for index in range(1, 10):
        map_name = normalize_map_name(params.get(f"map{index}", ""))
        if map_name:
            pool.append(map_name)
    return {
        "event_name": clean_wiki_text(params.get("name") or params.get("tickername", "")),
        "event_tier": clean_wiki_text(params.get("liquipediatier", "")),
        "publisher_tier": clean_wiki_text(params.get("publishertier", "")),
        "event_type": clean_wiki_text(params.get("type", "")),
        "organizer": clean_wiki_text(params.get("organizer", "")),
        "series": clean_wiki_text(params.get("series", "")),
        "start_date": clean_wiki_text(params.get("sdate", "")),
        "end_date": clean_wiki_text(params.get("edate", "")),
        "prizepool_usd": clean_wiki_text(params.get("prizepoolusd", "")),
        "country": clean_wiki_text(params.get("country", "")),
        "city": clean_wiki_text(params.get("city", "")),
        "venue": clean_wiki_text(params.get("venue", "")),
        "team_count": clean_wiki_text(params.get("team_number", "")),
        "map_pool": pool,
    }


def synthetic_match_id(source_title: str, match_index: int, params: dict[str, str], team1: str, team2: str) -> int:
    seed = "|".join(
        [
            source_title,
            str(match_index),
            clean_wiki_text(params.get("date", "")),
            team1,
            team2,
        ]
    )
    return -int(zlib.crc32(seed.encode("utf-8")))


def parse_matches_from_wikitext(source_title: str, text: str) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    metadata = parse_event_metadata(text)
    event_name = str(metadata.get("event_name") or source_title)
    event_source_title = parent_event_source_title(source_title, metadata)
    matches: list[dict[str, str]] = []
    maps: list[dict[str, str]] = []
    vetoes: list[dict[str, str]] = []
    containers = build_container_contexts(text)

    for match_index, (match_start, match_end, block) in enumerate(find_template_blocks_with_spans(text, "Match"), start=1):
        _, params, _ = parse_template(block)
        if "opponent1" not in params and "opponent2" not in params:
            continue
        context = context_for_match(text, source_title, match_start, match_end, block, containers)
        team1_name, team1_series_score = parse_team_opponent(params.get("opponent1", ""))
        team2_name, team2_series_score = parse_team_opponent(params.get("opponent2", ""))
        team1_name = team1_name or clean_wiki_text(params.get("opponent1literal", ""))
        team2_name = team2_name or clean_wiki_text(params.get("opponent2literal", ""))
        if not team1_name or not team2_name:
            continue

        hltv_id = parse_int(params.get("hltv"))
        match_id = hltv_id or synthetic_match_id(source_title, match_index, params, team1_name, team2_name)
        match_date, match_timestamp = parse_date(params.get("date", ""))
        map_keys = sorted(
            [key for key in params if re.fullmatch(r"map\d+", key)],
            key=lambda item: int(re.search(r"\d+", item).group(0)),
        )
        parsed_maps = [parse_map_template(params[key]) for key in map_keys]
        played_maps = [
            row for row in parsed_maps
            if row.get("map_name") and row.get("map_name") != "TBA" and row.get("finished") != "skip"
        ]

        team1_map_wins = 0
        team2_map_wins = 0
        for map_index, map_row in enumerate(parsed_maps, start=1):
            map_name = str(map_row.get("map_name") or "TBA")
            team1_score = map_row.get("team1_score")
            team2_score = map_row.get("team2_score")
            winner_team_name = ""
            if isinstance(team1_score, int) and isinstance(team2_score, int):
                if team1_score > team2_score:
                    winner_team_name = team1_name
                    team1_map_wins += 1
                elif team2_score > team1_score:
                    winner_team_name = team2_name
                    team2_map_wins += 1
            maps.append(
                {
                    "match_id": str(match_id),
                    "map_index": str(map_index),
                    "map_name": map_name,
                    "team1_name": team1_name,
                    "team2_name": team2_name,
                    "team1_score": "" if team1_score is None else str(team1_score),
                    "team2_score": "" if team2_score is None else str(team2_score),
                    "winner_team_name": winner_team_name,
                    "stats_id": "" if map_row.get("stats_id") is None else str(map_row["stats_id"]),
                    "picked_by_team_name": str(map_row.get("picked_by_team_name") or ""),
                    "raw_json": json.dumps(map_row, ensure_ascii=False),
                }
            )

        if team1_series_score is None and played_maps:
            team1_series_score = team1_map_wins
        if team2_series_score is None and played_maps:
            team2_series_score = team2_map_wins

        winner_team_name = ""
        if team1_series_score is not None and team2_series_score is not None:
            if team1_series_score > team2_series_score:
                winner_team_name = team1_name
            elif team2_series_score > team1_series_score:
                winner_team_name = team2_name

        best_of = parse_int(params.get("bestof")) or len(parsed_maps) or None
        match_url = (
            f"https://www.hltv.org/matches/{hltv_id}/liquipedia"
            if hltv_id
            else f"https://liquipedia.net/counterstrike/{source_title.replace(' ', '_')}"
        )
        matches.append(
            {
                "match_id": str(match_id),
                "match_url": match_url,
                "match_date": match_date,
                "match_timestamp": "" if match_timestamp is None else str(match_timestamp),
                "event_name": event_name,
                "event_id": "",
                "team1_name": team1_name,
                "team1_id": "",
                "team2_name": team2_name,
                "team2_id": "",
                "team1_score": "" if team1_series_score is None else str(team1_series_score),
                "team2_score": "" if team2_series_score is None else str(team2_series_score),
                "winner_team_name": winner_team_name,
                "format": "" if best_of is None else f"bo{best_of}",
                "liquipedia_source_title": context["liquipedia_source_title"],
                "liquipedia_event_source_title": event_source_title,
                "liquipedia_event_tier": str(metadata.get("event_tier") or ""),
                "liquipedia_publisher_tier": str(metadata.get("publisher_tier") or ""),
                "liquipedia_stage_name": context["liquipedia_stage_name"],
                "liquipedia_round_name": context["liquipedia_round_name"],
                "liquipedia_match_section": context["liquipedia_match_section"],
                "liquipedia_bracket_type": context["liquipedia_bracket_type"],
                "liquipedia_bracket_id": context["liquipedia_bracket_id"],
                "liquipedia_bracket_slot": context["liquipedia_bracket_slot"],
                "liquipedia_bracket_group": context["liquipedia_bracket_group"],
                "match_phase": context["match_phase"],
                "is_playoff": context["is_playoff"],
                "is_elimination_match": context["is_elimination_match"],
                "stars": "",
                "source": "liquipedia_wikitext",
                "raw_json": json.dumps(
                    {
                        "source_title": source_title,
                        "event_metadata": metadata,
                        "context": context,
                        "params": {key: clean_wiki_text(value) for key, value in params.items() if key != "comment"},
                    },
                    ensure_ascii=False,
                ),
            }
        )

    return matches, maps, vetoes


def section_titles_from_wikitext(text: str) -> list[str]:
    titles = []
    for match in re.finditer(r"#section\s*:\s*([^|}\n]+)", text, flags=re.I):
        title = clean_wiki_text(match.group(1))
        if title:
            titles.append(title)
    return list(dict.fromkeys(titles))


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists() or not path.read_text(encoding="utf-8").strip():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def titles_from_existing_matches(connection, since: str, limit: int) -> list[str]:
    rows = connection.execute(
        """
        SELECT tournament_href, COUNT(*) AS matches_seen
        FROM liquipedia_matches
        WHERE tournament_href IS NOT NULL
          AND tournament_href != ''
          AND match_timestamp >= strftime('%s', ?)
        GROUP BY tournament_href
        ORDER BY matches_seen DESC, tournament_href
        LIMIT ?
        """,
        (since, limit),
    ).fetchall()
    titles = []
    for row in rows:
        href = row["tournament_href"]
        title = href.split("/counterstrike/", 1)[-1].split("#", 1)[0]
        titles.append(unquote(title).replace("_", " "))
    return titles


def titles_from_event_queue(limit: int, include_parsed: bool) -> list[str]:
    rows = read_csv(BRONZE_ROOT / "liquipedia_event_title_queue.csv")
    titles = []
    for row in rows:
        if not include_parsed and row.get("already_parsed") == "1":
            continue
        title = compact_whitespace(row.get("source_title", ""))
        if title:
            titles.append(title)
        if limit and len(titles) >= limit:
            break
    return titles


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


def event_row_from_metadata(source_title: str, metadata: dict[str, object]) -> dict[str, str]:
    return {
        "source_title": source_title,
        "event_name": str(metadata.get("event_name") or source_title),
        "event_tier": str(metadata.get("event_tier") or ""),
        "publisher_tier": str(metadata.get("publisher_tier") or ""),
        "event_type": str(metadata.get("event_type") or ""),
        "organizer": str(metadata.get("organizer") or ""),
        "series": str(metadata.get("series") or ""),
        "start_date": str(metadata.get("start_date") or ""),
        "end_date": str(metadata.get("end_date") or ""),
        "prizepool_usd": str(metadata.get("prizepool_usd") or ""),
        "country": str(metadata.get("country") or ""),
        "city": str(metadata.get("city") or ""),
        "venue": str(metadata.get("venue") or ""),
        "team_count": str(metadata.get("team_count") or ""),
        "map_pool": ", ".join(str(item) for item in metadata.get("map_pool") or []),
        "raw_json": json.dumps(metadata, ensure_ascii=False),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Liquipedia Match/Map templates into the CS2 warehouse.")
    parser.add_argument("--title", action="append", default=[], help="Liquipedia tournament title to fetch.")
    parser.add_argument("--use-default-titles", action="store_true")
    parser.add_argument("--from-existing-matches", action="store_true")
    parser.add_argument("--from-event-queue", action="store_true")
    parser.add_argument("--since", default="2025-06-08")
    parser.add_argument("--event-limit", type=int, default=25)
    parser.add_argument("--include-parsed-events", action="store_true")
    parser.add_argument("--sleep-seconds", type=float, default=5.0)
    parser.add_argument("--max-retries", type=int, default=2)
    parser.add_argument("--rate-limit-sleep-seconds", type=float, default=65.0)
    parser.add_argument("--merge-existing", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--include-section-pages", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--reapply-hltv-details", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument(
        "--hltv-detail-raw-path",
        default=str(RAW_ROOT / "hltv" / "match_details_2026_06_08.json"),
    )
    parser.add_argument("--as-of-date", default=datetime.now(UTC).date().isoformat())
    args = parser.parse_args()

    connection = connect()
    titles: list[str] = []
    if args.use_default_titles:
        titles.extend(DEFAULT_TITLES)
    if args.from_existing_matches:
        titles.extend(titles_from_existing_matches(connection, args.since, args.event_limit))
    if args.from_event_queue:
        titles.extend(titles_from_event_queue(args.event_limit, args.include_parsed_events))
    titles.extend(args.title)
    titles = list(dict.fromkeys(compact_whitespace(title) for title in titles if compact_whitespace(title)))

    raw_root = RAW_ROOT / "liquipedia_match_maps"
    all_matches: list[dict[str, str]] = []
    all_maps: list[dict[str, str]] = []
    all_vetoes: list[dict[str, str]] = []
    all_events: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []
    fetched_titles: set[str] = set()
    index = 0
    while index < len(titles):
        title = titles[index]
        index += 1
        if title in fetched_titles:
            continue
        fetched_titles.add(title)
        if index:
            time.sleep(args.sleep_seconds)
        try:
            text = ""
            for attempt in range(args.max_retries + 1):
                try:
                    text = fetch_wikitext(title, raw_root)
                    break
                except HTTPError as exc:
                    if exc.code != 429 or attempt >= args.max_retries:
                        raise
                    time.sleep(args.rate_limit_sleep_seconds)
            if args.include_section_pages:
                for section_title in section_titles_from_wikitext(text):
                    if section_title not in fetched_titles and section_title not in titles:
                        titles.append(section_title)
            metadata = parse_event_metadata(text)
            if metadata:
                all_events.append(event_row_from_metadata(title, metadata))
            matches, maps, vetoes = parse_matches_from_wikitext(title, text)
            all_matches.extend(matches)
            all_maps.extend(maps)
            all_vetoes.extend(vetoes)
        except Exception as exc:
            errors.append({"title": title, "error": str(exc)})

    all_matches = dedupe_rows(all_matches, ["match_id"])
    all_maps = dedupe_rows(all_maps, ["match_id", "map_index"])
    all_vetoes = dedupe_rows(all_vetoes, ["match_id", "veto_index"])
    all_events = dedupe_rows(all_events, ["source_title"])

    match_fields = [
        "match_id",
        "match_url",
        "match_date",
        "match_timestamp",
        "event_name",
        "event_id",
        "team1_name",
        "team1_id",
        "team2_name",
        "team2_id",
        "team1_score",
        "team2_score",
        "winner_team_name",
        "format",
        "liquipedia_source_title",
        "liquipedia_event_source_title",
        "liquipedia_event_tier",
        "liquipedia_publisher_tier",
        "liquipedia_stage_name",
        "liquipedia_round_name",
        "liquipedia_match_section",
        "liquipedia_bracket_type",
        "liquipedia_bracket_id",
        "liquipedia_bracket_slot",
        "liquipedia_bracket_group",
        "match_phase",
        "is_playoff",
        "is_elimination_match",
        "stars",
        "source",
        "raw_json",
    ]
    map_fields = [
        "match_id",
        "map_index",
        "map_name",
        "team1_name",
        "team2_name",
        "team1_score",
        "team2_score",
        "winner_team_name",
        "stats_id",
        "picked_by_team_name",
        "raw_json",
    ]
    veto_fields = ["match_id", "veto_index", "team_name", "map_name", "action", "raw_text"]
    event_fields = [
        "source_title",
        "event_name",
        "event_tier",
        "publisher_tier",
        "event_type",
        "organizer",
        "series",
        "start_date",
        "end_date",
        "prizepool_usd",
        "country",
        "city",
        "venue",
        "team_count",
        "map_pool",
        "raw_json",
    ]
    match_path = BRONZE_ROOT / "hltv_result_matches.csv"
    map_path = BRONZE_ROOT / "hltv_match_maps.csv"
    veto_path = BRONZE_ROOT / "hltv_match_vetoes.csv"
    event_path = BRONZE_ROOT / "liquipedia_events.csv"
    if args.merge_existing:
        all_events = read_csv(event_path) + all_events
        all_matches = read_csv(match_path) + all_matches
        all_maps = read_csv(map_path) + all_maps
        all_vetoes = read_csv(veto_path) + all_vetoes
        all_matches = dedupe_rows(all_matches, ["match_id"])
        all_maps = dedupe_rows(all_maps, ["match_id", "map_index"])
        all_vetoes = dedupe_rows(all_vetoes, ["match_id", "veto_index"])
        all_events = dedupe_rows(all_events, ["source_title"])

    rows_written = {
        "liquipedia_events": write_csv(event_path, all_events, event_fields),
        "hltv_result_matches": write_csv(match_path, all_matches, match_fields),
        "hltv_match_maps": write_csv(map_path, all_maps, map_fields),
        "hltv_match_vetoes": write_csv(veto_path, all_vetoes, veto_fields),
    }

    events_loaded = load_liquipedia_events(connection, event_path)
    matches_loaded = load_hltv_result_matches(connection, match_path)
    maps_loaded = load_hltv_match_maps(connection, map_path)
    vetoes_loaded = load_hltv_match_vetoes(connection, veto_path)
    team_map_rows = rebuild_team_map_win_rates(connection, as_of_date=args.as_of_date)
    event_stage_rows = rebuild_team_event_stage_results(connection, as_of_date=args.as_of_date)
    phase_rows = rebuild_team_phase_performance(connection, as_of_date=args.as_of_date)
    loaded = {
        "liquipedia_events": events_loaded,
        "hltv_result_matches": matches_loaded,
        "hltv_match_maps": maps_loaded,
        "hltv_match_vetoes": vetoes_loaded,
        "team_map_win_rates": team_map_rows,
        "team_event_stage_results": event_stage_rows,
        "team_phase_performance": phase_rows,
    }
    connection.commit()
    hltv_detail_reapply = None
    hltv_detail_raw_path = Path(args.hltv_detail_raw_path)
    if args.reapply_hltv_details and hltv_detail_raw_path.exists():
        from .ingest_hltv_match_details import ingest_details

        hltv_detail_reapply = ingest_details(hltv_detail_raw_path, args.as_of_date)
    print(
        json.dumps(
            {
                "titles_requested": titles,
                "errors": errors,
                "rows_written": rows_written,
                "rows_loaded": loaded,
                "hltv_detail_reapply": hltv_detail_reapply,
                "summary": summarize(connection),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
