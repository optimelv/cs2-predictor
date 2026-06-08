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
    queue: "work/data/raw/hltv/player_stats_queue.json",
    out: "work/data/raw/hltv/player_stats_2026_06_08_3m.json",
    startDate: "2026-03-08",
    endDate: "2026-06-08",
    limit: null,
    delayMs: 5000,
    refreshErrors: false,
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
    } else if (key === "--start-date") {
      args.startDate = value;
      index += 1;
    } else if (key === "--end-date") {
      args.endDate = value;
      index += 1;
    } else if (key === "--limit") {
      args.limit = Number(value);
      index += 1;
    } else if (key === "--delay-ms") {
      args.delayMs = Number(value);
      index += 1;
    } else if (key === "--refresh-errors") {
      args.refreshErrors = true;
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

function playerId(row) {
  return Number(row.hltv_player_id || row.player_id || row.id || row);
}

async function main() {
  const args = parseArgs(process.argv);
  const queue = readJson(args.queue, []);
  const existing = readJson(args.out, []);
  const byId = new Map(existing.map((row) => [Number(row.hltv_player_id), row]));
  const ids = Array.from(new Set(queue.map(playerId).filter((id) => Number.isInteger(id) && id > 0)));
  const limitedIds = args.limit ? ids.slice(0, args.limit) : ids;

  for (let index = 0; index < limitedIds.length; index += 1) {
    const hltvPlayerId = limitedIds[index];
    const oldRow = byId.get(hltvPlayerId);
    if (oldRow && oldRow.status === "ok") {
      continue;
    }
    if (oldRow && oldRow.status === "error" && !args.refreshErrors) {
      continue;
    }
    await sleep(args.delayMs);
    const started = Date.now();
    try {
      const data = await HLTV.getPlayerStats({
        id: hltvPlayerId,
        startDate: args.startDate,
        endDate: args.endDate,
      });
      byId.set(hltvPlayerId, {
        hltv_player_id: hltvPlayerId,
        status: "ok",
        start_date: args.startDate,
        end_date: args.endDate,
        fetched_at_utc: new Date().toISOString(),
        duration_ms: Date.now() - started,
        data,
      });
    } catch (error) {
      byId.set(hltvPlayerId, {
        hltv_player_id: hltvPlayerId,
        status: "error",
        start_date: args.startDate,
        end_date: args.endDate,
        fetched_at_utc: new Date().toISOString(),
        duration_ms: Date.now() - started,
        error: String(error && error.stack ? error.stack : error),
      });
    }
    writeJson(args.out, Array.from(byId.values()).sort((left, right) => left.hltv_player_id - right.hltv_player_id));
    process.stdout.write(
      JSON.stringify({
        done: index + 1,
        total: limitedIds.length,
        hltv_player_id: hltvPlayerId,
        status: byId.get(hltvPlayerId).status,
      }) + "\n"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
