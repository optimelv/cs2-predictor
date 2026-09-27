import json
import tempfile
import unittest
from pathlib import Path

from .backfill_runner_results import import_page, observed_result


def card(match_id):
    return {
        "match_id": match_id,
        "match_timestamp": 1789999200 - match_id * 60,
        "match_url": f"https://www.hltv.org/matches/{match_id}/alpha-vs-beta-cup",
        "team1_name": "Alpha",
        "team2_name": "Beta",
        "team1_score": 2,
        "team2_score": 1,
        "event_name": "Cup",
        "format": "bo3",
    }


class RunnerBackfillTests(unittest.TestCase):
    def test_tied_result_is_preserved_without_a_model_target(self):
        tied = {**card(101), "team1_score": 12, "team2_score": 12}
        result = observed_result(tied)
        self.assertEqual((result["score1"], result["score2"]), (12, 12))
        self.assertIsNone(result["winner_name"])

    def test_full_overlapping_page_advances_without_overwriting_existing_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "observed.jsonl"
            state = Path(directory) / "state.json"
            old = [observed_result(card(index)) for index in range(1, 51)]
            old[0]["product_tier"] = "tier_1"
            archive.write_text("".join(json.dumps(row) + "\n" for row in old))
            payload = {"status": "ok", "page_results": [{"offset": 2700, "rows_parsed": 100}], "rows": [card(index) for index in range(1, 101)]}
            result = import_page(payload, archive, state, 2700)
            saved = {row["match_id"]: row for row in map(json.loads, archive.read_text().splitlines())}
            self.assertEqual((result["added"], result["overlap"], result["total"]), (50, 50, 100))
            self.assertEqual(json.loads(state.read_text())["next_offset"], 2750)
            self.assertEqual(saved["hltv:1"]["product_tier"], "tier_1")
            self.assertEqual(saved["hltv:100"]["product_tier"], "pending")

    def test_partial_page_keeps_cursor_and_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "observed.jsonl"
            state = Path(directory) / "state.json"
            archive.write_text(json.dumps(observed_result(card(1))) + "\n")
            previous = archive.read_text()
            payload = {"status": "ok", "page_results": [{"offset": 2700, "rows_parsed": 99}], "rows": [card(index) for index in range(99)]}
            with self.assertRaisesRegex(ValueError, "Incomplete HLTV results page"):
                import_page(payload, archive, state, 2700)
            self.assertEqual(archive.read_text(), previous)
            self.assertFalse(state.exists())


if __name__ == "__main__":
    unittest.main()
