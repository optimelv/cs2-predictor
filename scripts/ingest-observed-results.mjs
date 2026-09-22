import { readFile, writeFile } from "node:fs/promises";

export function validResult(match) {
  const time = Date.parse(String(match?.starts_at || ""));
  const score1 = Number(match?.score1);
  const score2 = Number(match?.score2);
  return String(match?.match_id || "").startsWith("hltv:")
    && match?.status === "finished"
    && /(?:Z|[+-]\d\d:\d\d)$/.test(String(match.starts_at || ""))
    && Number.isFinite(time) && time <= Date.now() + 5 * 60_000
    && match.score1 != null && match.score2 != null
    && Number.isInteger(score1) && Number.isInteger(score2) && score1 !== score2
    && match.team1_name && match.team2_name && match.winner_name;
}

export async function ingest(inputPath, outputPath) {
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  if (!input?.ok || input.source !== "HLTV via Oracle Scrapling" || !Array.isArray(input.matches)) {
    throw new Error("Oracle archive contract is invalid");
  }
  const existing = new Map();
  try {
    for (const line of (await readFile(outputPath, "utf8")).split(/\r?\n/).filter(Boolean)) {
      const match = JSON.parse(line);
      if (validResult(match)) existing.set(match.match_id, match);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let added = 0;
  for (const match of input.matches) {
    if (!validResult(match)) continue;
    if (!existing.has(match.match_id)) added += 1;
    existing.set(match.match_id, match);
  }
  const rows = [...existing.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.match_id.localeCompare(b.match_id));
  await writeFile(outputPath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return { total: rows.length, added, backfill_complete: input.backfill_complete, backfill_offset: input.backfill_offset };
}

if (process.argv[1]?.endsWith("/ingest-observed-results.mjs")) {
  const [inputPath, outputPath = "models/observed-hltv-results.jsonl"] = process.argv.slice(2);
  if (!inputPath) throw new Error("Usage: node scripts/ingest-observed-results.mjs <oracle-archive.json> [output.jsonl]");
  console.log(JSON.stringify(await ingest(inputPath, outputPath)));
}
