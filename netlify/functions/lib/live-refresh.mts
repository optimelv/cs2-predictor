import { env, predictionStore, readStaticSnapshot } from "./prediction-store.mjs";

type Match = {
  match_id?: number;
  match_url?: string;
  team1_name?: string;
  team2_name?: string;
  map_read?: {
    status?: string;
    maps?: Array<Record<string, unknown>>;
    note?: string;
    map_adjusted_prob_team1?: number;
    map_adjusted_confidence?: number;
    map_adjusted_predicted_winner?: string;
  };
};

const DECIDER_URLS: Record<number, string> = {
  2394895: "https://www.hltv.org/matches/2394895/monte-vs-pain-iem-cologne-major-2026-stage-2",
  2394896: "https://www.hltv.org/matches/2394896/legacy-vs-tyloo-iem-cologne-major-2026-stage-2",
  2394897: "https://www.hltv.org/matches/2394897/b8-vs-big-iem-cologne-major-2026-stage-2",
};

const MAPS = ["Ancient", "Anubis", "Dust2", "Inferno", "Mirage", "Nuke", "Overpass", "Train"];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractMapName(text: string): string | null {
  return MAPS.find((map) => new RegExp(`\\b${map}\\b`, "i").test(text)) || null;
}

function parseVetoes(html: string): Array<{ action: string; map_name: string; raw_text: string; team_name?: string }> {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");
  const rows = [];
  const linePattern = /(?:^|\n|\s)(\d+\.\s*[^.\n]*(?:removed|picked|left over|decider)[^.\n]*)/gi;
  for (const match of text.matchAll(linePattern)) {
    const raw = match[1].replace(/\s+/g, " ").trim();
    const mapName = extractMapName(raw);
    if (!mapName) continue;
    let action = "removed";
    if (/picked/i.test(raw)) action = "picked";
    if (/left over|decider/i.test(raw)) action = "decider";
    const team = raw.replace(/^\d+\.\s*/, "").split(/\s+(removed|picked|left over|decider)\s+/i)[0]?.trim();
    rows.push({ action, map_name: mapName, raw_text: raw, team_name: team || undefined });
  }
  return rows;
}

function parseMapSet(html: string): string[] {
  const vetoes = parseVetoes(html);
  const picked = vetoes.filter((row) => row.action === "picked" || row.action === "decider").map((row) => row.map_name);
  return [...new Set(picked)].slice(0, 5);
}

async function fetchHltvHtmlViaFlareSolverr(url: string): Promise<string | null> {
  const flaresolverrUrl = env("FLARESOLVERR_URL");
  if (!flaresolverrUrl) return null;
  const endpoint = flaresolverrUrl.endsWith("/v1") ? flaresolverrUrl : `${flaresolverrUrl.replace(/\/$/, "")}/v1`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cmd: "request.get",
      maxTimeout: Number(env("FLARESOLVERR_TIMEOUT_MS") || 90000),
      url,
    }),
  });
  if (!response.ok) throw new Error(`FlareSolverr failed with ${response.status}`);
  const payload = await response.json();
  return payload?.solution?.response || null;
}

function mapRow(mapName: string, match: Match, source: string): Record<string, unknown> {
  const existing = (match.map_read?.maps || []).find((row) => String(row.map_name || "").toLowerCase() === mapName.toLowerCase());
  return existing ? { ...existing, map_name: mapName, source } : { map_name: mapName, source };
}

function applyMapRead(match: Match, maps: string[], status: string, note: string): void {
  if (!maps.length) return;
  const rows = maps.map((mapName) => mapRow(mapName, match, status));
  const { map_adjusted_prob_team1: _probability, map_adjusted_confidence: _confidence, map_adjusted_predicted_winner: _winner, ...existingRead } = match.map_read || {};
  match.map_read = {
    ...existingRead,
    status,
    maps: rows,
    note,
  };
}

function applyManualPermabans(snapshot: Record<string, unknown>): void {
  const projection = snapshot.major_projection as { stage2_deciders?: Match[] } | undefined;
  for (const match of projection?.stage2_deciders || []) {
    if (![match.team1_name, match.team2_name].some((name) => normalize(String(name || "")) === "pain")) continue;
    const maps = match.map_read?.maps || [];
    const filtered = maps.filter((row) => row.map_name !== "Ancient");
    if (match.map_read?.status === "known_veto") continue;
    if (filtered.length !== maps.length) {
      match.map_read = {
        ...(match.map_read || {}),
        maps: filtered,
        note: "Projected maps exclude likely permabans. paiN Ancient is treated as unavailable unless HLTV veto data says otherwise.",
      };
    }
  }
}

export async function refreshSnapshot(req?: Request): Promise<Record<string, unknown>> {
  const snapshot = await readStaticSnapshot(req);
  const projection = snapshot.major_projection as { stage2_deciders?: Match[] } | undefined;

  for (const match of projection?.stage2_deciders || []) {
    const matchId = Number(match.match_id);
    const url = match.match_url || DECIDER_URLS[matchId];
    if (!url) continue;
    const html = await fetchHltvHtmlViaFlareSolverr(url);
    if (!html) continue;
    const maps = parseMapSet(html);
    const vetoes = parseVetoes(html);
    if (maps.length) {
      applyMapRead(
        match,
        maps,
        vetoes.length ? "known_veto" : "known_maps",
        "Official live HLTV veto map names were refreshed; map performance probabilities remain from the validated model state.",
      );
    }
  }

  applyManualPermabans(snapshot);
  snapshot.generated_at_utc = new Date().toISOString();
  snapshot.updater = {
    status: env("FLARESOLVERR_URL") ? "netlify_remote_flaresolverr" : "netlify_static_fallback",
    detail: env("FLARESOLVERR_URL")
      ? "Served from Netlify Blobs with live HLTV overlay."
      : "Served from Netlify Blobs without remote FlareSolverr configured.",
  };

  await predictionStore().setJSON("latest", snapshot);
  return snapshot;
}
