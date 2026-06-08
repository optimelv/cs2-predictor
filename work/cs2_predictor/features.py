from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class FeatureDefinition:
    name: str
    level: str
    rationale: str


FEATURE_DEFINITIONS: List[FeatureDefinition] = [
    FeatureDefinition(
        name="valve_rank_diff",
        level="team",
        rationale="Official roster-strength prior from Valve VRS snapshots.",
    ),
    FeatureDefinition(
        name="hltv_rank_diff",
        level="team",
        rationale="Independent public ranking prior that reacts differently than VRS.",
    ),
    FeatureDefinition(
        name="roster_continuity_diff",
        level="team",
        rationale="Captures whether historical team strength still belongs to the current five.",
    ),
    FeatureDefinition(
        name="avg_player_rating_3m_diff",
        level="player",
        rationale="Recent roster-level form aggregated from individual player ratings.",
    ),
    FeatureDefinition(
        name="top_player_rating_3m_diff",
        level="player",
        rationale="Captures star-power asymmetry between teams.",
    ),
    FeatureDefinition(
        name="entrying_balance_diff",
        level="player_style",
        rationale="Helps describe role balance and early-round style mismatch.",
    ),
    FeatureDefinition(
        name="sniping_dependence_diff",
        level="player_style",
        rationale="Measures whether the roster leans heavily on AWP output.",
    ),
    FeatureDefinition(
        name="utility_profile_diff",
        level="player_style",
        rationale="Proxy for supportive structure and tactical utility output.",
    ),
    FeatureDefinition(
        name="recent_lan_win_rate_diff",
        level="team",
        rationale="Separates clean LAN form from noisier online form.",
    ),
    FeatureDefinition(
        name="recent_top20_map_win_rate_diff",
        level="map",
        rationale="Map strength should be opponent-quality adjusted.",
    ),
    FeatureDefinition(
        name="map_pick_rate_diff",
        level="map",
        rationale="Useful for veto simulation and map comfort estimation.",
    ),
    FeatureDefinition(
        name="map_ban_rate_diff",
        level="map",
        rationale="Helps estimate which maps are unlikely to survive the veto.",
    ),
    FeatureDefinition(
        name="event_tier",
        level="context",
        rationale="Tier affects both match quality and model confidence.",
    ),
    FeatureDefinition(
        name="lan_flag",
        level="context",
        rationale="LAN and online environments have meaningfully different noise profiles.",
    ),
    FeatureDefinition(
        name="days_rest_diff",
        level="context",
        rationale="Rest and schedule compression can matter during stacked events.",
    ),
]


def feature_names() -> List[str]:
    return [feature.name for feature in FEATURE_DEFINITIONS]
