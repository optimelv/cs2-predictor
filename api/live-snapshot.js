import { ORACLE_WORKER_URL } from "../config/oracle-worker.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readPublishedSnapshot(path = join(process.cwd(), "docs", "data", "live-snapshot.json")) {
  const payload = JSON.parse(await readFile(path, "utf8"));
  if (!payload?.ok || !String(payload.contract_version || "").startsWith("1.") || !Array.isArray(payload.matches)) {
    throw new Error("The published live snapshot contract is invalid.");
  }
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
    const payload = await upstream.json();
    if (!payload?.ok || !String(payload.contract_version || "").startsWith("1.")) {
      throw new Error("Worker returned an invalid snapshot contract.");
    }
    response.setHeader("Cache-Control", "no-store, max-age=0");
    return response.status(200).json(payload);
  } catch (error) {
    return returnPublishedSnapshot(response, 503, "The live worker is temporarily unavailable; the last published product data remains active.");
  } finally {
    clearTimeout(timeout);
  }
}
