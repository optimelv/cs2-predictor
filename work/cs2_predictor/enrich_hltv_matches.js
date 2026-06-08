#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function loadHltvPackage() {
  try {
    return require("hltv").HLTV;
  } catch (firstError) {
    const localPath = path.resolve(__dirname, "../api_tests/gigobyte_hltv/node_modules/hltv");
    try {
      return require(localPath).HLTV;
    } catch {
      throw firstError;
    }
  }
}

const HLTV = loadHltvPackage();

function parseArgs(argv) {
  const args = {
    queue: "work/data/raw/hltv/match_detail_queue.json",
    out: "work/data/raw/hltv/match_details_2026_06_08.json",
    limit: null,
    delayMs: 700,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--queue") {
      args.queue = value;
      index += 1;
    } else if (key === "--out") {
      args.out = value;
      index += 1;
    } else if (key === "--limit") {
      args.limit = Number(value);
      index += 1;
    } else if (key === "--delay-ms") {
      args.delayMs = Number(value);
      index += 1;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(pathname, "utf8"));
}

function writeJson(pathname, payload) {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  fs.writeFileSync(pathname, JSON.stringify(payload, null, 2));
}

function compactMatch(match) {
  return {
    id: match.id,
    statsId: match.statsId,
    title: match.title,
    date: match.date,
    significance: match.significance,
    status: match.status,
    hasScorebot: match.hasScorebot,
    event: match.event,
    team1: match.team1,
    team2: match.team2,
    winnerTeam: match.winnerTeam,
    format: match.format,
    maps: match.maps,
    vetoes: match.vetoes,
    players: match.players,
    demos: match.demos,
    odds: match.odds,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const queue = readJson(args.queue, []);
  const existing = readJson(args.out, []);
  const byId = new Map(existing.map((row) => [Number(row.match_id), row]));
  const ids = queue
    .map((row) => Number(row.match_id || row.id || row))
    .filter((id) => Number.isInteger(id) && id > 0);
  const uniqueIds = Array.from(new Set(ids));
  const limitedIds = args.limit ? uniqueIds.slice(0, args.limit) : uniqueIds;

  for (let index = 0; index < limitedIds.length; index += 1) {
    const matchId = limitedIds[index];
    const oldRow = byId.get(matchId);
    if (oldRow && oldRow.status === "ok") {
      continue;
    }
    await sleep(args.delayMs);
    const startedAt = new Date().toISOString();
    try {
      const match = await HLTV.getMatch({ id: matchId });
      byId.set(matchId, {
        match_id: matchId,
        status: "ok",
        fetched_at_utc: new Date().toISOString(),
        duration_ms: Date.now() - Date.parse(startedAt),
        data: compactMatch(match),
      });
    } catch (error) {
      byId.set(matchId, {
        match_id: matchId,
        status: "error",
        fetched_at_utc: new Date().toISOString(),
        error: String(error && error.stack ? error.stack : error),
      });
    }
    writeJson(args.out, Array.from(byId.values()).sort((left, right) => left.match_id - right.match_id));
    process.stdout.write(
      JSON.stringify({
        done: index + 1,
        total: limitedIds.length,
        match_id: matchId,
        status: byId.get(matchId).status,
      }) + "\n"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
