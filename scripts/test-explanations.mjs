import assert from "node:assert/strict";
import { explainMatch } from "../docs/lib/explanations.js";

const first = explainMatch({
  team1_name: "Alpha",
  team2_name: "Bravo",
  prob_team1: 0.7,
  rating1: 1750,
  rating2: 1500,
  form1: 0.7,
  form2: 0.5,
  map_depth1: 0.45,
  map_depth2: 0.58,
  vrs_rank1: 2,
  vrs_rank2: 12,
  lineup1_count: 5,
  lineup2_count: 5,
  veto1_sample: 30,
  veto2_sample: 25,
  map_adjusted_prob_team1: 0.67,
  map_evidence: 42,
});
assert.equal(first.favorite, "Alpha");
assert.equal(first.supports[0].key, "rating");
assert.equal(first.counter.key, "maps");
assert.equal(first.risk.label, "Map depth disagrees");

const second = explainMatch({ team1_name: "Alpha", team2_name: "Bravo", prob_team1: 0.42, rating1: 1450, rating2: 1600, form1: 0.4, form2: 0.6, map_depth1: 0.48, map_depth2: 0.55, lineup1_count: 5, lineup2_count: 3 });
assert.equal(second.favorite, "Bravo");
assert.equal(second.risk.label, "Lineup gap");

const thin = explainMatch({ team1_name: "Alpha", team2_name: "Bravo", prob_team1: 0.52, lineup1_count: 5, lineup2_count: 5 });
assert.equal(thin.risk.label, "Thin edge");
console.log("match explanation engine tests ok");
