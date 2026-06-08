from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class Tier(str, Enum):
    TIER_1 = "tier_1"
    TIER_1_5 = "tier_1_5"
    TIER_2 = "tier_2"
    TIER_3 = "tier_3"


@dataclass(frozen=True)
class TeamSnapshot:
    name: str
    valve_rank: Optional[int] = None
    hltv_rank: Optional[int] = None
    avg_player_rating_3m: Optional[float] = None
    roster_core_maps: int = 0
    roster_changes_30d: int = 0
    active_official_investigation: bool = False
    unresolved_rumor_flag: bool = False


@dataclass(frozen=True)
class EventSnapshot:
    name: str
    liquipedia_tier: Optional[str] = None
    is_lan: bool = False
    valve_declared_tier: Optional[str] = None
    top12_teams: int = 0
    top20_teams: int = 0
    median_consensus_rank: Optional[float] = None


@dataclass(frozen=True)
class MatchSnapshot:
    event: EventSnapshot
    team_a: TeamSnapshot
    team_b: TeamSnapshot
    is_online: bool
    best_of: int


def _mean_rank(*values: Optional[int]) -> Optional[float]:
    usable = [value for value in values if value is not None]
    if not usable:
        return None
    return sum(usable) / len(usable)


def consensus_rank(team: TeamSnapshot) -> Optional[float]:
    return _mean_rank(team.valve_rank, team.hltv_rank)


def classify_team_tier(team: TeamSnapshot) -> Tier:
    rank = consensus_rank(team)
    rating = team.avg_player_rating_3m or 1.0

    if rank is None:
        return Tier.TIER_3

    if (
        rank <= 12
        and rating >= 1.03
        and team.roster_core_maps >= 20
        and team.roster_changes_30d <= 1
    ):
        return Tier.TIER_1

    if rank <= 20:
        return Tier.TIER_1_5

    if rank <= 40:
        return Tier.TIER_2

    return Tier.TIER_3


def classify_event_tier(event: EventSnapshot) -> Tier:
    if event.valve_declared_tier == "tier_1":
        return Tier.TIER_1

    if (
        event.liquipedia_tier == "S"
        and event.is_lan
        and event.top12_teams >= 6
        and (event.median_consensus_rank or 999) <= 18
    ):
        return Tier.TIER_1

    if (
        event.liquipedia_tier in {"S", "A"}
        and event.top20_teams >= 8
        and (event.median_consensus_rank or 999) <= 28
    ):
        return Tier.TIER_1_5

    if event.liquipedia_tier in {"A", "B"} and (event.median_consensus_rank or 999) <= 45:
        return Tier.TIER_2

    return Tier.TIER_3


def integrity_risk(match: MatchSnapshot) -> float:
    event_tier = classify_event_tier(match.event)
    team_a_tier = classify_team_tier(match.team_a)
    team_b_tier = classify_team_tier(match.team_b)

    risk = 0.05 if match.event.is_lan else 0.20

    if event_tier == Tier.TIER_1_5:
        risk += 0.05
    elif event_tier == Tier.TIER_2:
        risk += 0.20
    elif event_tier == Tier.TIER_3:
        risk += 0.45

    if team_a_tier == Tier.TIER_3:
        risk += 0.10
    if team_b_tier == Tier.TIER_3:
        risk += 0.10

    if match.team_a.roster_changes_30d >= 2:
        risk += 0.10
    if match.team_b.roster_changes_30d >= 2:
        risk += 0.10

    if match.team_a.active_official_investigation or match.team_b.active_official_investigation:
        risk += 0.50

    if match.team_a.unresolved_rumor_flag or match.team_b.unresolved_rumor_flag:
        risk += 0.10

    if match.is_online and event_tier in {Tier.TIER_2, Tier.TIER_3}:
        risk += 0.10

    return max(0.0, min(1.0, risk))


def exclude_from_training(match: MatchSnapshot) -> bool:
    if match.team_a.active_official_investigation or match.team_b.active_official_investigation:
        return True

    event_tier = classify_event_tier(match.event)
    rank_a = consensus_rank(match.team_a) or 999
    rank_b = consensus_rank(match.team_b) or 999

    if event_tier == Tier.TIER_3:
        return True

    if match.is_online and rank_a > 40 and rank_b > 40:
        return True

    if match.team_a.roster_core_maps < 10 or match.team_b.roster_core_maps < 10:
        return True

    return False


def training_weight(match: MatchSnapshot) -> float:
    if exclude_from_training(match):
        return 0.0

    event_tier = classify_event_tier(match.event)

    if event_tier == Tier.TIER_1:
        base = 1.00
    elif event_tier == Tier.TIER_1_5:
        base = 0.90
    else:
        base = 0.75 if match.event.is_lan else 0.45

    return round(base * (1.0 - integrity_risk(match) * 0.5), 3)
