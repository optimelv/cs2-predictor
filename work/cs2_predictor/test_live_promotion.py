from __future__ import annotations

import unittest
import json
import tempfile
from pathlib import Path

from .export_site_predictions import (
    api_items_from_feed,
    merge_event_snapshot,
    merge_event_bracket,
    merge_live_match,
    merge_live_snapshot_coverage,
    product_tier_from_feed,
    refresh_model_state_from_feed,
)


class LivePromotionTests(unittest.TestCase):
    def test_new_provider_replaces_current_board_and_published_rounds(self):
        old = {"match_id": "old", "event_name": "IEM Test", "product_tier": "tier_1", "team1_name": "A", "team2_name": "B", "starts_at": "2026-11-02T10:00:00Z"}
        new = {**old, "match_id": "new", "slot_id": "new-slot"}
        payload = {"coverage": {"events": [{"id": "old-event", "name": "IEM Test", "matches": [old], "bracket": {"rounds": [{"id": "old-round", "matches": [old]}]}}], "daily_matches": [old]}}
        feed = {"source": "pandascore", "fetched_at_utc": "2026-11-02T01:00:00Z", "events": [{"id": "new-event", "name": "IEM Test", "product_tier": "tier_1", "status": "upcoming", "matches": [new], "bracket": {"rounds": [{"id": "new-round", "matches": [new]}]}}]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "feed.json"
            path.write_text(json.dumps(feed))
            merge_live_snapshot_coverage(payload, path, [new])
        self.assertEqual([row["match_id"] for row in payload["coverage"]["daily_matches"]], ["new"])
        self.assertEqual([row["id"] for row in payload["coverage"]["events"][0]["bracket"]["rounds"]], ["new-round"])
        self.assertEqual(payload["coverage"]["events"][0]["id"], "old-event")

    def test_provider_activation_excludes_older_results_from_online_model(self):
        from .export_site_predictions import refresh_model_state_from_feed
        model = {"model_state": {"teams": [], "applied_result_ids": []}}
        common = {"event_name": "IEM Test", "product_tier": "tier_1", "team1_name": "Alpha", "team2_name": "Beta", "status": "finished", "score1": 2, "score2": 0, "series_format": "bo3", "model_eligible_since_utc": "2026-11-02T00:00:00Z"}
        old = {**common, "match_id": "pandascore:old", "starts_at": "2026-11-01T10:00:00Z"}
        new = {**common, "match_id": "pandascore:new", "starts_at": "2026-11-02T10:00:00Z"}
        self.assertEqual(refresh_model_state_from_feed(model, [old, new]), 1)
        self.assertEqual(model["model_state"]["applied_result_ids"], ["pandascore:new"])
        self.assertEqual(refresh_model_state_from_feed(model, [old, new]), 0)

    def test_partial_round_refresh_preserves_match_slots(self) -> None:
        # The schedule drops the first semi after it finishes, renumbering the
        # second semi to slot 1. A slot belongs to the match, not the response index.
        first = {"match_id": "hltv:2399530", "slot_id": "main:semifinal:1"}
        second = {"match_id": "hltv:2399531", "slot_id": "main:semifinal:2"}
        old = {"rounds": [{"id": "main:semifinal", "matches": [first, second]}]}
        new = {"rounds": [{"id": "main:semifinal", "matches": [{**second, "slot_id": "main:semifinal:1", "status": "live"}]}]}
        merged = merge_event_bracket(old, new)
        matches = merged["rounds"][0]["matches"]
        self.assertEqual([row["slot_id"] for row in matches], [first["slot_id"], second["slot_id"]])
        self.assertEqual(matches[1]["status"], "live")
        self.assertEqual(merge_event_bracket(merged, new), merged)

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

class EventCurationParityTests(unittest.TestCase):
    def test_export_and_training_use_collector_policy(self):
        from infra.oracle.worker.event_policy import POLICY
        from .promote_portable_model import live_product_tier
        for name, declared, expected in POLICY["cases"]:
            row = {"event_name": name, "product_tier": declared}
            with self.subTest(name=name):
                self.assertEqual(product_tier_from_feed(row), expected)
                self.assertEqual(live_product_tier(row), {"tier_1": "T1", "tier_2": "T2"}.get(expected))
