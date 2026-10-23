import unittest
import json
import tempfile
import asyncio
import sys
from unittest.mock import AsyncMock, patch
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from contextlib import asynccontextmanager

from server import archive, player_profiles, events_from_matches, liquipedia_evidence, merge_match_detail, parse_match_detail, parse_matches, parse_results, players_from_matches, save_snapshot, select_detail_candidates, wants_detail, on_startup, on_cleanup


class PrivateArchiveTests(unittest.IsolatedAsyncioTestCase):
    async def test_archive_and_liquipedia_require_configured_token(self):
        from aiohttp import web
        for handler, payload_name in ((archive, "archive_payload"), (liquipedia_evidence, "liquipedia_payload"), (player_profiles, "player_profile_payload")):
            with self.subTest(handler=handler.__name__), patch("server.os.environ", {}), patch(f"server.{payload_name}", return_value={"ok": True}):
                with self.assertRaises(web.HTTPUnauthorized):
                    await handler(SimpleNamespace(headers={"Authorization": "Bearer test"}))
            with self.subTest(handler=handler.__name__), patch("server.os.environ", {"ARCHIVE_BEARER_TOKEN": "correct"}), patch(f"server.{payload_name}", return_value={"ok": True}):
                with self.assertRaises(web.HTTPUnauthorized):
                    await handler(SimpleNamespace(headers={"Authorization": "Bearer wrong"}))
                response = await handler(SimpleNamespace(headers={"Authorization": "Bearer correct"}))
                self.assertEqual(response.status, 200)


class CurrentScheduleTests(unittest.TestCase):
    def test_current_upcoming_lineups_use_identified_player_data(self):
        from html import escape
        rows = {str(i): {"playerId": i, "nickname": f"player{i}", "profileLinkUrl": f"/player/{i}/player{i}", "numericRating": 1.2} for i in range(1, 6)}
        data = escape(json.dumps(rows), quote=True)
        detail = parse_match_detail(f'<div class="lineups-compare-container" data-team1-players-data="{data}" data-team2-players-data="{{bad}}"></div>')
        self.assertEqual(len(detail["lineups"]["team1"]), 5)
        self.assertEqual(detail["lineups"]["team2"], [])
        self.assertEqual(detail["lineups"]["team1"][0]["nickname"], "player1")
        self.assertNotIn("rating", detail["lineups"]["team1"][0], "A profile average is not a played-match rating")

    def test_detail_marks_a_completed_bo1_as_finished(self):
        merged = merge_match_detail(
            {"team1_name": "Alpha", "team2_name": "Beta", "series_format": "bo1", "status": "upcoming"},
            {"score1": 1, "score2": 0},
        )
        self.assertEqual(merged["status"], "finished")
        self.assertEqual(merged["winner_name"], "Alpha")

    def test_lineup_retains_only_a_valid_hltv_bodyshot(self):
        detail = parse_match_detail(
            '<div class="lineup"><a href="/player/1/alpha">Alpha<img src="https://img-cdn.hltv.org/playerbodyshot/token.png?s=signed"></a></div>'
        )
        self.assertEqual(detail["lineups"]["team1"][0]["portrait_url"], "https://img-cdn.hltv.org/playerbodyshot/token.png?s=signed")
        blocked = parse_match_detail(
            '<div class="lineup"><a href="/player/2/bravo">Bravo<img src="https://example.test/playerbodyshot/token.png"></a></div>'
        )
        self.assertNotIn("portrait_url", blocked["lineups"]["team1"][0])

    def test_star_rating_is_not_live_and_pinned_match_keeps_event(self):
        html = '''<div data-match-wrapper live="false" data-event-id="8932" class="match-wrapper">
          <div class="match"><a href="/matches/2399384/a-vs-b"><div class="matchLive match-rating"><i class="fa-star"></i></div></a>
          <div class="match-teamname">9z</div><div class="match-teamname">Aurora</div></div></div>
          <div class="match-event" data-event-id="8932" data-event-headline="Thunderpick World Championship 2026"></div>'''
        match = parse_matches(html)[0]
        self.assertEqual(match["status"], "upcoming")
        self.assertEqual(match["event_id"], "hltv:8932")
        self.assertEqual(match["event_name"], "Thunderpick World Championship 2026")
        self.assertEqual(parse_matches(html.replace('live="false"', 'live="true"'))[0]["status"], "live")


class WorkerLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_blocked_source_uses_longer_retry_delay(self):
        from server import BLOCKED_RETRY_SECONDS, POLL_SECONDS, retry_delay
        self.assertEqual(retry_delay("RuntimeError('Scrapling source returned HTTP 403')"), BLOCKED_RETRY_SECONDS)
        self.assertEqual(retry_delay("TimeoutError()"), BLOCKED_RETRY_SECONDS)
        self.assertEqual(retry_delay("RuntimeError('HTTP 429')"), BLOCKED_RETRY_SECONDS)
        self.assertEqual(retry_delay("RuntimeError('HTTP 500')"), POLL_SECONDS)

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
        session = SimpleNamespace(fetch=AsyncMock(return_value=SimpleNamespace(status=403, body=b"blocked")), close_pages=AsyncMock())
        with patch("server.FETCH_BACKEND", "scrapling"):
            with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
                await fetch_url(session, "https://www.hltv.org/matches")
            session.fetch.return_value = SimpleNamespace(status=200, body=b"<html>match data</html>")
            self.assertEqual(await fetch_url(session, "https://www.hltv.org/matches"), "<html>match data</html>")
            session.fetch.reset_mock()
            session.fetch.side_effect = [SimpleNamespace(status=403), SimpleNamespace(status=200, body=b"solved")]
            self.assertEqual(await fetch_url(session, "https://www.hltv.org/results"), "solved")
            self.assertFalse(session.fetch.await_args_list[0].kwargs["solve_cloudflare"])
            self.assertTrue(session.fetch.await_args_list[1].kwargs["solve_cloudflare"])
            session.fetch.reset_mock()
            session.fetch.side_effect = [SimpleNamespace(status=429)]
            with self.assertRaisesRegex(RuntimeError, "HTTP 429"):
                await fetch_url(session, "https://www.hltv.org/results")
            self.assertEqual(session.fetch.await_count, 1)

    async def test_failed_request_releases_the_only_browser_slot(self):
        from server import fetch_url
        busy = False

        async def fetch(url, **kwargs):
            nonlocal busy
            if busy:
                raise TimeoutError("No pages finished to clear place in the pool")
            busy = True
            if url == "slow":
                raise asyncio.TimeoutError("navigation timed out")
            return SimpleNamespace(status=200, body=b"next match")

        async def close_pages():
            nonlocal busy
            busy = False

        session = SimpleNamespace(fetch=fetch, close_pages=AsyncMock(side_effect=close_pages))
        with patch("server.FETCH_BACKEND", "scrapling"):
            with self.assertRaisesRegex(TimeoutError, "navigation timed out"):
                await fetch_url(session, "slow")
            self.assertEqual(await fetch_url(session, "next"), "next match")
            self.assertEqual(session.close_pages.await_count, 2)

    async def test_cancelled_request_releases_browser_pages(self):
        from server import fetch_url
        session = SimpleNamespace(fetch=AsyncMock(side_effect=asyncio.CancelledError), close_pages=AsyncMock())
        with patch("server.FETCH_BACKEND", "scrapling"), self.assertRaises(asyncio.CancelledError):
            await fetch_url(session, "cancelled")
        session.close_pages.assert_awaited_once()

    async def test_startup_serves_cached_data_without_waiting_for_collector(self):
        app = {}
        started = asyncio.Event()
        blocked = asyncio.Event()

        async def collect():
            started.set()
            await blocked.wait()

        with patch("server.load_snapshot", return_value={"ok": True}), patch("server.archive_connection"), patch("server.ARCHIVE_BACKFILL_ENABLED", False), patch("server.refresh", new=AsyncMock(side_effect=collect)) as refresh:
            try:
                await asyncio.wait_for(on_startup(app), timeout=1)
                await asyncio.wait_for(started.wait(), timeout=1)
                self.assertEqual(refresh.await_count, 1)
                self.assertNotIn("archive_task", app)
            finally:
                await on_cleanup(app)
            self.assertTrue(app["refresh_task"].done())

    async def test_source_sessions_never_open_two_browsers_at_once(self):
        from server import source_session
        active = peak = 0

        @asynccontextmanager
        async def session(*args, **kwargs):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            try:
                yield object()
            finally:
                active -= 1

        async def collect():
            async with source_session():
                await asyncio.sleep(0)

        with patch("server.source_lock", asyncio.Lock()), patch("server.FETCH_BACKEND", "flaresolverr"), patch("server.ClientSession", session):
            await asyncio.gather(collect(), collect())
        self.assertEqual((peak, active), (1, 0))

    async def test_backfill_batch_reuses_session_and_stops_at_floor(self):
        from server import backfill_batch
        entered = []
        browser = object()

        @asynccontextmanager
        async def session():
            entered.append(browser)
            yield browser

        with patch("server.source_session", session), patch("server.BACKFILL_BATCH_PAGES", 4), patch("server.backfill_once", new=AsyncMock(side_effect=[False, True])) as page, patch("server.asyncio.sleep", new=AsyncMock()) as sleep:
            self.assertTrue(await backfill_batch())
        self.assertEqual(entered, [browser])
        self.assertEqual(page.await_count, 2)
        self.assertTrue(all(call.args == (browser,) for call in page.await_args_list))
        self.assertEqual(sleep.await_count, 1)

    async def test_browser_is_reused_recycled_and_closed_on_shutdown(self):
        from server import source_session, on_cleanup
        contexts = []

        def browser(**kwargs):
            context = SimpleNamespace(__aenter__=AsyncMock(return_value=object()), __aexit__=AsyncMock())
            contexts.append(context)
            return context

        with patch("server.state", {}), patch("server.source_lock", asyncio.Lock()), patch("server.FETCH_BACKEND", "scrapling"), patch.dict(sys.modules, {"scrapling.fetchers": SimpleNamespace(AsyncStealthySession=browser)}):
            sessions = []
            for _ in range(11):
                async with source_session() as session:
                    sessions.append(session)
            self.assertEqual(len(contexts), 2)
            self.assertTrue(all(session is sessions[0] for session in sessions[:10]))
            self.assertIsNot(sessions[0], sessions[10])
            self.assertEqual(contexts[0].__aexit__.await_count, 1)
            with self.assertRaisesRegex(RuntimeError, "broken browser"):
                async with source_session():
                    raise RuntimeError("broken browser")
            self.assertEqual(contexts[1].__aexit__.await_count, 1)
            async with source_session():
                pass
            await on_cleanup({})
            self.assertEqual(contexts[2].__aexit__.await_count, 1)

    async def test_backfill_validates_before_advancing_and_records_progress(self):
        from server import backfill_once, archive_connection, record_results, backfill_status
        with tempfile.TemporaryDirectory() as directory, patch("server.ARCHIVE_PATH", Path(directory) / "results.sqlite3"), patch("server.ARCHIVE_BACKFILL_ENABLED", True):
            rows = [{"match_id": f"hltv:{index}", "status": "finished", "starts_at": "2026-07-12T12:00:00Z",
                     "team1_name": "A", "team2_name": "B", "score1": 2, "score2": 1} for index in range(100)]
            record_results(rows[:50])
            with archive_connection() as connection:
                connection.execute("INSERT INTO archive_meta VALUES ('backfill_offset','2700')")
                connection.execute("INSERT INTO backfill_pages VALUES (2650,'2026-07-12','2026-07-17',100,'2026-09-27')")
            with patch("server.fetch_url", new=AsyncMock(return_value="html")), patch("server.parse_results", return_value=rows[:-1]):
                with self.assertRaisesRegex(RuntimeError, "Incomplete"):
                    await backfill_once(object())
            self.assertEqual(backfill_status()["offset"], 2700)
            with patch("server.fetch_url", new=AsyncMock(return_value="html")), patch("server.parse_results", return_value=rows):
                self.assertFalse(await backfill_once(object()))
            status = backfill_status()
            self.assertEqual((status["offset"], status["last_added"], status["pages"]), (2750, 50, 2))
            self.assertFalse(status["stalled"])
            with patch("server.ARCHIVE_BACKFILL_ENABLED", False):
                self.assertTrue(backfill_status()["stalled"])

    async def test_detail_cache_preserves_current_score_and_refetches_status_change(self):
        from server import fetch_snapshot, HLTV_MATCHES_URL, HLTV_RESULTS_URL
        current = datetime.now(timezone.utc).isoformat()
        match = {"match_id": "hltv:1", "event_id": "hltv:cup", "event_name": "IEM Cup", "source_url": "detail",
                 "status": "finished", "starts_at": current, "team1_name": "A", "team2_name": "B", "score1": 2, "score2": 1}
        cached = {**match, "detail_fetched_at_utc": current, "maps": ["Mirage"], "lineups": {"team1": [{"player_id": "hltv:7", "nickname": "Player"}]}}

        @asynccontextmanager
        async def session():
            yield object()

        async def fetch(browser, url):
            return url

        with patch("server.source_session", session), patch("server.parse_matches", return_value=[]), patch("server.parse_results", return_value=[match]), patch("server.fetch_url", new=AsyncMock(side_effect=fetch)) as request, patch("server.state", {"snapshot": {"matches": [cached]}}):
            snapshot = await fetch_snapshot()
            self.assertEqual(request.await_count, 2)
            self.assertEqual(snapshot["matches"][0]["score2"], 1)
            self.assertEqual(snapshot["matches"][0]["maps"], ["Mirage"])
            self.assertEqual(snapshot["source_health"]["detail_cache_hits"], 1)
            self.assertEqual(len(snapshot["players"]), 1)
        with patch("server.source_session", session), patch("server.parse_matches", return_value=[]), patch("server.parse_results", return_value=[match]), patch("server.fetch_url", new=AsyncMock(side_effect=fetch)) as request, patch("server.parse_match_detail", return_value={"maps": ["Nuke"]}), patch("server.state", {"snapshot": {"matches": [{**cached, "status": "upcoming"}]}}):
            snapshot = await fetch_snapshot()
            self.assertEqual(request.await_count, 3)
            self.assertEqual(snapshot["matches"][0]["maps"], ["Nuke"])
        with patch("server.source_session", session), patch("server.parse_matches", return_value=[]), patch("server.parse_results", return_value=[match]), patch("server.fetch_url", new=AsyncMock(side_effect=fetch)) as request, patch("server.parse_match_detail", return_value={"maps": ["Nuke"]}), patch("server.state", {"snapshot": {"matches": [{**cached, "score2": 0}]}}):
            await fetch_snapshot()
            self.assertEqual(request.await_count, 3)


class WorkerParserTests(unittest.TestCase):
    def test_backfill_never_advances_past_partial_or_unusable_page(self):
        from server import validate_backfill_page
        rows = [{"match_id": f"hltv:{index}", "status": "finished", "starts_at": "2026-09-22T12:00:00Z",
                 "team1_name": "A", "team2_name": "B", "score1": 2, "score2": 1} for index in range(100)]
        self.assertEqual(len(validate_backfill_page(rows, 350)), 100)
        with self.assertRaisesRegex(RuntimeError, "Incomplete HLTV result page"):
            validate_backfill_page(rows[:-1], 350)
        with self.assertRaisesRegex(RuntimeError, "Incomplete HLTV result page"):
            validate_backfill_page([*rows[:-1], {**rows[-1], "score1": None}], 350)

    def test_archive_keeps_dated_terminal_results_and_rejects_unanchored_scores(self):
        from server import archive_payload, record_results
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "results.sqlite3"
            valid = {"match_id": "hltv:1", "status": "finished", "starts_at": "2026-09-22T12:00:00Z", "team1_name": "A", "team2_name": "B", "score1": 2, "score2": 1, "winner_name": "A"}
            self.assertEqual(record_results([valid, {**valid, "match_id": "hltv:2", "starts_at": None}], archive_path), 1)
            self.assertEqual(record_results([valid], archive_path), 0)
            archived = archive_payload(archive_path)["matches"]
            self.assertEqual(len(archived), 1)
            self.assertEqual(archived[0]["match_id"], "hltv:1")
            record_results([{**valid, "maps": ["Nuke"]}], archive_path)
            record_results([valid], archive_path)
            self.assertEqual(archive_payload(archive_path)["matches"][0]["maps"], ["Nuke"])

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

    def test_tied_result_card_is_archived_without_a_winner(self):
        from server import archived_result
        html = """
        <a class="result-con" data-zonedgrouping-entry-unix="1784980800000" href="/matches/2389001/result">
          <div class="team">MOUZ</div><div class="team">NAVI</div>
          <div class="result-score">12 - 12</div>
          <div class="event-name">Finals</div>
        </a>
        """
        row = parse_results(html)[0]
        self.assertIsNone(row["winner_name"])
        self.assertIsNone(archived_result({**row, "winner_name": "NAVI"}))
        self.assertIsNone(archived_result(row)["winner_name"])

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
        player = next(player for player in players if player["player_id"] == "hltv:7998")
        self.assertEqual(player["form_timeline"][0]["rating"], 1.42)
        self.assertNotIn("rating_3_0", player, "A series sample is not a three-month profile rating")
        self.assertNotIn("maps_3m", player)

    def test_current_profile_summary_is_dated_and_closing_is_not_clutching(self):
        from server import player_profile_from_html
        html = """<link rel="canonical" href="https://www.hltv.org/player/7/seven"><h1>Seven</h1>
        <img alt="Seven" src="https://img-cdn.hltv.org/playerbodyshot/seven.png">
        <img alt="Other" src="https://img-cdn.hltv.org/playerbodyshot/other.png">
        <h2>Seven statistics(Past 3 months • 63 maps)</h2>
        Rating 3.0 1.37 Firepower 98/100 Entrying 62/100 Trading 73/100 Opening 89/100 Closing 29/100 Sniping 0/100 Utility 36/100 Complete statistics for Seven"""
        profile = player_profile_from_html(html, "7", "https://www.hltv.org/player/7/seven")
        self.assertEqual(profile["rating_3_0"], 1.37)
        self.assertEqual(profile["maps_3m"], 63)
        self.assertEqual(profile["stats_window"], "past_3_months")
        self.assertEqual(profile["traits"]["sniping"], 0)
        self.assertEqual(profile["traits"]["closing"], 29)
        self.assertNotIn("clutching", profile["traits"])
        self.assertIn("seven.png", profile["portrait_url"])
        duplicated = html.replace('<img alt="Other"', '<img alt="Seven" src="https://img-cdn.hltv.org/playerbodyshot/seven.png?w=200"><img alt="Other"')
        self.assertIn("seven.png", player_profile_from_html(duplicated, "7", profile["source_url"])["portrait_url"])
        self.assertNotIn("rating_3_0", player_profile_from_html(html.replace("Past 3 months", "Career"), "7", profile["source_url"]))
        self.assertNotIn("rating_3_0", player_profile_from_html(html.replace("Rating 3.0", "Rating 2.0"), "7", profile["source_url"]))

    def test_player_profile_queue_preserves_zero_and_marks_missing_data_unavailable(self):
        from server import due_player_profile, player_profile_from_html, player_profile_payload, save_player_profile, seed_player_profiles
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "results.sqlite3"
            seed = {"player_id": "hltv:7", "hltv_player_id": "7", "nickname": "Seven", "source_url": "https://www.hltv.org/player/7/seven"}
            self.assertEqual(seed_player_profiles([seed], path), 1)
            self.assertEqual(due_player_profile(path)["player_id"], "hltv:7")
            profile = player_profile_from_html('''<link rel="canonical" href="https://www.hltv.org/player/7/seven"><div class="playerNickname">Seven</div><div class="player-country"><img alt="Denmark"></div>
                <div class="playerSummaryStatBox"><span class="summaryStatBreakdownDataLabel">Rating 3.0</span><span class="summaryStatBreakdownDataValue">0.00</span></div>
                <div class="player-image"><img src="https://img-cdn.hltv.org/playerbodyshot/seven.png?s=token"></div>''', "7", seed["source_url"])
            with self.assertRaises(ValueError):
                player_profile_from_html('<link rel="canonical" href="https://www.hltv.org/player/8/eight">', "7", seed["source_url"])
            self.assertEqual(profile["stats"]["rating_3_0"], 0.0)
            save_player_profile(seed, profile, path=path)
            row = player_profile_payload(path)["players"][0]
            self.assertEqual(row["stats"]["rating_3_0"], 0.0)
            self.assertEqual(row["portrait_state"], "verified")
            seed_missing = {"player_id": "hltv:8", "hltv_player_id": "8", "nickname": "Eight", "source_url": "https://www.hltv.org/player/8/eight"}
            seed_player_profiles([seed_missing], path)
            save_player_profile(seed_missing, {"player_id": "hltv:8", "source_url": seed_missing["source_url"]}, error="Profile page contained no recognized profile data.", unavailable=True, path=path)
            missing = next(row for row in player_profile_payload(path)["players"] if row["player_id"] == "hltv:8")
            self.assertIsNone(missing["profile_fetched_at_utc"])
            self.assertEqual(missing["portrait_state"], "unavailable")
            self.assertEqual(missing["stats_state"], "unavailable")

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

    def test_detail_priority_keeps_live_and_prematch_lineups_before_results(self):
        now = datetime(2026, 7, 28, 12, tzinfo=timezone.utc)
        live = {"match_id": "live", "status": "live", "source_url": "live"}
        results = [{"match_id": f"result-{index}", "status": "finished", "source_url": "result"} for index in range(6)]
        upcoming = {"match_id": "upcoming", "status": "upcoming", "source_url": "upcoming", "starts_at": "2026-07-28T13:00:00Z"}
        selected = select_detail_candidates([live, upcoming, *results], results, now, 6)
        self.assertEqual([row["match_id"] for row in selected], ["live", "upcoming", "result-0", "result-1", "result-2", "result-3"])
        selected = select_detail_candidates([live, upcoming, *results], results, now, 4, {"result-0", "result-1"})
        self.assertEqual([row["match_id"] for row in selected], ["live", "upcoming", "result-2", "result-3"])

    def test_event_format_is_inferred_from_stages(self):
        event = events_from_matches([
            {"event_id": "hltv:1", "event_name": "Cup", "team1_name": "A", "team2_name": "B", "stage_name": "Upper bracket semifinal", "status": "finished"},
            {"event_id": "hltv:1", "event_name": "Cup", "team1_name": "C", "team2_name": "D", "stage_name": "Lower bracket final", "status": "live"},
        ])[0]
        self.assertEqual(event["format"]["type"], "double_elimination")
        self.assertEqual(event["current_stage"], "Lower bracket final")
        self.assertEqual(len(event["format"]["stages"]), 2)



class EventCurationTests(unittest.TestCase):
    def test_shared_quality_floor(self):
        from event_policy import POLICY, product_tier
        for name, declared, expected in POLICY["cases"]:
            with self.subTest(name=name):
                self.assertEqual(product_tier(name, declared), expected)

if __name__ == "__main__":
    unittest.main()
