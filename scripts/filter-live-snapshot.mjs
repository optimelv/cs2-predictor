import { readFile, writeFile } from "node:fs/promises";
import { filterProductLiveSnapshot } from "../docs/lib/live-feed.js";

const inputPath = process.argv[2];
const outputPath = process.argv[3] || inputPath;
if (!inputPath) throw new Error("Usage: node scripts/filter-live-snapshot.mjs <input.json> [output.json]");

const source = JSON.parse(await readFile(inputPath, "utf8"));
const filtered = filterProductLiveSnapshot(source);
if (!filtered.matches.length) throw new Error("Live snapshot contains no eligible Tier 1/2 matches.");
await writeFile(outputPath, `${JSON.stringify(filtered, null, 2)}\n`, "utf8");
console.log(JSON.stringify(filtered.product_filter));
