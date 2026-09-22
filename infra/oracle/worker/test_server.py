import unittest
import json
import tempfile
import asyncio
from unittest.mock import AsyncMock, patch
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from server import events_from_matches, merge_match_detail, parse_match_detail, parse_matches, parse_results, players_from_matches, save_snapshot, select_detail_candidates, wants_detail, on_startup, on_cleanup


class WorkerLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_browser_fallback_is_bounded_and_does_not_retry_rate_limits(self):
        from server import fetch_url
        session = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(status=403)), browser_fallbacks=0)
        with patch("server.FETCH_BACKEND", "scrapling-http"), patch("server.fetch_browser_html", new=AsyncMock(return_value="<html>match</html>")) as browser:
            self.assertEqual(await fetch_url(session, "https://www.hltv.org/matches"), "<html>match</html>")
            with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
                await fetch_url(session, "https://www.hltv.org/results")
            self.assertEqual(browser.await_count, 1)
            session.browser_fallbacks = 0
            session.get.return_value = SimpleNamespace(status=429)
            with self.assertRaisesRegex(RuntimeError, "HTTP 429"):
                await fetch_url(session, "https://www.hltv.org/results")
            self.assertEqual(browser.await_count, 1)

    async def test_health_rejects_stale_or_failed_collection(self):
        from server import health
        current = datetime.now(timezone.utc).isoformat()
        for timestamp, error, status in [(current, None, 200), ("2020-01-01T00:00:00Z", None, 503), (current, "source blocked", 503)]:
            with patch("server.state", {"snapshot": {"fetched_at_utc": timestamp}, "last_error": error, "last_attempt_utc": current}):
                response = await health(None)
                self.assertEqual(response.status, status)

    async def test_scrapling_rejects_failed_source_responses(self):
        from server import fetch_url
        session = SimpleNamespace(fetch=AsyncMock(return_value=SimpleNamespace(status=403, body=b"blocked")))
        with patch("server.FETCH_BACKEND", "scrapling"):
            with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
                await fetch_url(session, "https://www.hltv.org/matches")
            session.fetch.return_value = SimpleNamespace(status=200, body=b"<html>match data</html>")
            self.assertEqual(await fetch_url(session, "https://www.hltv.org/matches"), "<html>match data</html>")

    async def test_startup_serves_cached_data_without_waiting_for_collector(self):
        app = {}
        started = asyncio.Event()
        blocked = asyncio.Event()

        async def collect():
            started.set()
            await blocked.wait()

        with patch("server.load_snapshot", return_value={"ok": True}), patch("server.refresh", new=AsyncMock(side_effect=collect)) as refresh:
            try:
                await asyncio.wait_for(on_startup(app), timeout=1)
                await asyncio.wait_for(started.wait(), timeout=1)
                self.assertEqual(refresh.await_count, 1)
            finally:
                await on_cleanup(app)
            self.assertTrue(app["refresh_task"].done())


class WorkerParserTests(unittest.TestCase):
    def test_detail_selection_rejects_naive_timestamp(self):
        self.assertFalse(wants_detail({"starts_at": "2026-07-28T13:00:00"}, datetime(2026, 7, 28, 12, tzinfo=timezone.utc)))

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
        <a class="result-con" data-zonedgrouping-entry-unix="1784980800000" href="/matches/2389000/result">
          <div class="team">MOUZ</div><div class="team">NAVI</div>
          <div class="result-score">2 - 1</div>
          <div class="event-name">Finals</div>
        </a>
        """
        rows = parse_results(html)
        self.assertEqual((rows[0]["score1"], rows[0]["score2"]), (2, 1))
        self.assertEqual(rows[0]["winner_name"], "MOUZ")
        self.assertEqual(rows[0]["status"], "finished")
        self.assertEqual(rows[0]["starts_at"], "2026-07-25T12:00:00Z")

    def test_detail_adds_veto_and_map_results(self):
        html = """
        <div class="timeAndEvent"><div class="event"><a href="/events/9999/example">Example Cup</a></div></div>
        <div class="veto-box">Spirit removed Ancient. Vitality picked Mirage.</div>
        <div class="lineup"><a href="/player/7998/s1mple">s1mple</a></div>
        <div class="lineup"><a href="/player/11816/ropz">ropz</a></div>
        <div class="stats-content" id="all-content">
          <table class="table totalstats"><tr><td class="players"><a href="/player/7998/s1mple"><span class="player-nick">s1mple</span></a></td><td class="kd text-center traditional-data">40-22</td><td class="adr text-center traditional-data">91.4</td><td class="kast text-center traditional-data">78.2%</td><td class="rating text-center">1.42</td></tr></table>
          <table class="table totalstats"><tr><td class="players"><a href="/player/11816/ropz"><span class="player-nick">ropz</span></a></td><td class="kd text-center traditional-data">29-31</td><td class="adr text-center traditional-data">75.1</td><td class="kast text-center traditional-data">70.0%</td><td class="rating text-center">1.03</td></tr></table>
        </div>
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
        self.assertEqual(detail["player_stats"][0]["rating"], 1.42)

        merged = merge_match_detail({
            "match_id": "hltv:detail-result",
            "team1_name": "Spirit",
            "team2_name": "Vitality",
            "series_format": "bo3",
            "status": "live",
            "starts_at": "2026-07-28T12:00:00Z",
        }, {**detail, "score1": 2, "score2": 0})
        self.assertEqual(merged["status"], "finished")
        self.assertEqual(merged["winner_name"], "Spirit")
        self.assertEqual(merged["lineups"]["team1"][0]["team_name"], "Spirit")
        self.assertEqual(merged["lineups"]["team1"][0]["timeline_entry"]["rating"], 1.42)
        players = players_from_matches([merged])
        self.assertEqual(len(players), 2)
        self.assertEqual(next(player for player in players if player["player_id"] == "hltv:7998")["rating_3_0"], 1.42)

    def test_detail_timeline_requires_anchored_terminal_result(self):
        stat = {
            "player_id": "hltv:7998",
            "nickname": "s1mple",
            "team_side": 1,
            "kills": 40,
            "deaths": 22,
            "rating": 1.42,
        }

        def merged_with(**overrides):
            match = {
                "match_id": "hltv:timeline-check",
                "team1_name": "Spirit",
                "team2_name": "Vitality",
                "series_format": "bo3",
                "status": "finished",
                "starts_at": "2026-09-20T12:00:00Z",
                "score1": 2,
                "score2": 0,
                **overrides,
            }
            return merge_match_detail(match, {"player_stats": [dict(stat)]})

        missing = merged_with(starts_at=None)
        malformed = merged_with(starts_at="2026-09-20T12:00:00")
        live_partial = merged_with(status="live", score1=1, score2=0)
        valid = merged_with()

        for candidate in (missing, malformed, live_partial):
            player = candidate["lineups"]["team1"][0]
            self.assertEqual(player["player_id"], "hltv:7998")
            self.assertNotIn("timeline_entry", player)
        self.assertEqual(valid["lineups"]["team1"][0]["timeline_entry"]["date"], "2026-09-20")

    def test_detail_priority_keeps_live_and_recent_results_first(self):
        now = datetime(2026, 7, 28, 12, tzinfo=timezone.utc)
        live = {"match_id": "live", "status": "live", "source_url": "live"}
        results = [{"match_id": f"result-{index}", "status": "finished", "source_url": "result"} for index in range(6)]
        upcoming = {"match_id": "upcoming", "status": "upcoming", "source_url": "upcoming", "starts_at": "2026-07-28T13:00:00Z"}
        selected = select_detail_candidates([live, upcoming, *results], results, now, 6)
        self.assertEqual([row["match_id"] for row in selected], ["live", "result-0", "result-1", "result-2", "result-3", "upcoming"])

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
