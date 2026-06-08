from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional


@dataclass(frozen=True)
class PlayerSnapshot:
    player_id: str
    nickname: str
    team_id: str
    hltv_rating_3m: Optional[float] = None
    hltv_rating_12m: Optional[float] = None
    hltv_firepower: Optional[float] = None
    hltv_entrying: Optional[float] = None
    hltv_trading: Optional[float] = None
    hltv_opening: Optional[float] = None
    hltv_clutching: Optional[float] = None
    hltv_sniping: Optional[float] = None
    hltv_utility: Optional[float] = None
    faceit_elo: Optional[int] = None
    faceit_level: Optional[int] = None


@dataclass(frozen=True)
class TeamSnapshot:
    team_id: str
    team_name: str
    roster_id: str
    players: List[PlayerSnapshot]
    hltv_rank: Optional[int] = None
    hltv_points: Optional[float] = None
    valve_rank: Optional[int] = None
    valve_points: Optional[float] = None
    roster_continuity_score: Optional[float] = None
    days_since_roster_change: Optional[int] = None


@dataclass(frozen=True)
class EventSnapshot:
    event_id: str
    event_name: str
    stage_name: str
    start_time: datetime
    is_lan: bool
    liquipedia_tier: Optional[str] = None
    internal_tier: Optional[str] = None
    region: Optional[str] = None


@dataclass(frozen=True)
class MapFeatureRow:
    match_id: str
    map_id: str
    event: EventSnapshot
    team_a: TeamSnapshot
    team_b: TeamSnapshot
    map_name: str
    best_of: int
    outcome_team_a_win: Optional[int] = None
    features: Dict[str, float] = field(default_factory=dict)
    categorical: Dict[str, str] = field(default_factory=dict)
    integrity_flags: Dict[str, bool] = field(default_factory=dict)


@dataclass(frozen=True)
class SeriesFeatureRow:
    match_id: str
    event: EventSnapshot
    team_a: TeamSnapshot
    team_b: TeamSnapshot
    best_of: int
    outcome_team_a_win: Optional[int] = None
    features: Dict[str, float] = field(default_factory=dict)
    categorical: Dict[str, str] = field(default_factory=dict)
    integrity_flags: Dict[str, bool] = field(default_factory=dict)
