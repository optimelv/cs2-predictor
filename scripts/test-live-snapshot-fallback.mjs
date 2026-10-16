import assert from "node:assert/strict";
import { readPublishedSnapshot } from "../api/live-snapshot.js";

const snapshot = await readPublishedSnapshot();
assert.equal(snapshot.ok, true);
assert.match(String(snapshot.contract_version), /^1\./);
assert.ok(snapshot.matches.length > 0);
assert.ok(snapshot.events.length > 0);
assert.ok(snapshot.players.length > 0);
assert.ok(snapshot.poll_after_ms >= 900_000);
assert.equal(snapshot.source_health.delivery_mode, "published_last_good");
assert.deepEqual(snapshot.product_filter.eligible_tiers, ["tier_1", "tier_2"]);
assert.ok(snapshot.matches.every((match) => ["tier_1", "tier_2"].includes(match.product_tier)));
assert.ok(snapshot.players.every((player) => player.player_id && player.nickname && player.team_name));
console.log("live snapshot fallback contract tests ok");
