import unittest
from unittest.mock import patch, AsyncMock
from pathlib import Path
from tempfile import TemporaryDirectory

import pandascore


def tournament():
    return {"id": 10, "serie_id": 20, "name": "Group A", "tier": "s", "league": {"name": "IEM"}, "serie": {"full_name": "Test 2026"}}


def match():
    return {"id": 1, "tournament_id": 10, "status": "not_started", "opponents": [{"type": "Team", "opponent": {"id": 101, "name": "Alpha"}}, {"type": "Team", "opponent": {"id": 102, "name": "Beta"}}], "number_of_games": 3, "scheduled_at": "2026-11-02T10:00:00Z", "results": [{"team_id": 101, "score": 0}, {"team_id": 102, "score": 0}]}


class FixtureTests(unittest.TestCase):
    def test_only_reviewed_main_tournaments(self):
        for name, tier, expected in (("Group A", "s", "tier_1"), ("Open Qualifier", "s", "excluded"), ("Group A", "c", "excluded"), ("Group A", "d", "excluded")):
            self.assertEqual(pandascore.tournament_tier({**tournament(), "name": name, "tier": tier}), expected)

    def test_unknown_pair_and_bad_dates_are_not_invented(self):
        row = match()
        row["opponents"] = []
        self.assertIsNone(pandascore.normalize_match(row, {10: tournament()}))
        self.assertIsNone(pandascore.stamp("2026-11-02T10:00:00"))
        for value in (False, True, "", "0", None, -1):
            self.assertIsNone(pandascore.score(value))
        self.assertEqual(pandascore.score(0), 0)

    def test_scheduled_counters_are_not_results(self):
        value = pandascore.normalize_match(match(), {10: tournament()})
        self.assertEqual(value["status"], "upcoming")
        self.assertIsNone(value["score1"])
        self.assertIsNone(value["winner_name"])
        self.assertEqual(value["source_match_id"], "pandascore:1")
        self.assertEqual(value["lineups"], {})

    def test_result_scores_follow_team_ids_not_response_order(self):
        row = {**match(), "status": "finished", "winner_id": 102, "results": [{"team_id": 102, "score": 2}, {"team_id": 101, "score": 0}]}
        value = pandascore.normalize_match(row, {10: tournament()})
        self.assertEqual((value["score1"], value["score2"], value["winner_name"]), (0, 2, "Beta"))
        row["status"] = "canceled"
        value = pandascore.normalize_match(row, {10: tournament()})
        self.assertEqual(value["status"], "cancelled")
        self.assertIsNone(value["score1"])
        self.assertIsNone(value["winner_name"])

    def test_identity_reuse_requires_one_exact_fixture(self):
        value = pandascore.normalize_match(match(), {10: tournament()})
        old = {**value, "match_id": "hltv:known", "slot_id": "upper:1"}
        old.pop("source_match_id")
        pandascore.reconcile_ids([value], [old])
        self.assertEqual(value["match_id"], "hltv:known")
        self.assertEqual(value["source_match_id"], "pandascore:1")
        self.assertEqual(value["slot_id"], "upper:1")
        fresh = pandascore.normalize_match(match(), {10: tournament()})
        pandascore.reconcile_ids([fresh], [old, {**old, "match_id": "hltv:ambiguous"}])
        self.assertEqual(fresh["match_id"], "pandascore:1")


class CollectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_pagination_finishes_or_fails_without_partial_success(self):
        with patch("pandascore.get_page", new=AsyncMock(side_effect=[[{}] * 100, [{"id": 2}]])) as get:
            self.assertEqual(len(await pandascore.get_all(None, "matches/upcoming", {})), 101)
            self.assertEqual(get.await_args_list[1].args[2]["page"], 2)
        with patch("pandascore.get_page", new=AsyncMock(return_value=[{}] * 100)):
            with self.assertRaisesRegex(RuntimeError, "incomplete coverage"):
                await pandascore.get_all(None, "matches/upcoming", {})

    async def test_provider_mode_starts_no_hltv_profile_or_archive_tasks(self):
        import server
        async def nothing(*args):
            return None
        with TemporaryDirectory() as directory, patch("server.ARCHIVE_PATH", Path(directory) / "data.sqlite3"), patch("server.FIXTURE_PROVIDER", "pandascore"), patch("server.load_snapshot", return_value={"ok": True}), patch("server.refresh_loop", side_effect=nothing):
            app = {}
            try:
                await server.on_startup(app)
                self.assertNotIn("archive_task", app)
                self.assertNotIn("player_profile_task", app)
            finally:
                await server.on_cleanup(app)

    async def test_provider_dispatch_uses_persistent_activation_and_keeps_legacy_pause(self):
        import server
        with TemporaryDirectory() as directory, patch("server.ARCHIVE_PATH", Path(directory) / "data.sqlite3"), patch("server.FIXTURE_PROVIDER", "pandascore"), patch("server.pandascore.fetch_snapshot", new=AsyncMock(return_value={"ok": True})) as fetch, patch("server.source_session") as hltv:
            server.save_source_retry("match", 3600)
            with server.archive_connection() as connection:
                before = dict(connection.execute("SELECT key,value FROM archive_meta"))
            await server.fetch_snapshot()
            await server.fetch_snapshot()
            self.assertEqual(fetch.await_args_list[0].args[2], fetch.await_args_list[1].args[2])
            hltv.assert_not_called()
            with server.archive_connection() as connection:
                after = dict(connection.execute("SELECT key,value FROM archive_meta"))
            self.assertEqual(before["source_retry_match_utc"], after["source_retry_match_utc"])

    async def test_retry_after_is_retained_without_replacing_last_good_data(self):
        import server
        with patch("server.state", {"snapshot": {"source": "old"}}), patch("server.fetch_snapshot", new=AsyncMock(side_effect=pandascore.PandaScoreAccessError(429, "7200"))):
            await server.refresh()
            self.assertEqual(server.state["provider_retry_seconds"], 7200)
            self.assertEqual(server.state["snapshot"], {"source": "old"})


if __name__ == "__main__":
    unittest.main()
