#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function loadHltvPackage() {
  try {
    return require("hltv");
  } catch (firstError) {
    const localPath = path.resolve(__dirname, "../api_tests/gigobyte_hltv/node_modules/hltv");
    try {
      return require(localPath);
    } catch {
      throw firstError;
    }
  }
}

const hltvPackage = loadHltvPackage();
const HLTV = hltvPackage.HLTV;
const ContentFilter = hltvPackage.ContentFilter;

function parseArgs(argv) {
  const args = {
    startDate: "2025-06-08",
    endDate: "2026-06-08",
    out: "work/data/raw/hltv/results_2025_06_08_to_2026_06_08.json",
    chunkDays: 7,
    delayMs: 5000,
    pageDelayMs: 2500,
    requireStats: true,
    refreshErrors: false,
    stars: null,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--start-date") {
      args.startDate = value;
      index += 1;
    } else if (key === "--end-date") {
      args.endDate = value;
      index += 1;
    } else if (key === "--out") {
      args.out = value;
      index += 1;
    } else if (key === "--chunk-days") {
      args.chunkDays = Number(value);
      index += 1;
    } else if (key === "--delay-ms") {
      args.delayMs = Number(value);
      index += 1;
    } else if (key === "--page-delay-ms") {
      args.pageDelayMs = Number(value);
      index += 1;
    } else if (key === "--stars") {
      args.stars = Number(value);
      index += 1;
    } else if (key === "--include-no-stats") {
      args.requireStats = false;
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

function parseDate(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildRanges(startDateText, endDateText, chunkDays) {
  const ranges = [];
  let cursor = parseDate(startDateText);
  const finalDate = parseDate(endDateText);
  while (cursor <= finalDate) {
    const rangeEnd = addDays(cursor, chunkDays - 1);
    const cappedEnd = rangeEnd > finalDate ? finalDate : rangeEnd;
    ranges.push([formatDate(cursor), formatDate(cappedEnd)]);
    cursor = addDays(cappedEnd, 1);
  }
  return ranges;
}

function compactResult(row) {
  return {
    id: row.id,
    date: row.date,
    team1: row.team1,
    team2: row.team2,
    stars: row.stars,
    format: row.format,
    map: row.map,
    result: row.result,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const existing = readJson(args.out, []);
  const byRange = new Map(existing.map((row) => [`${row.range_start}:${row.range_end}`, row]));
  const ranges = buildRanges(args.startDate, args.endDate, args.chunkDays);

  for (let index = 0; index < ranges.length; index += 1) {
    const [rangeStart, rangeEnd] = ranges[index];
    const rangeKey = `${rangeStart}:${rangeEnd}`;
    const oldRow = byRange.get(rangeKey);
    if (oldRow && oldRow.status === "ok") {
      continue;
    }
    if (oldRow && oldRow.status === "error" && !args.refreshErrors) {
      continue;
    }
    await sleep(args.delayMs);
    const options = {
      startDate: rangeStart,
      endDate: rangeEnd,
      delayBetweenPageRequests: args.pageDelayMs,
    };
    if (args.requireStats && ContentFilter) {
      options.contentFilters = [ContentFilter.HasStats];
    }
    if (args.stars) {
      options.stars = args.stars;
    }
    try {
      const results = await HLTV.getResults(options);
      byRange.set(rangeKey, {
        range_start: rangeStart,
        range_end: rangeEnd,
        status: "ok",
        fetched_at_utc: new Date().toISOString(),
        count: results.length,
        data: results.map(compactResult),
      });
    } catch (error) {
      byRange.set(rangeKey, {
        range_start: rangeStart,
        range_end: rangeEnd,
        status: "error",
        fetched_at_utc: new Date().toISOString(),
        error: String(error && error.stack ? error.stack : error),
      });
    }
    writeJson(args.out, Array.from(byRange.values()).sort((left, right) => left.range_start.localeCompare(right.range_start)));
    process.stdout.write(
      JSON.stringify({
        done: index + 1,
        total: ranges.length,
        range_start: rangeStart,
        range_end: rangeEnd,
        status: byRange.get(rangeKey).status,
        count: byRange.get(rangeKey).count || 0,
      }) + "\n"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
