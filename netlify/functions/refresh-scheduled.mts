import type { Config, Context } from "@netlify/functions";
import { env, jsonResponse, siteBaseUrl } from "./lib/prediction-store.mjs";

export default async (req: Request, _context: Context) => {
  const baseUrl = siteBaseUrl(req);
  const refreshUrl = new URL("/api/refresh", baseUrl);
  const secret = env("REFRESH_SECRET");
  if (!secret) {
    console.error("Scheduled refresh is not configured: REFRESH_SECRET is missing.");
    return jsonResponse({ queued: false, status: 503, error: "Refresh is not configured" }, { status: 503 });
  }

  const response = await fetch(refreshUrl, { method: "POST", headers: { "x-refresh-secret": secret } });
  console.log(
    JSON.stringify({
      next_run: await req.json().catch(() => null),
      refresh_status: response.status,
      refresh_url: refreshUrl.origin + refreshUrl.pathname,
    }),
  );

  return jsonResponse({ queued: response.ok, status: response.status });
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
