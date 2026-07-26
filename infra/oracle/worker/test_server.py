import unittest
import json
import tempfile
from pathlib import Path

from server import events_from_matches, merge_match_detail, parse_match_detail, parse_matches, parse_results, save_snapshot


class WorkerParserTests(unittest.TestCase):
    def test_snapshot_write_is_atomic_and_reusable(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "live-snapshot.json"
            payload = {"ok": True, "contract_version": "1.1", "matches": [{"match_id": "hltv:1"}]}
            save_snapshot(payload, output)
            self.assertEqual(json.loads(output.read_text()), payload)
            self.assertFalse(output.with_suffix(".json.tmp").exists())

    def test_schedule_card_keeps_source_ids_and_format(self):
        html = """
        <a class="upcomingMatch" href="/matches/2389999/example">
          <span data-unix="1784980800000"></span>
          <div class="matchTeamName">Spirit</div><div class="matchTeamName">Vitality</div>
          <div class="matchEventName">Example Cup</div>
          <a href="/events/9999/example-cup">Example Cup</a>
          <div class="matchMeta">bo3</div>
        </a>
        """
        rows = parse_matches(html)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["match_id"], "hltv:2389999")
        self.assertEqual(rows[0]["event_id"], "hltv:9999")
        self.assertEqual(rows[0]["series_format"], "bo3")

    def test_current_hltv_match_markup_keeps_schedule_and_stage(self):
        html = """
        <div class="match-wrapper" data-match-wrapper data-match-id="2396253" data-event-id="9309" live="false">
          <div class="match">
            <a href="/matches/2396253/cybershoke-vs-comanche" class="match-top">
              <div class="match-event" data-event-headline="CCT 2026 Europe Series 6" data-event-id="9309">
                <div class="match-stage">Quarter-final</div>
              </div>
            </a>
            <div class="match-bottom">
              <a href="/matches/2396253/cybershoke-vs-comanche" class="match-info">
                <div class="match-time" data-unix="1785132000000">08:00</div>
                <div class="match-meta">bo3</div>
              </a>
              <div class="match-teamname">CYBERSHOKE</div>
              <div class="match-teamname">Comanche</div>
            </div>
          </div>
        </div>
        """
        rows = parse_matches(html)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["match_id"], "hltv:2396253")
        self.assertEqual(rows[0]["event_id"], "hltv:9309")
        self.assertEqual(rows[0]["event_name"], "CCT 2026 Europe Series 6")
        self.assertEqual(rows[0]["stage_name"], "Quarter-final")
        self.assertEqual(rows[0]["status"], "upcoming")
        self.assertEqual(rows[0]["starts_at"], "2026-07-27T06:00:00Z")

    def test_current_hltv_live_markup_is_detected(self):
        html = """
        <div class="match-wrapper" data-match-wrapper data-match-id="2395779" data-event-id="9282" live="true">
          <div class="match">
            <a href="/matches/2395779/oddik-vs-isurus"><div class="match-event" data-event-headline="CCT 2026 South America Series 4" data-event-id="9282"></div></a>
            <div class="match-meta match-meta-live">Live</div><div class="match-meta">bo3</div>
            <div class="match-teamname">ODDIK</div><div class="match-teamname">Isurus</div>
          </div>
        </div>
        """
        rows = parse_matches(html)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "live")
        self.assertEqual(rows[0]["event_id"], "hltv:9282")

    def test_result_card_extracts_score_and_winner(self):
        html = """
        <a class="result-con" href="/matches/2389000/result">
          <div class="team">MOUZ</div><div class="team">NAVI</div>
          <div class="result-score">2 - 1</div>
          <div class="event-name">Finals</div>
        </a>
        """
        rows = parse_results(html)
        self.assertEqual((rows[0]["score1"], rows[0]["score2"]), (2, 1))
        self.assertEqual(rows[0]["winner_name"], "MOUZ")
        self.assertEqual(rows[0]["status"], "finished")

    def test_detail_adds_veto_and_map_results(self):
        html = """
        <div class="timeAndEvent"><div class="event"><a href="/events/9999/example">Example Cup</a></div></div>
        <div class="veto-box">Spirit removed Ancient. Vitality picked Mirage.</div>
        <div class="lineup"><a href="/player/7998/s1mple">s1mple</a></div>
        <div class="lineup"><a href="/player/11816/ropz">ropz</a></div>
        <div class="mapholder">
          <div class="mapname">Mirage</div>
          <div class="results-left"><div class="results-team-score">13</div></div>
          <div class="results-right"><div class="results-team-score">9</div></div>
        </div>
        """
        detail = parse_match_detail(html)
        self.assertEqual(detail["maps"], ["Mirage"])
        self.assertEqual(detail["map_results"][0]["status"], "finished")
        self.assertIn("removed Ancient", detail["veto_text"])
        self.assertEqual(detail["lineups"]["team1"][0]["player_id"], "hltv:7998")

        merged = merge_match_detail({
            "team1_name": "Spirit",
            "team2_name": "Vitality",
            "series_format": "bo3",
            "status": "live",
        }, {**detail, "score1": 2, "score2": 0})
        self.assertEqual(merged["status"], "finished")
        self.assertEqual(merged["winner_name"], "Spirit")
        self.assertEqual(merged["lineups"]["team1"][0]["team_name"], "Spirit")

    def test_event_format_is_inferred_from_stages(self):
        event = events_from_matches([
            {"event_id": "hltv:1", "event_name": "Cup", "team1_name": "A", "team2_name": "B", "stage_name": "Upper bracket semifinal", "status": "finished"},
            {"event_id": "hltv:1", "event_name": "Cup", "team1_name": "C", "team2_name": "D", "stage_name": "Lower bracket final", "status": "live"},
        ])[0]
        self.assertEqual(event["format"]["type"], "double_elimination")
        self.assertEqual(event["current_stage"], "Lower bracket final")
        self.assertEqual(len(event["format"]["stages"]), 2)


if __name__ == "__main__":
    unittest.main()
