import { ORACLE_WORKER_URL } from "../config/oracle-worker.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { filterProductLiveSnapshot } from "../docs/lib/live-feed.js";
import { snapshotFreshness } from "../docs/lib/freshness.js";

export function validateLiveSnapshot(payload, { filter = true } = {}) {
  if (!payload?.ok || !String(payload.contract_version || "").startsWith("1.") || !Array.isArray(payload.matches)
    || (payload.events != null && !Array.isArray(payload.events))
    || (payload.players != null && !Array.isArray(payload.players))
    || snapshotFreshness(payload.fetched_at_utc).state === "unknown") {
    throw new Error("The live snapshot contract or source timestamp is invalid.");
  }
  return filter ? filterProductLiveSnapshot(payload) : payload;
}

export async function readPublishedSnapshot(path = join(process.cwd(), "docs", "data", "live-snapshot.json")) {
  // Published artifacts also contain curated roster players beyond fixture lineups.
  // Keep that local registry; untrusted worker responses use the product filter.
  const payload = validateLiveSnapshot(JSON.parse(await readFile(path, "utf8")), { filter: false });
  return {
    ...payload,
    poll_after_ms: Math.max(900_000, Number(payload.poll_after_ms) || 0),
    source_health: {
      ...(payload.source_health || {}),
      delivery_mode: "published_last_good",
    },
  };
}

async function returnPublishedSnapshot(response, unavailableStatus, unavailableMessage) {
  try {
    const payload = await readPublishedSnapshot();
    response.setHeader("Cache-Control", "no-store, max-age=0");
    return response.status(200).json(payload);
  } catch {
    response.setHeader("Cache-Control", "no-store");
    return response.status(unavailableStatus).json({ ok: false, error: unavailableMessage });
  }
}

export default async function handler(_request, response) {
  if (!ORACLE_WORKER_URL) {
    return returnPublishedSnapshot(response, 501, "The live worker is waiting for Oracle capacity.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const upstream = await fetch(`${ORACLE_WORKER_URL}/snapshot`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      throw new Error(`Worker returned HTTP ${upstream.status}`);
    }
    const payload = validateLiveSnapshot(await upstream.json());
    response.setHeader("Cache-Control", "no-store, max-age=0");
    return response.status(200).json(payload);
  } catch (error) {
    return returnPublishedSnapshot(response, 503, "The live worker is temporarily unavailable; the last published product data remains active.");
  } finally {
    clearTimeout(timeout);
  }
}
