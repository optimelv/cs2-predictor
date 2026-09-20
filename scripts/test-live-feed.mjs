import assert from "node:assert/strict";
import { filterProductLiveSnapshot } from "../docs/lib/live-feed.js";

const filtered = filterProductLiveSnapshot({
  ok: true,
  events: [
    { id: "major", name: "PGL Singapore Major 2026", tier: "Major" },
    { id: "cct", name: "CCT Europe Series", tier: "B-Tier" },
    { id: "cash-cup", name: "Regional Cash Cup", tier: "C-Tier" },
  ],
  matches: [
    { match_id: "1", event_id: "major", event_name: "PGL Singapore Major 2026", lineups: { team1: [{ player_id: "hltv:1", nickname: "one", team_name: "Major Team" }], team2: [] } },
    { match_id: "2", event_id: "cct", event_name: "CCT Europe Series", lineups: { team1: [{ hltv_player_id: "2", nickname: "two", team_name: "CCT Team" }], team2: [] } },
    { match_id: "3", event_id: "cash-cup", event_name: "Regional Cash Cup", product_tier: "excluded", lineups: { team1: [{ player_id: "hltv:3" }], team2: [] } },
  ],
  players: [{ player_id: "hltv:1", rating_3_0: 1.14 }, { player_id: "hltv:2" }, { player_id: "hltv:3" }],
});

assert.deepEqual(filtered.events.map((event) => event.id), ["major", "cct"]);
assert.deepEqual(filtered.matches.map((match) => match.match_id), ["1", "2"]);
assert.deepEqual(filtered.matches.map((match) => match.product_tier), ["tier_1", "tier_2"]);
assert.deepEqual(filtered.players.map((player) => player.player_id), ["hltv:1", "hltv:2"]);
assert.equal(filtered.players[0].nickname, "one");
assert.equal(filtered.players[0].rating_3_0, 1.14);
assert.equal(filtered.players[1].team_name, "CCT Team");
assert.deepEqual(filtered.product_filter.eligible_tiers, ["tier_1", "tier_2"]);

const noLineupPlayers = filterProductLiveSnapshot({
  events: [{ id: "major", name: "PGL Singapore Major 2026", tier: "Major" }],
  matches: [{ match_id: "4", event_id: "major", event_name: "PGL Singapore Major 2026" }],
  players: [{ player_id: "hltv:99", nickname: "unscoped" }],
});
assert.deepEqual(noLineupPlayers.players, []);
console.log("live feed product filter tests ok");
