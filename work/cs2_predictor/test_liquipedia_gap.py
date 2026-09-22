import json
import tempfile
import unittest
from pathlib import Path

from .collect_liquipedia_gap import merge_archive, observation, update_assets
from .collect_liquipedia_team_history import parse_team_history_html


class LiquipediaGapTests(unittest.TestCase):
    def test_current_single_team_table_and_multi_team_table(self):
        def cells(count):
            values = ["<span data-timestamp='1789831500'>Sep 19</span>", "S-Tier", "Offline", "", "", "Cup", "", "", "", "", "", ""]
            if count == 12:
                values[6] = "<img src='/commons/images/v/vitality.png'>Vitality"
                values[7] = "<div data-label-type='result-loss'></div>"
                values[8] = "1 : 2"
                values[10] = "<img src='/commons/images/a/aurora.png'>Aurora"
            else:
                values[6] = "<div data-label-type='result-loss'></div>"
                values[7] = "1 : 2"
                values[8] = "<img src='/commons/images/a/aurora.png'>Aurora"
            return "<table class='table2__table'><tr class='table2__row--body'>" + "".join(f"<td>{value}</td>" for value in values[:count]) + "</tr></table>"

        single = parse_team_history_html(cells(10), batch_slug="single", requested_teams=["Vitality"])
        multi = parse_team_history_html(cells(12), batch_slug="multi", requested_teams=["Vitality", "Spirit"])
        self.assertEqual((single[0]["team_name"], single[0]["opponent_name"], single[0]["score_text"]), ("Vitality", "Aurora", "1 : 2"))
        self.assertEqual(multi[0]["team_logo_url"], "/commons/images/v/vitality.png")
        self.assertEqual(observation(single[0])["winner_name"], "Aurora")

    def test_archive_dedupes_opposite_team_views_and_stages_new_logos(self):
        first = {"team_name": "Vitality", "opponent_name": "Aurora", "match_timestamp": "1789831500", "score_text": "1 : 2", "tournament_name": "Cup", "tier": "S-Tier", "team_logo_url": "/commons/images/v/vitality.png", "opponent_logo_url": "/commons/images/a/aurora.png"}
        other_side = {**first, "team_name": "Aurora", "opponent_name": "Vitality", "score_text": "2 : 1"}
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            archive = base / "results.jsonl"
            assets = base / "assets.json"
            assets_js = base / "assets.js"
            self.assertEqual(merge_archive(archive, [first, other_side]), (1, 0))
            self.assertEqual(len(archive.read_text().splitlines()), 1)
            assets.write_text(json.dumps({"vitality": {"logo_url": "./existing.png"}}))
            self.assertEqual(update_assets(assets, assets_js, [first]), 1)
            saved = json.loads(assets.read_text())
            self.assertEqual(saved["vitality"]["logo_url"], "./existing.png")
            self.assertEqual(saved["aurora"]["logo_url"], "https://liquipedia.net/commons/images/a/aurora.png")


if __name__ == "__main__":
    unittest.main()
