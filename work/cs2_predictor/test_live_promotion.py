from __future__ import annotations

import unittest
import json
import tempfile
from pathlib import Path

from .export_site_predictions import (
    api_items_from_feed,
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

    def test_reads_provider_neutral_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            path.write_text(json.dumps({"matches": [{"match_id": "hltv:1", "team1_name": "A", "team2_name": "B"}]}))
            rows = api_items_from_feed(path)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["match_id"], "hltv:1")


if __name__ == "__main__":
    unittest.main()
