import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { catalogManifest, queryCatalog, validateCatalogDatasets } from "../server/catalog.js";

const parse = async (name) => JSON.parse(await readFile(join(process.cwd(), "docs", "data", name), "utf8"));
export function createDatasetLoader(read = parse) {
  let datasetsPromise;
  return function loadDatasets() {
    datasetsPromise ||= Promise.all([
      read("live-snapshot.json"),
      read("history.json"),
      read("players.json"),
      read("predictions.json"),
    ]).then(([live, history, players, predictions]) => validateCatalogDatasets({ live, history, players, predictions }))
      .catch((error) => { datasetsPromise = undefined; throw error; });
    return datasetsPromise;
  };
}

const loadDatasets = createDatasetLoader();

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
    const params = new URL(request.url || "/api/catalog", "https://strikesignal.invalid").searchParams;
    const query = Object.fromEntries([...params.keys()].map((key) => [key, params.get(key)]));
    const resource = String(query.resource || "").toLowerCase();
    if (!resource) return response.status(200).json(catalogManifest(datasets));
    const result = queryCatalog(resource, datasets, query);
    if (result.error) return response.status(result.status).json({ ok: false, error: result.error });
    return response.status(200).json(result);
  } catch {
    response.setHeader("Cache-Control", "no-store");
    return response.status(503).json({ ok: false, error: "The public catalog is temporarily unavailable." });
  }
}
