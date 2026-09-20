import assert from "node:assert/strict";
import {
  ingestMatchSignals,
  markSignalsRead,
  matchSignalRecord,
  normalizeSignalState,
  signalMatchKey,
  unreadSignalCount,
} from "../docs/lib/signals.js";

const base = {
  match_id: "hltv:1",
  event_name: "PGL Major",
  team1_name: "Spirit",
  team2_name: "Vitality",
  prob_team1: 0.56,
  status: "scheduled",
  lineups: { team1: [{ player_id: "hltv:11" }], team2: [{ player_id: "hltv:22" }] },
};
const baseline = ingestMatchSignals({}, [base], { observedAt: "2026-08-01T10:00:00Z", isRelevant: () => true });
assert.equal(baseline.created.length, 0);
assert.equal(signalMatchKey(base), "hltv:1");

const changed = ingestMatchSignals(baseline.state, [{
  ...base,
  prob_team1: 0.62,
  status: "live",
  maps: ["Mirage", "Inferno", "Dust2"],
}], { observedAt: "2026-08-01T11:00:00Z", isRelevant: () => true });
assert.deepEqual(changed.created.map((item) => item.type).sort(), ["match_live", "probability_shift", "veto_published"]);
assert.equal(unreadSignalCount(changed.state), 3);
assert.equal(matchSignalRecord(changed.state, base).closing_prob_team1, 0.56);
assert.equal(matchSignalRecord(changed.state, base).timeline.length, 2);

const repeated = ingestMatchSignals(changed.state, [{ ...base, prob_team1: 0.62, status: "live", maps: ["Mirage", "Inferno", "Dust2"] }], { observedAt: "2026-08-01T11:05:00Z", isRelevant: () => true });
assert.equal(repeated.created.length, 0);
assert.equal(matchSignalRecord(repeated.state, base).timeline.length, 2);
const stale = ingestMatchSignals(repeated.state, [{ ...base, prob_team1: 0.2 }], { observedAt: "2026-08-01T10:30:00Z", isRelevant: () => true });
assert.equal(stale.created.length, 0);
assert.equal(matchSignalRecord(stale.state, base).latest.prob_team1, 0.62);

const lineup = ingestMatchSignals(repeated.state, [{
  ...base,
  prob_team1: 0.62,
  status: "live",
  maps: ["Mirage", "Inferno", "Dust2"],
  lineups: { team1: [{ player_id: "hltv:33" }], team2: [{ player_id: "hltv:22" }] },
}], { observedAt: "2026-08-01T11:10:00Z", isRelevant: () => true });
assert.equal(lineup.created.some((item) => item.type === "lineup_change"), true);
assert.equal(unreadSignalCount(markSignalsRead(lineup.state)), 0);
assert.deepEqual(normalizeSignalState(null).notifications, []);

const largeBaseline = ingestMatchSignals({}, Array.from({ length: 320 }, (_, index) => ({
  match_id: `hltv:${index}`,
  team1_name: `Team ${index}`,
  team2_name: `Opponent ${index}`,
  prob_team1: 0.5,
})), { observedAt: "2026-08-02T12:00:00Z" });
assert.equal(Object.keys(largeBaseline.state.matches).length, 300);
console.log("signal center contract tests ok");
