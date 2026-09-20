import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { catalogManifest, queryCatalog, validateCatalogDatasets } from "../server/catalog.js";

const parse = async (name) => JSON.parse(await readFile(join(process.cwd(), "docs", "data", name), "utf8"));
let datasetsPromise;

function loadDatasets() {
  datasetsPromise ||= Promise.all([
    parse("live-snapshot.json"),
    parse("history.json"),
    parse("players.json"),
    parse("predictions.json"),
  ]).then(([live, history, players, predictions]) => validateCatalogDatasets({ live, history, players, predictions }));
  return datasetsPromise;
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ ok: false, error: "Method not allowed." });

  try {
    const datasets = await loadDatasets();
    const resource = String(request.query?.resource || "").toLowerCase();
    if (!resource) return response.status(200).json(catalogManifest(datasets));
    const result = queryCatalog(resource, datasets, request.query || {});
    if (result.error) return response.status(result.status).json({ ok: false, error: result.error });
    return response.status(200).json(result);
  } catch {
    response.setHeader("Cache-Control", "no-store");
    return response.status(503).json({ ok: false, error: "The public catalog is temporarily unavailable." });
  }
}
