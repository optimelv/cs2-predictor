import { ORACLE_WORKER_URL } from "../config/oracle-worker.js";

export default async function handler(_request, response) {
  if (!ORACLE_WORKER_URL) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(501).json({ ok: false, error: "The live worker is waiting for Oracle capacity." });
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
    if (!payload?.ok || payload.contract_version !== "1.0") {
      throw new Error("Worker returned an invalid snapshot contract.");
    }
    response.setHeader("Cache-Control", "no-store, max-age=0");
    return response.status(200).json(payload);
  } catch (error) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(503).json({
      ok: false,
      error: "The live worker is temporarily unavailable; the last published product data remains active.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
