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
    queue: "work/data/raw/hltv/map_stats_queue.json",
    out: "work/data/raw/hltv/match_map_stats_2026_06_08.json",
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

function queueId(row) {
  return Number(row.stats_id || row.id || row);
}

async function main() {
  const args = parseArgs(process.argv);
  const queue = readJson(args.queue, []);
  const existing = readJson(args.out, []);
  const byId = new Map(existing.map((row) => [Number(row.stats_id), row]));
  const ids = Array.from(new Set(queue.map(queueId).filter((id) => Number.isInteger(id) && id > 0)));
  const limitedIds = args.limit ? ids.slice(0, args.limit) : ids;

  for (let index = 0; index < limitedIds.length; index += 1) {
    const statsId = limitedIds[index];
    const oldRow = byId.get(statsId);
    if (oldRow && oldRow.status === "ok") {
      continue;
    }
    if (oldRow && oldRow.status === "error" && !args.refreshErrors) {
      continue;
    }
    await sleep(args.delayMs);
    const started = Date.now();
    try {
      const data = await HLTV.getMatchMapStats({ id: statsId });
      byId.set(statsId, {
        stats_id: statsId,
        status: "ok",
        fetched_at_utc: new Date().toISOString(),
        duration_ms: Date.now() - started,
        data,
      });
    } catch (error) {
      byId.set(statsId, {
        stats_id: statsId,
        status: "error",
        fetched_at_utc: new Date().toISOString(),
        duration_ms: Date.now() - started,
        error: String(error && error.stack ? error.stack : error),
      });
    }
    writeJson(args.out, Array.from(byId.values()).sort((left, right) => left.stats_id - right.stats_id));
    process.stdout.write(
      JSON.stringify({
        done: index + 1,
        total: limitedIds.length,
        stats_id: statsId,
        status: byId.get(statsId).status,
      }) + "\n"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
