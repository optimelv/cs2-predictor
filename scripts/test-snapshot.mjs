import assert from "node:assert/strict";
import { eventIsProductEligible, normalizeEvent, productTierForEvent } from "../docs/lib/snapshot.js";

assert.equal(productTierForEvent({ name: "CCT Europe 8", tier: "B-Tier" }), "tier_2");
assert.equal(productTierForEvent({ name: "European Pro League", tier: "C-Tier" }), "excluded");
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
