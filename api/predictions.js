import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canApplySnapshot, snapshotFreshness, snapshotTimestamp } from "../docs/lib/freshness.js";

export function validPredictionSnapshot(payload) {
  return Boolean(payload && typeof payload === "object"
    && Array.isArray(payload.upcoming_predictions)
    && payload.coverage && typeof payload.coverage === "object" && !Array.isArray(payload.coverage)
    && payload.model && typeof payload.model === "object" && !Array.isArray(payload.model)
    && snapshotFreshness(snapshotTimestamp(payload)).state !== "unknown");
}

export default async function handler(request, response) {
  if (request.method && request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }
  response.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  const file = await readFile(join(process.cwd(), "docs", "data", "predictions.json"), "utf8");
  const bundled = JSON.parse(file);

  if (process.env.PREDICTIONS_SNAPSHOT_URL) {
    try {
      const live = await fetch(process.env.PREDICTIONS_SNAPSHOT_URL, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (live.ok) {
        const payload = await live.json();
        if (validPredictionSnapshot(payload) && canApplySnapshot(snapshotTimestamp(payload), snapshotTimestamp(bundled))) {
          return response.status(200).json(payload);
        }
      }
    } catch (error) {
      console.warn("Live prediction snapshot unavailable; using bundled fallback.");
    }
  }

  return response.status(200).json(bundled);
}
