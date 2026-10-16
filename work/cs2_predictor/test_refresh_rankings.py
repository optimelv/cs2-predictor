import copy
import unittest

from .refresh_rankings import apply_rankings


class RefreshRankingsTests(unittest.TestCase):
    def rows(self):
        return [{"rank": i, "points": 2000-i, "team_name": f"Team {i}",
                 "roster_names": "a, b, c, d, e", "ranking_date": "2026-10-05"} for i in range(1, 31)]

    def test_current_inputs_update_without_changing_elo_or_historical_features(self):
        payload = {"model_state": {"teams": [{"team_name": "Team 1", "elo": 1700, "vrs_rank": 10},
                                             {"team_name": "Old team", "vrs_rank": 1, "vrs_points": 2000}]},
                   "upcoming_predictions": [{"match_id": "published", "prob_team1": .6}]}
        before = copy.deepcopy(payload["upcoming_predictions"])
        standings = apply_rankings(payload, self.rows(), "https://github.com/ValveSoftware/source", "2026-10-14T07:00:00Z")
        self.assertEqual(standings["teams"][0]["players"], ["a", "b", "c", "d", "e"])
        self.assertEqual(payload["model_state"]["teams"][0]["vrs_rank"], 1)
        self.assertEqual(payload["model_state"]["teams"][0]["elo"], 1700)
        self.assertIsNone(payload["model_state"]["teams"][1]["vrs_rank"])
        self.assertEqual(payload["upcoming_predictions"], before)

    def test_rejects_partial_duplicate_future_and_regressing_sources_before_mutation(self):
        for rows in [self.rows()[:-1], [self.rows()[0]] * 30,
                     [{**row, "ranking_date": "2026-10-15"} for row in self.rows()]]:
            payload = {}
            with self.assertRaises(ValueError):
                apply_rankings(payload, rows, "source", "2026-10-14T07:00:00Z")
            self.assertEqual(payload, {})
        with self.assertRaises(ValueError):
            apply_rankings({"coverage": {"vrs": {"as_of": "2026-10-06"}}}, self.rows(), "source", "2026-10-14")

    def test_multiple_lineups_are_preserved_but_not_mapped_to_one_model_team(self):
        rows = self.rows()
        rows[1]["team_name"] = "Team 1"
        payload = {"model_state": {"teams": [{"team_name": "Team 1", "vrs_rank": 9}]}}
        result = apply_rankings(payload, rows, "source", "2026-10-14")
        self.assertEqual(len(result["teams"]), 30)
        self.assertIsNone(payload["model_state"]["teams"][0]["vrs_rank"])
