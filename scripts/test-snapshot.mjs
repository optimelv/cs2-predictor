import assert from "node:assert/strict";
import { eventIsProductEligible, normalizeEvent, normalizeMatch, productTierForEvent } from "../docs/lib/snapshot.js";

assert.equal(productTierForEvent({ name: "CCT Europe 8", tier: "B-Tier" }), "tier_2");
assert.equal(productTierForEvent({ name: "European Pro League", tier: "C-Tier" }), "excluded");
assert.equal(productTierForEvent({ name: "European Pro League Season 31" }), "pending");
assert.equal(eventIsProductEligible({ name: "IEM Beijing 2026" }), true);

const event = normalizeEvent({
  id: "future-knockout",
  name: "Future Knockout",
  tier: "A-Tier",
  bracket: {
    type: "single_elimination",
    rounds: [{
      id: "semifinals",
      name: "Semifinals",
      order: 1,
      matches: [{
        match_id: "future:1",
        team1_name: "Alpha",
        team2_name: "Beta",
        status: "upcoming",
      }],
    }],
  },
});

assert.equal(event.product_tier, "tier_1");
assert.equal(event.bracket.rounds[0].matches[0].slot_id, "semifinals-1");
assert.equal(event.bracket.rounds[0].matches[0].round_name, "Semifinals");

console.log("snapshot contract tests ok");

const oldMatch = { team1_name: "Alpha", team2_name: "Beta", starts_at: "2020-01-01T12:00:00Z" };
assert.equal(normalizeMatch({ ...oldMatch, status: "scheduled" }).status, "upcoming", "A past fixture must not manufacture a result");
assert.equal(normalizeMatch({ ...oldMatch, status: "playing" }).status, "live", "Recorded source status is independent of today's date");
assert.equal(normalizeMatch({ ...oldMatch, status: "completed", score1: 2, score2: 1 }).status, "finished");
assert.equal(normalizeMatch(oldMatch).score1, null, "Missing score remains unknown");
