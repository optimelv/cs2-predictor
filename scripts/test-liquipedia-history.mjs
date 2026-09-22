import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promote } from "./promote-liquipedia-history.mjs";

const folder = await mkdtemp(join(tmpdir(), "strikesignal-liquipedia-"));
const archive = join(folder, "archive.jsonl");
const history = join(folder, "history.json");
const row = { observation_id: "liquipedia:test", source_tier: "S-Tier", starts_at: "2026-09-19T15:25:00Z", source_url: "https://liquipedia.net/counterstrike/Test", event_name: "Test", team1_name: "Aurora", team2_name: "Vitality", score1: 2, score2: 1, winner_name: "Aurora" };
await writeFile(archive, JSON.stringify(row) + "\n");
await writeFile(history, JSON.stringify({ contract_version: "1.0", matches: [{ match_id: "hltv:existing", match_date: "2026-09-19", team1_name: "Vitality", team2_name: "Aurora", score1: 1, score2: 2, winner_name: "Aurora", tier: "tier_1" }] }));
assert.deepEqual(await promote(archive, history), { added: 0, total: 1 });
const saved = JSON.parse(await readFile(history, "utf8"));
assert.equal(saved.matches[0].match_id, "hltv:existing");
console.log("Liquipedia history reconciliation tests ok");
