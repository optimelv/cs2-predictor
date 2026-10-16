import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
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
for (const missing of [undefined, null, '', ' ', false]) {
  const sparse = explainMatch({ team1_name: 'Alpha', team2_name: 'Bravo', prob_team1: .7,
    rating1: 1750, rating2: missing, form1: .7, form2: missing, map_depth1: .6, map_depth2: missing,
    map_adjusted_prob_team1: missing, lineup1_count: 5, lineup2_count: 5 });
  assert.equal(sparse.signal_count, 0, 'Missing evidence must not become a numeric comparison');
  assert.equal(sparse.risk.label, 'Context unavailable');
  assert.equal(explainMatch({ prob_team1: missing }).favorite, null, 'Missing forecast must not invent a favorite');
}
const zeroForm = explainMatch({ team1_name: 'Alpha', team2_name: 'Bravo', prob_team1: .7, form1: .7, form2: 0 });
assert.equal(zeroForm.supports[0].detail, '70 /100 vs 0 /100', 'An observed zero is real evidence');

const source = await readFile(new URL('../docs/app.js', import.meta.url), 'utf8');
const enrichStart = source.indexOf('function enrichMatch(match)');
const enrichEnd = source.indexOf('function matchKeyOf(', enrichStart);
assert.ok(enrichStart >= 0 && enrichEnd > enrichStart);
const enrichContext = vm.createContext({ pairProbability: () => .63 });
vm.runInContext(source.slice(enrichStart, enrichEnd), enrichContext);
for (const prob_team1 of [undefined, null, '', ' ', false, true, NaN, Infinity, -1, 0, 1, 2]) {
  assert.equal(enrichContext.enrichMatch({ prob_team1 }).prob_team1, .63, 'Invalid source probabilities must use the model fallback, not become an 8%/92% forecast');
}
assert.equal(enrichContext.enrichMatch({ prob_team1: .7 }).prob_team1, .7);
assert.equal(enrichContext.enrichMatch({ prob_team1: '0.7' }).prob_team1, .7);

const pairStart = source.indexOf('function pairProbability(');
const pairEnd = source.indexOf('function ', pairStart + 1);
assert.ok(pairStart >= 0 && pairEnd > pairStart);
let measuredForm;
const pairContext = vm.createContext({
  appData: {},
  teamModel: (name) => ({ elo: 1500, hasState: true, recent_win_rate_10: name === 'Alpha' ? 0 : .5 }),
  portableProductionProbability: (_champion, features, baseline) => { measuredForm = features.recent_win_rate_10_diff; return baseline; },
});
vm.runInContext(source.slice(pairStart, pairEnd), pairContext);
assert.ok(pairContext.pairProbability('Alpha', 'Bravo') < .5);
assert.equal(measuredForm, -.5, 'A real zero win rate must reach the model unchanged');

const knownStart = source.indexOf('function allKnownMatches()');
const knownEnd = source.indexOf('function matchesForTeam(', knownStart);
assert.ok(knownStart >= 0 && knownEnd > knownStart);
const series = { match_id: 'shared', team1_name: 'Alpha', team2_name: 'Bravo' };
enrichContext.appData = { coverage: { daily_matches: [{ ...series, prob_team1: .65 }] }, upcoming_predictions: [{ ...series, prob_team1: .7 }] };
enrichContext.availableEvents = () => [{ matches: [{ ...series, prob_team1: .6, lineups: { team1: ['verified player'] } }] }];
enrichContext.matchKeyOf = (match) => match.match_id;
vm.runInContext(source.slice(knownStart, knownEnd), enrichContext);
assert.equal(enrichContext.allKnownMatches().length, 1);
assert.equal(enrichContext.allKnownMatches()[0].prob_team1, .7, 'Team profiles and follows must retain the same published estimate as the match desk');
assert.equal(enrichContext.allKnownMatches()[0].lineups.team1[0], 'verified player', 'Forecast precedence must preserve supplementary source evidence');
assert.equal(explainMatch({ team1_name: "A", team2_name: "B", prob_team1: .65, rating1: 1900, rating2: 1500, rating_label: "VRS points" }).supports[0].label, "VRS points");
console.log("match estimate and explanation engine tests ok");

assert.ok(source.includes("not a verified pre-match forecast"), "Results must distinguish the current model estimate from a recorded pre-match forecast");
assert.ok(source.includes("Smoothed model indicator"), "Form must explain its smoothed model semantics");

const ledgerStart = source.indexOf('function pickLineRead(');
const ledgerEnd = source.indexOf('function myDeskPicksHtml(', ledgerStart);
let ledgerRecord = { team1_name: 'Alpha', latest: { prob_team1: .51 }, closing_prob_team1: null };
const ledgerContext = vm.createContext({ signalState: {}, normalizeName: (value) => String(value).toLowerCase(), matchSignalRecord: () => ledgerRecord });
vm.runInContext(source.slice(ledgerStart, ledgerEnd), ledgerContext);
const saved = { team_name: 'Alpha', probability: .5 };
assert.equal(ledgerContext.pickLineRead('m1', saved, { team1_name: 'Alpha', prob_team1: .62 }).probability, .62, 'A stale signal cache cannot override the current match estimate in My picks');
ledgerRecord.closing_prob_team1 = .56;
assert.equal(ledgerContext.pickLineRead('m1', saved, { team1_name: 'Alpha', prob_team1: .62 }).probability, .56, 'A recorded closing line remains the comparison after match start');

const closeStart = source.indexOf('function closeVetoLab()');
const closeEnd = source.indexOf('function mapRow(', closeStart);
let restoredFocus = false;
const vetoContext = vm.createContext({
  els: { vetoLabLayer: { hidden: false, classList: { remove() {}, contains: () => false } } },
  document: { body: { classList: { remove() {} } }, querySelector: () => ({ focus() { restoredFocus = true; } }) },
  vetoReturnFocus: { isConnected: false }, activeVetoMatch: { match_id: 'm1' },
  CSS: { escape: (value) => value }, matchKeyOf: (match) => match.match_id,
  motionDuration: () => 0, window: { setTimeout: (callback) => callback() },
});
vm.runInContext(source.slice(closeStart, closeEnd), vetoContext);
vetoContext.closeVetoLab();
assert.equal(restoredFocus, true, 'Closing Veto Lab must restore focus even after the match desk rerenders');
