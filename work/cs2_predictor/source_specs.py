from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class SourceSpec:
    name: str
    role: str
    acquisition_method: str
    priority: int
    notes: List[str]


SOURCE_SPECS = [
    SourceSpec(
        name="HLTV",
        role="Primary match, map, player, team, and ranking source",
        acquisition_method="HTML collection with caching and parser adapters",
        priority=1,
        notes=[
            "Use for matches, map results, player pages, team pages, stats pages, and rankings.",
            "Treat as HTML-first. Do not assume a stable official public API.",
            "Throttle aggressively and cache raw responses.",
        ],
    ),
    SourceSpec(
        name="Liquipedia MediaWiki API",
        role="Primary event metadata and tiering source",
        acquisition_method="Official API only",
        priority=1,
        notes=[
            "Use for event tier, roster history, stage structure, region, and scheduling metadata.",
            "Do not automate access to generated HTML pages.",
            "Honor Liquipedia rate limits and use a custom User-Agent.",
        ],
    ),
    SourceSpec(
        name="Valve VRS snapshots",
        role="Official team strength prior",
        acquisition_method="Repository ingestion",
        priority=1,
        notes=[
            "Use as a ranking prior and feature source.",
            "Weekly snapshot ingestion is enough for phase 1.",
        ],
    ),
    SourceSpec(
        name="FACEIT Data API",
        role="Supplementary player skill signal",
        acquisition_method="Official REST API",
        priority=2,
        notes=[
            "Useful for public-skill enrichment, not as the main pro-match source.",
            "Can supply Elo and skill level features where appropriate.",
        ],
    ),
    SourceSpec(
        name="Demo parsing",
        role="Advanced round-level feature source",
        acquisition_method="Local demo ingestion",
        priority=3,
        notes=[
            "Use after the public-data predictor is stable.",
            "Strong long-term moat for utility, duel, and economy features.",
        ],
    ),
    SourceSpec(
        name="Historical odds",
        role="Market comparison and edge testing",
        acquisition_method="Paid or low-cost odds APIs",
        priority=3,
        notes=[
            "Add once the pure predictive model is stable.",
            "Needed for EV, CLV, and market-efficiency backtests.",
        ],
    ),
]
