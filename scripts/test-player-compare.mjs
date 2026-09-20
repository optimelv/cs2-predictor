import assert from "node:assert/strict";
import { buildPlayerCompareUrl, comparePlayerProfiles, parsePlayerCompare, serializePlayerCompare } from "../docs/lib/player-compare.js";

assert.deepEqual(parsePlayerCompare("hltv:1,hltv:2,hltv:3", ["hltv:1", "hltv:2"]), ["hltv:1", "hltv:2"]);
assert.deepEqual(parsePlayerCompare("hltv:1,hltv:1"), ["hltv:1"]);
assert.equal(serializePlayerCompare(["hltv:2", "hltv:1"]), "hltv:2,hltv:1");

const url = new URL(buildPlayerCompareUrl("https://example.com/?event=e1&player=p1&desk=x#featured", ["hltv:1", "hltv:2"]));
assert.equal(url.searchParams.get("compare"), "hltv:1,hltv:2");
assert.equal(url.searchParams.has("event"), false);
assert.equal(url.searchParams.has("player"), false);
assert.equal(url.searchParams.has("desk"), false);
assert.equal(url.hash, "#players");

const left = {
  player_id: "hltv:1", nickname: "Alpha", rating_3_0: 1.31, signal_index: 91, maps_3m: 40,
  form_summary: { recent_rating: 1.28, average_adr: 84.2 },
  traits: { firepower: 94, entrying: 80, trading: 65, opening: 90, clutching: 72, sniping: 5, utility: 51 },
  map_profile: [{ map_name: "Mirage", maps: 8, average_rating: 1.35, average_adr: 86, kd_ratio: 1.3, win_rate: 0.75 }],
};
const right = {
  player_id: "hltv:2", nickname: "Bravo", rating_3_0: 1.22, signal_index: 86, maps_3m: 44,
  form_summary: { recent_rating: 1.34, average_adr: 79.1 },
  traits: { firepower: 88, entrying: 42, trading: 75, opening: 84, clutching: 89, sniping: 92, utility: 68 },
  map_profile: [{ map_name: "Mirage", maps: 5, average_rating: 1.18 }, { map_name: "Nuke", maps: 6, average_rating: 1.27 }],
};
const comparison = comparePlayerProfiles(left, right);
assert.equal(comparison.metrics[0].left, 1.31);
assert.deepEqual(comparison.trait_lead, { left: 3, right: 4, tied: 0 });
assert.deepEqual(comparison.maps.map(({ map_name }) => map_name), ["Mirage", "Nuke"]);
assert.equal(comparePlayerProfiles(null, right), null);
console.log("player compare contract tests ok");
