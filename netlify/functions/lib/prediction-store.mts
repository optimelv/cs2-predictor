import { getDeployStore, getStore } from "@netlify/blobs";

export const PREDICTION_KEY = "latest";
export const STORE_NAME = "prediction-snapshots";

type NetlifyGlobal = {
  context?: { deploy?: { context?: string } };
  env?: { get?: (name: string) => string | undefined };
};

function netlifyGlobal(): NetlifyGlobal | undefined {
  return (globalThis as typeof globalThis & { Netlify?: NetlifyGlobal }).Netlify;
}

export function env(name: string): string {
  return netlifyGlobal()?.env?.get?.(name) || "";
}

export function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "public, max-age=30, stale-while-revalidate=120");
  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

export function predictionStore() {
  if (netlifyGlobal()?.context?.deploy?.context === "production") {
    return getStore(STORE_NAME, { consistency: "strong" });
  }
  return getDeployStore(STORE_NAME);
}

export function siteBaseUrl(req?: Request): string {
  const configured = env("SITE_URL") || env("URL") || env("DEPLOY_PRIME_URL");
  if (configured) return configured.replace(/\/$/, "");
  if (req) {
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
  }
  return "";
}

export async function readStaticSnapshot(req?: Request): Promise<Record<string, unknown>> {
  const baseUrl = siteBaseUrl(req);
  if (!baseUrl) throw new Error("No site URL available for static snapshot fallback.");
  const response = await fetch(`${baseUrl}/data/predictions.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Static prediction snapshot failed with ${response.status}`);
  }
  return response.json();
}
