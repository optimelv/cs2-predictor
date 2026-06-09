import type { Config, Context } from "@netlify/functions";
import { env, jsonResponse, siteBaseUrl } from "./lib/prediction-store.mjs";

export default async (req: Request, _context: Context) => {
  const baseUrl = siteBaseUrl(req);
  const refreshUrl = new URL("/api/refresh", baseUrl);
  const secret = env("REFRESH_SECRET");
  if (secret) refreshUrl.searchParams.set("secret", secret);

  const response = await fetch(refreshUrl, { method: "POST" });
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
