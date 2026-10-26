import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPublishedSnapshot } from "../api/live-snapshot.js";

const snapshot = await readPublishedSnapshot();
assert.equal(snapshot.ok, true);
assert.match(String(snapshot.contract_version), /^1\./);
assert.ok(snapshot.matches.length > 0);
assert.ok(snapshot.events.length > 0);
assert.ok(Array.isArray(snapshot.players));
assert.ok(snapshot.poll_after_ms >= 900_000);
assert.equal(snapshot.source_health.delivery_mode, "published_last_good");
assert.deepEqual(snapshot.product_filter.eligible_tiers, ["tier_1", "tier_2"]);
assert.ok(snapshot.matches.every((match) => ["tier_1", "tier_2"].includes(match.product_tier)));
assert.ok(snapshot.players.every((player) => player.player_id && player.nickname && player.team_name));
// Blocked detail pages can leave a valid schedule without verified lineups.
const fixtureDir = await mkdtemp(join(tmpdir(), "strikesignal-published-lineups-"));
try {
  const path = join(fixtureDir, "snapshot.json");
  const timestamp = new Date(Date.now() - 60_000).toISOString();
  const degraded = {
    ...snapshot,
    fetched_at_utc: timestamp,
    matches: snapshot.matches.map(({ lineups, ...match }) => match),
    players: [],
    source_health: { access_error: "SourceAccessBlocked: HTTP 403", detail_errors: ["hltv:fixture: HTTP 403"] },
  };
  await writeFile(path, JSON.stringify(degraded));
  const fallback = await readPublishedSnapshot(path);
  assert.deepEqual(fallback.players, []);
  assert.equal(fallback.matches.length, degraded.matches.length);
  assert.ok(fallback.matches.every((match) => match.lineups === undefined));
  assert.equal(fallback.fetched_at_utc, timestamp, "Fallback delivery must preserve the original source timestamp");
  assert.deepEqual(fallback.source_health.detail_errors, degraded.source_health.detail_errors);
  assert.equal(fallback.source_health.access_error, degraded.source_health.access_error);
  assert.equal(fallback.source_health.delivery_mode, "published_last_good");
  await writeFile(path, JSON.stringify({ ...degraded, players: {} }));
  await assert.rejects(readPublishedSnapshot(path), /contract or source timestamp is invalid/);
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}
console.log("live snapshot fallback contract tests ok");
