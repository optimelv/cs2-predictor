import type { Context, Config } from "@netlify/functions";
import { env, jsonResponse } from "./lib/prediction-store.mjs";
import { refreshSnapshot } from "./lib/live-refresh.mjs";

function isAllowed(req: Request): boolean {
  const secret = env("REFRESH_SECRET");
  if (!secret) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret || req.headers.get("x-refresh-secret") === secret;
}

export default async (req: Request, _context: Context) => {
  if (!isAllowed(req)) {
    console.warn("Rejected refresh without a valid REFRESH_SECRET.");
    return;
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
  }
};

export const config: Config = {
  path: "/api/refresh",
};
