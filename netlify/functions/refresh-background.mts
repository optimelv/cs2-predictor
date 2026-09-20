import type { Context, Config } from "@netlify/functions";
import { env, jsonResponse } from "./lib/prediction-store.mjs";
import { refreshSnapshot } from "./lib/live-refresh.mjs";

function isAllowed(req: Request): boolean {
  const secret = env("REFRESH_SECRET");
  if (!secret) return false;
  return req.headers.get("x-refresh-secret") === secret;
}

export default async (req: Request, _context: Context) => {
  if (!isAllowed(req)) {
    console.warn("Rejected refresh without a valid REFRESH_SECRET.");
    return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const snapshot = await refreshSnapshot(req);
    console.log(
      JSON.stringify({
        generated_at_utc: snapshot.generated_at_utc,
        status: "ok",
        took_ms: Date.now() - startedAt,
      }),
    );
  } catch (error) {
    console.error("Prediction refresh failed", error);
    return jsonResponse({ ok: false, error: "Refresh failed" }, { status: 502 });
  }
  return jsonResponse({ ok: true }, { status: 200 });
};

export const config: Config = {
  path: "/api/refresh",
};
