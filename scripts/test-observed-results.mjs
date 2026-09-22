import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "./ingest-observed-results.mjs";

const folder = await mkdtemp(join(tmpdir(), "strikesignal-results-"));
const input = join(folder, "source.json");
const output = join(folder, "results.jsonl");
const valid = { match_id: "hltv:1", starts_at: "2026-09-22T12:00:00Z", status: "finished", team1_name: "A", team2_name: "B", score1: 2, score2: 1, winner_name: "A" };
await writeFile(input, JSON.stringify({ ok: true, source: "HLTV via Oracle Scrapling", matches: [valid, { ...valid, match_id: "hltv:2", starts_at: null }] }));
assert.deepEqual(await ingest(input, output), { total: 1, added: 1, backfill_complete: undefined, backfill_offset: undefined });
assert.deepEqual(await ingest(input, output), { total: 1, added: 0, backfill_complete: undefined, backfill_offset: undefined });
assert.equal((await readFile(output, "utf8")).trim().split("\n").length, 1);
console.log("observed results ingestion tests ok");
