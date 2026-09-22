import { readFile, writeFile } from "node:fs/promises";
import { mergeHistoryMatches } from "../docs/lib/history.js";

const normalize = (name) => String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^natusvincere$/, "navi");
const fingerprint = (match) => {
  const sides = [[normalize(match.team1_name), Number(match.score1)], [normalize(match.team2_name), Number(match.score2)]]
    .sort((a, b) => a[0].localeCompare(b[0]));
  return `${String(match.match_date || match.starts_at || "").slice(0, 10)}|${sides.map((side) => side.join(":" )).join("|")}`;
};

export function historyFromObservation(row) {
  const tier = /^[SA]-Tier$/i.test(row.source_tier) ? "tier_1" : /^B-Tier$/i.test(row.source_tier) ? "tier_2" : null;
  if (!tier || !row.observation_id || !/Z$/.test(String(row.starts_at || "")) || !row.source_url || !row.winner_name) return null;
  return {
    match_id: row.observation_id,
    match_date: row.starts_at.slice(0, 10),
    starts_at: row.starts_at,
    event_name: row.event_name,
    team1_name: row.team1_name,
    team2_name: row.team2_name,
    score1: row.score1,
    score2: row.score2,
    winner_name: row.winner_name,
    tier,
    best_of: Math.max(row.score1, row.score2) === 3 ? 5 : null,
    phase: "Series",
    stage_name: "Series",
    maps: [],
    lineups: { team1: [], team2: [] },
    source: "Liquipedia MediaWiki API",
    source_url: row.source_url,
  };
}

export async function promote(archivePath, historyPath) {
  const archive = (await readFile(archivePath, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const history = JSON.parse(await readFile(historyPath, "utf8"));
  const known = new Set((history.matches || []).map(fingerprint));
  const incoming = [];
  for (const row of archive) {
    const match = historyFromObservation(row);
    if (!match || known.has(fingerprint(match))) continue;
    known.add(fingerprint(match));
    incoming.push(match);
  }
  const merged = mergeHistoryMatches(history, incoming);
  await writeFile(historyPath, `${JSON.stringify(merged, null, 2)}\n`);
  return { added: incoming.length, total: merged.matches.length };
}

if (process.argv[1]?.endsWith("/promote-liquipedia-history.mjs")) {
  const [archivePath = "models/liquipedia-observed-results.jsonl", historyPath = "docs/data/history.json"] = process.argv.slice(2);
  console.log(JSON.stringify(await promote(archivePath, historyPath)));
}
