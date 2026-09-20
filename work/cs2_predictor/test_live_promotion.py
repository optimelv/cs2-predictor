from __future__ import annotations

import unittest
import json
import tempfile
from pathlib import Path

from .export_site_predictions import (
    api_items_from_feed,
    merge_event_snapshot,
    merge_live_match,
    merge_live_snapshot_coverage,
    product_tier_from_feed,
    refresh_model_state_from_feed,
)


class LivePromotionTests(unittest.TestCase):
    def test_classifies_product_events(self) -> None:
        self.assertEqual(product_tier_from_feed({"event_name": "CCT Europe Series 9"}), "tier_2")
        self.assertEqual(product_tier_from_feed({"event_name": "IEM Beijing 2026"}), "tier_1")
        self.assertEqual(product_tier_from_feed({"event_name": "Local Cup", "tier": "C-Tier"}), "excluded")

    def test_updates_online_state_once(self) -> None:
        payload = {
            "model_state": {
                "teams": [
                    {"team_key": "alpha", "team_name": "Alpha", "elo": 1600, "matches": 10, "recent_win_rate_10": 0.5},
                    {"team_key": "beta", "team_name": "Beta", "elo": 1500, "matches": 10, "recent_win_rate_10": 0.5},
                ]
            }
        }
        result = {
            "match_id": "hltv:42",
            "event_name": "CCT Europe Series 9",
            "team1_name": "Alpha",
            "team2_name": "Beta",
            "status": "finished",
            "score1": 2,
            "score2": 0,
            "starts_at": "2026-07-25T18:00:00Z",
        }
        self.assertEqual(refresh_model_state_from_feed(payload, [result]), 1)
        self.assertGreater(payload["model_state"]["teams"][0]["elo"], 1600)
        self.assertEqual(refresh_model_state_from_feed(payload, [result]), 0)

    def test_finished_row_without_result_timestamp_does_not_update_state(self) -> None:
        payload = {
            "model_state": {
                "teams": [
                    {"team_key": "alpha", "team_name": "Alpha", "elo": 1600, "matches": 10, "recent_win_rate_10": 0.5},
                    {"team_key": "beta", "team_name": "Beta", "elo": 1500, "matches": 10, "recent_win_rate_10": 0.5},
                ]
            }
        }
        unresolved_result = {
            "match_id": "hltv:missing-time",
            "event_name": "CCT Europe Series 9",
            "team1_name": "Alpha",
            "team2_name": "Beta",
            "status": "finished",
            "score1": 2,
            "score2": 0,
            "starts_at": None,
        }
        before_teams = json.loads(json.dumps(payload["model_state"]["teams"]))
        self.assertEqual(refresh_model_state_from_feed(payload, [unresolved_result]), 0)
        self.assertEqual(payload["model_state"]["teams"], before_teams)
        self.assertNotIn("last_result_utc", payload["model_state"]["teams"][0])
        self.assertNotIn("last_result_utc", payload["model_state"]["teams"][1])

    def test_live_partial_score_does_not_update_state(self) -> None:
        payload = {"model_state": {"teams": []}}
        live_partial = {
            "match_id": "hltv:live-partial",
            "event_name": "CCT Europe Series 9",
            "team1_name": "Alpha",
            "team2_name": "Beta",
            "status": "live",
            "score1": 1,
            "score2": 0,
            "starts_at": "2026-09-20T04:00:00Z",
        }
        self.assertEqual(refresh_model_state_from_feed(payload, [live_partial]), 0)
        self.assertEqual(payload["model_state"]["teams"], [])

    def test_reads_provider_neutral_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            path.write_text(json.dumps({"matches": [{"match_id": "hltv:1", "team1_name": "A", "team2_name": "B"}]}))
            rows = api_items_from_feed(path)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["match_id"], "hltv:1")

    def test_thin_live_match_does_not_erase_rich_context(self) -> None:
        merged = merge_live_match(
            {"match_id": "hltv:1", "stage_name": "Quarterfinals", "round_name": "Upper quarterfinal", "maps": [{"map_name": "Nuke"}], "lineups": {"team1": ["a"]}},
            {"match_id": "hltv:1", "stage_name": "Completed series", "round_name": "", "maps": [], "lineups": {}, "status": "finished", "score1": 2, "score2": 0},
        )
        self.assertEqual(merged["stage_name"], "Quarterfinals")
        self.assertEqual(merged["round_name"], "Upper quarterfinal")
        self.assertEqual(merged["maps"], [{"map_name": "Nuke"}])
        self.assertEqual((merged["score1"], merged["score2"]), (2, 0))

    def test_live_event_preserves_curated_format_and_full_field(self) -> None:
        existing = {
            "id": "curated-cup",
            "name": "CCT Europe Series 9",
            "status": "ongoing",
            "teams": 16,
            "participants": ["A", "B", "C", "D"],
            "format": {"type": "single_elimination", "label": "16-team knockout", "confidence": "confirmed"},
            "bracket": {"type": "single_elimination", "rounds": [{"id": "qf", "name": "Quarterfinals", "matches": []}]},
        }
        incoming = {
            "id": "hltv:99",
            "name": "CCT Europe Series 9",
            "status": "upcoming",
            "participants": ["A", "B"],
            "format": {"type": "mixed", "label": "Event schedule", "stages": []},
        }
        merged = merge_event_snapshot(existing, incoming)
        self.assertEqual(merged["id"], "curated-cup")
        self.assertEqual(merged["status"], "ongoing")
        self.assertEqual(merged["teams"], 16)
        self.assertEqual(merged["format"]["type"], "single_elimination")
        self.assertEqual(merged["bracket"]["rounds"][0]["name"], "Quarterfinals")

    def test_coverage_deduplicates_hltv_alias_by_event_name(self) -> None:
        payload = {"coverage": {"events": [{
            "id": "curated-cup", "name": "CCT Europe Series 9", "status": "ongoing", "teams": 16,
            "participants": ["A", "B", "C", "D"], "format": {"type": "single_elimination", "label": "Knockout"},
        }], "daily_matches": []}}
        live = {
            "fetched_at_utc": "2026-07-28T20:00:00Z",
            "events": [{
                "id": "hltv:99", "name": "CCT Europe Series 9", "status": "upcoming", "product_tier": "tier_2",
                "participants": ["A", "B"], "format": {"type": "mixed", "label": "Event schedule", "stages": []},
            }],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "live.json"
            path.write_text(json.dumps(live))
            merge_live_snapshot_coverage(payload, path, [])
        self.assertEqual(len(payload["coverage"]["events"]), 1)
        event = payload["coverage"]["events"][0]
        self.assertEqual(event["id"], "curated-cup")
        self.assertEqual(event["format"]["type"], "single_elimination")


if __name__ == "__main__":
    unittest.main()
