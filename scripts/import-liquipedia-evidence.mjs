import { readFile, writeFile } from "node:fs/promises";

export async function importEvidence(inputPath, { archivePath = "models/liquipedia-observed-results.jsonl", statePath = "models/liquipedia-gap-state.json", assetsPath = "docs/data/team-assets.json", assetsJsPath = "docs/data/team-assets.js" } = {}) {
  const data = JSON.parse(await readFile(inputPath, "utf8"));
  if (data?.ok !== true || data.source !== "Liquipedia MediaWiki API" || !Array.isArray(data.matches) || !data.state || typeof data.assets !== "object") {
    throw new Error("Oracle Liquipedia evidence contract is invalid");
  }
  const currentState = JSON.parse(await readFile(statePath, "utf8"));
  if (Number(data.state.next_index) < Number(currentState.next_index)) throw new Error("Oracle Liquipedia cursor moved backwards");
  const rows = new Map();
  for (const line of (await readFile(archivePath, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line);
    rows.set(row.observation_id, row);
  }
  let added = 0;
  for (const row of data.matches) {
    if (!String(row.observation_id || "").startsWith("liquipedia:") || !/Z$/.test(String(row.starts_at || "")) || !String(row.source_url || "").startsWith("https://liquipedia.net/counterstrike/") || !Number.isInteger(row.score1) || !Number.isInteger(row.score2) || row.score1 === row.score2) continue;
    if (!rows.has(row.observation_id)) added += 1;
    rows.set(row.observation_id, row);
  }
  const ordered = [...rows.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.observation_id.localeCompare(b.observation_id));
  await writeFile(archivePath, ordered.map((row) => JSON.stringify(row)).join("\n") + "\n");

  await writeFile(statePath, JSON.stringify(data.state, null, 2) + "\n");

  const assets = JSON.parse(await readFile(assetsPath, "utf8"));
  let logos = 0;
  for (const [key, asset] of Object.entries(data.assets)) {
    if (assets[key] || !/^[a-z0-9 ]+$/.test(key) || !String(asset?.logo_url || "").startsWith("https://liquipedia.net/commons/images/")) continue;
    assets[key] = asset;
    logos += 1;
  }
  if (logos) {
    await writeFile(assetsPath, JSON.stringify(assets, null, 2) + "\n");
    await writeFile(assetsJsPath, "window.__STRIKESIGNAL_TEAM_ASSETS__ = " + JSON.stringify(assets, null, 2) + ";\n");
  }
  return { added, total: ordered.length, new_logos: logos, next_index: data.state.next_index };
}

if (process.argv[1]?.endsWith("/import-liquipedia-evidence.mjs")) {
  if (!process.argv[2]) throw new Error("Usage: node scripts/import-liquipedia-evidence.mjs <oracle-evidence.json>");
  console.log(JSON.stringify(await importEvidence(process.argv[2])));
}
