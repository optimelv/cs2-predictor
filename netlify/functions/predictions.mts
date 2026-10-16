import type { Context, Config } from "@netlify/functions";
import { jsonResponse, predictionStore, readStaticSnapshot } from "./lib/prediction-store.mjs";
import { canApplySnapshot, snapshotFreshness, snapshotTimestamp } from "../../docs/lib/freshness.js";

function validSnapshot(value: unknown): value is Record<string, unknown> {
  const payload = value as Record<string, unknown> | null;
  return Boolean(payload && Array.isArray(payload.upcoming_predictions)
    && payload.model && typeof payload.model === "object" && !Array.isArray(payload.model)
    && payload.coverage && typeof payload.coverage === "object" && !Array.isArray(payload.coverage)
    && snapshotFreshness(snapshotTimestamp(payload)).state !== "unknown");
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET" } });
  const [stored, bundled] = await Promise.all([
    Promise.resolve().then(() => predictionStore().get("latest", { type: "json" })).catch(() => null),
    readStaticSnapshot(req).catch(() => null),
  ]);
  if (validSnapshot(stored) && (!validSnapshot(bundled) || canApplySnapshot(snapshotTimestamp(stored), snapshotTimestamp(bundled)))) {
    return jsonResponse(stored);
  }
  if (validSnapshot(bundled)) return jsonResponse(bundled);
  return jsonResponse({ error: "Prediction snapshot unavailable" }, { status: 503 });
};

export const config: Config = {
  path: "/api/predictions",
};
