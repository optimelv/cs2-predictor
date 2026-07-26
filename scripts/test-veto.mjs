import assert from "node:assert/strict";
import {
  applyVetoMap,
  buildRecommendedVeto,
  createVetoState,
  vetoSeriesRead,
} from "../docs/lib/veto.js";

const pool = ["Ancient", "Anubis", "Dust2", "Inferno", "Mirage", "Nuke", "Overpass"];
const maps = {
  alpha: Object.fromEntries(pool.map((mapName, index) => [mapName, { matches: 20, wins: 7 + index }])),
  bravo: Object.fromEntries(pool.map((mapName, index) => [mapName, { matches: 20, wins: 13 - index }])),
};
const vetoes = {
  alpha: { perma_ban: "Ancient", first_pick: "Nuke", maps: { Ancient: { bans: 20, ban_share: 0.7 }, Nuke: { picks: 12, pick_share: 0.6 } } },
  bravo: { perma_ban: "Overpass", first_pick: "Dust2", maps: { Overpass: { bans: 18, ban_share: 0.65 }, Dust2: { picks: 11, pick_share: 0.55 } } },
};

let state = createVetoState({ pool, team1: "Alpha", team2: "Bravo", bestOf: 3 });
state = applyVetoMap(state, "Ancient");
assert.equal(state.actions[0].actor, "Alpha");
assert.equal(state.actions[0].action, "ban");
assert.throws(() => applyVetoMap(state, "Ancient"), /no longer available/);

const recommended = buildRecommendedVeto({ pool, team1: "Alpha", team2: "Bravo", bestOf: 3 }, maps, vetoes);
assert.equal(recommended.complete, true);
assert.equal(recommended.actions.length, 7);
assert.equal(recommended.actions[0].map_name, "Ancient");
assert.equal(recommended.actions[1].map_name, "Overpass");
assert.equal(recommended.actions.at(-1).action, "decider");
assert.equal(new Set(recommended.actions.map((row) => row.map_name)).size, 7);

for (const bestOf of [1, 3, 5]) {
  const tree = buildRecommendedVeto({ pool, team1: "Alpha", team2: "Bravo", bestOf }, maps, vetoes);
  const read = vetoSeriesRead(tree, { baseProbability: 0.55, mapProfiles: maps });
  assert.equal(read.maps.length, bestOf);
  assert.ok(read.prob_team1 > 0 && read.prob_team1 < 1);
}

console.log("veto engine tests ok");
