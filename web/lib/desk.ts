import eventAliases from "../../docs/lib/event-aliases.json";
import {
  canApplySnapshot,
  snapshotFreshness,
} from "../../docs/lib/freshness.js";
import { filterProductLiveSnapshot } from "../../docs/lib/live-feed.js";
import {
  eventIsProductEligible,
  normalizeMatch,
  productTierForEvent,
} from "../../docs/lib/snapshot.js";
import { mergePlayerProfile } from "../../docs/lib/player-history.js";

export interface Match {
  match_id: string;
  event_id?: string;
  event_name: string;
  team1_name: string;
  team2_name: string;
  starts_at?: string;
  match_date?: string;
  status?: string;
  score1?: number | null;
  score2?: number | null;
  prob_team1?: number | null;
  winner_name?: string;
  series_format?: string;
  round_name?: string;
  stage_name?: string;
  slot_id?: string;
  feeds_from?: string[];
  alternate_match_ids?: string[];
  product_tier?: string;
  data_quality?: string;
  model_coverage?: string;
  predicted_winner?: string;
  maps?: string[];
  map_results?: {
    map_name: string;
    score1?: number;
    score2?: number;
    status?: string;
  }[];
  lineups?: {
    team1?: ({ player_id?: string; nickname: string } | string)[];
    team2?: ({ player_id?: string; nickname: string } | string)[];
  };
}
export interface Event {
  id: string;
  name: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  tier?: string;
  product_tier?: string;
  fixture_provider?: string;
  location?: string;
  participants?: string[];
  map_pool?: string[];
  matches?: Match[];
  format?: { type?: string; label?: string };
  bracket?: { rounds?: { matches?: Match[] }[] };
}
export interface Player {
  player_id: string;
  nickname: string;
  team_name?: string;
  portrait_url?: string;
  rating_3_0?: number | null;
  maps_3m?: number | null;
  stats_through_date?: string;
  stats_from_date?: string;
  profile_fetched_at_utc?: string;
  traits_through_date?: string;
  traits?: Record<string, number | null>;
  form_timeline?: {
    date: string;
    rating?: number;
    average_rating?: number;
    opponent_name?: string;
  }[];
  form_summary?: {
    series?: number;
    recent_rating?: number;
    average_adr?: number;
  };
  map_profile?: {
    map_name: string;
    average_rating?: number;
    maps?: number;
    average_adr?: number;
    win_rate?: number;
  }[];
  signal_index?: number;
}
export interface TeamRating {
  team_name: string;
  elo?: number;
  vrs_rank?: number;
  vrs_points?: number;
  matches?: number;
  last_result_utc?: string;
  ranking_date?: string;
}
export interface Snapshot {
  generated_at_utc?: string;
  coverage: {
    events: Event[];
    daily_matches: Match[];
    last_verified_utc?: string;
    fixture_provider?: string;
    vrs?: {
      as_of?: string;
      teams?: { team_name: string; rank?: number; points?: number }[];
    };
  };
  upcoming_predictions?: Match[];
  model_state?: {
    teams?: TeamRating[];
    map_pool?: string[];
    map_profiles?: Record<string, unknown>;
    veto_profiles?: Record<string, unknown>;
  };
  model_registry?: {
    generated_at_utc?: string;
    champion?: { version?: string; trained_through?: string };
    monitoring?: {
      champion_metrics?: { accuracy?: number; brier?: number };
      champion_test_rows?: number;
      champion_slices?: {
        dimension: string;
        key: string;
        rows: number;
        metrics: { accuracy: number };
      }[];
    };
    baseline?: {
      metrics?: { accuracy?: number; brier?: number; log_loss?: number };
      slices?: {
        dimension: string;
        key: string;
        rows: number;
        metrics: { accuracy: number };
      }[];
    };
  };
}
export interface DeskData {
  snapshot: Snapshot;
  players: Player[];
  assets: Record<string, { logo_url?: string }>;
  warnings: string[];
  feedUnavailable?: boolean;
  pollAfterMs?: number;
}
export const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const number = (v: unknown) =>
  v == null ||
  typeof v === "boolean" ||
  String(v).trim() === "" ||
  !Number.isFinite(Number(v))
    ? null
    : Number(v);
export const teamKey = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const isFinal = (m: Match) =>
  /^(finished|completed|ended|final|locked)$/i.test(m.status || "");
export const probability = (m: Match) => {
  if (
    /cancelled|canceled|postponed/i.test(m.status || "") ||
    m.model_coverage === "limited"
  )
    return null;
  const n = number(m.prob_team1);
  return n !== null && n > 0 && n < 1 ? n : null;
};
export const percent = (v: unknown, digits = 1) =>
  number(v) === null
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "percent",
        maximumFractionDigits: digits,
      }).format(Number(v));
export const dateLabel = (s?: string) =>
  s && Number.isFinite(Date.parse(s))
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(s))
    : "Date to be announced";
export const timeLabel = (s?: string) =>
  s && Number.isFinite(Date.parse(s))
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(s))
    : "Time pending";
export function sourceAge(stamp?: string, now = Date.now()) {
  const v = Date.parse(stamp || "");
  return Number.isFinite(v) && v <= now ? Math.max(0, now - v) : null;
}
export function matchState(m: Match, now = Date.now()) {
  if (isFinal(m)) return "Final";
  if (/cancelled|canceled/i.test(m.status || "")) return "Cancelled";
  if (/postponed|delayed/i.test(m.status || "")) return "Postponed";
  if (m.status === "live") return "Live in source";
  return Date.parse(m.starts_at || "") < now ? "Awaiting result" : "Upcoming";
}
export function matchPriority(m: Match, now = Date.now()) {
  if (m.status === "live") return 0;
  if (/cancelled|canceled|postponed/i.test(m.status || "")) return 4;
  if (isFinal(m)) return 3;
  return Date.parse(m.starts_at || "") >= now - 86400000 ? 1 : 5;
}
export function winner(m: Match) {
  if (!isFinal(m)) return null;
  if ([m.team1_name, m.team2_name].includes(m.winner_name || ""))
    return m.winner_name!;
  const a = number(m.score1),
    b = number(m.score2);
  return a !== null && b !== null && a !== b
    ? a > b
      ? m.team1_name
      : m.team2_name
    : null;
}
async function json(path: string, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    cache: "no-cache",
  });
  if (!r.ok) throw new Error(`Data unavailable (${r.status})`);
  return r.json();
}
function matches(values: unknown): Match[] {
  return (Array.isArray(values) ? values : [])
    .filter(record)
    .map((m) => normalizeMatch(m))
    .filter(
      (m): m is Match =>
        !!m &&
        eventIsProductEligible({
          name: m.event_name,
          product_tier: m.product_tier,
        }),
    );
}
function events(values: unknown): Event[] {
  return (Array.isArray(values) ? values : [])
    .filter(
      (e): e is Record<string, unknown> & Event =>
        record(e) && typeof e.id === "string" && typeof e.name === "string",
    )
    .filter(eventIsProductEligible)
    .map((e) => ({
      ...e,
      participants: Array.isArray(e.participants)
        ? e.participants.filter((s): s is string => typeof s === "string")
        : [],
      product_tier: productTierForEvent(e),
    }));
}
// A result cannot regress to a stale schedule; fixture identity keeps its slot.
export function mergeMatches(previous: Match[], incoming: Match[]) {
  const byId = new Map(previous.map((m) => [m.match_id, m]));
  for (const m of incoming) {
    const old = byId.get(m.match_id);
    if (old && isFinal(old) && !isFinal(m)) continue;
    byId.set(m.match_id, {
      ...old,
      ...m,
      prob_team1:
        probability(m) ??
        (old &&
        teamKey(old.team1_name) === teamKey(m.team1_name) &&
        teamKey(old.team2_name) === teamKey(m.team2_name)
          ? probability(old)
          : null),
      slot_id: old?.slot_id || m.slot_id,
    });
  }
  return [...byId.values()];
}
export function allMatches(data: DeskData) {
  return mergeMatches(
    data.snapshot.upcoming_predictions || [],
    data.snapshot.coverage.daily_matches,
  );
}
export function canonicalEvents(rows: Event[], ownsFixtures = false) {
  const byName = new Map<string, Event>();
  for (const e of rows) {
    const aliases = eventAliases as Record<string, string>;
    const key =
      aliases[e.id] ||
      (Object.values(aliases).includes(e.id) ? e.id : teamKey(e.name));
    const old = byName.get(key);
    byName.set(
      key,
      old
        ? {
            ...old,
            ...e,
            id: old.id,
            start_date: e.start_date || old.start_date,
            end_date: e.end_date || old.end_date,
            location: e.location || old.location,
            format:
              old.format?.label &&
              !/pending|event schedule/i.test(old.format.label)
                ? old.format
                : e.format || old.format,
            bracket: ownsFixtures
              ? e.bracket
              : old.bracket?.rounds?.length
                ? old.bracket
                : e.bracket,
            participants: [
              ...new Set([
                ...(!ownsFixtures ? old.participants || [] : []),
                ...(e.participants || []),
              ]),
            ],
            matches: ownsFixtures
              ? mergeMatches(old.matches || [], e.matches || []).filter((m) =>
                  (e.matches || []).some((n) => n.match_id === m.match_id),
                )
              : mergeMatches(old.matches || [], e.matches || []),
          }
        : { ...e, id: aliases[e.id] || e.id },
    );
  }
  return [...byName.values()];
}
export function eventMatches(e: Event, data: DeskData) {
  return mergeMatches(
    e.matches || [],
    allMatches(data).filter(
      (m) => m.event_id === e.id || teamKey(m.event_name) === teamKey(e.name),
    ),
  );
}
export async function loadDesk(signal: AbortSignal): Promise<DeskData> {
  const results = await Promise.allSettled([
    json("/data/predictions.json", signal),
    json("/data/players.json", signal),
    json("/data/team-assets.json", signal),
  ]);
  const raw = results[0].status === "fulfilled" ? results[0].value : null;
  if (
    !record(raw) ||
    !record(raw.coverage) ||
    !Array.isArray(raw.coverage.events) ||
    !Array.isArray(raw.coverage.daily_matches)
  )
    throw new Error("The published match data could not be read.");
  const profiles = results[1].status === "fulfilled" ? results[1].value : null,
    assets = results[2].status === "fulfilled" ? results[2].value : null;
  return {
    snapshot: {
      ...raw,
      coverage: {
        ...raw.coverage,
        events: canonicalEvents(events(raw.coverage.events)),
        daily_matches: matches(raw.coverage.daily_matches),
      },
      upcoming_predictions: matches(raw.upcoming_predictions),
    } as Snapshot,
    players:
      record(profiles) && Array.isArray(profiles.players)
        ? profiles.players.filter(
            (p): p is Player =>
              record(p) &&
              typeof p.player_id === "string" &&
              typeof p.nickname === "string",
          )
        : [],
    assets: record(assets) ? (assets as DeskData["assets"]) : {},
    warnings: [
      ...(!record(profiles)
        ? ["Player profiles could not be loaded. Refresh to try again."]
        : []),
      ...(!record(assets)
        ? ["Team artwork could not be loaded. Initials remain available."]
        : []),
    ],
  };
}
export async function refreshFeed(
  data: DeskData,
  signal: AbortSignal,
): Promise<DeskData> {
  const raw = await json("/api/live-snapshot", signal);
  if (
    !record(raw) ||
    raw.ok !== true ||
    !String(raw.contract_version || "").startsWith("1.") ||
    !Array.isArray(raw.matches) ||
    snapshotFreshness(raw.fetched_at_utc).state === "unknown"
  )
    throw new Error("Invalid source snapshot");
  if (
    !canApplySnapshot(
      raw.fetched_at_utc,
      data.snapshot.coverage.last_verified_utc,
    )
  )
    return record(raw.source_health) && raw.source_health.access_error
      ? { ...data, feedUnavailable: true }
      : data;
  const feed = filterProductLiveSnapshot(raw),
    byPlayer = new Map(data.players.map((p) => [p.player_id, p]));
  for (const p of Array.isArray(feed.players) ? feed.players : []) {
    if (typeof p.player_id === "string" && typeof p.nickname === "string")
      byPlayer.set(p.player_id, {
        ...mergePlayerProfile(byPlayer.get(p.player_id), p),
        player_id: p.player_id,
        nickname: p.nickname,
      } as Player);
  }
  const ownsFixtures = raw.source === "pandascore";
  const incomingMatches = matches(feed.matches);
  const currentMatches = mergeMatches(allMatches(data), incomingMatches);
  const coverage = {
    ...data.snapshot.coverage,
    fixture_provider: ownsFixtures
      ? "pandascore"
      : data.snapshot.coverage.fixture_provider,
    events: canonicalEvents(
      [...data.snapshot.coverage.events, ...events(feed.events)],
      ownsFixtures,
    ),
    daily_matches: ownsFixtures
      ? currentMatches.filter((m) =>
          incomingMatches.some((n) => n.match_id === m.match_id),
        )
      : currentMatches,
    last_verified_utc: String(raw.fetched_at_utc),
  };
  return {
    ...data,
    snapshot: {
      ...data.snapshot,
      coverage,
      upcoming_predictions: ownsFixtures
        ? (data.snapshot.upcoming_predictions || []).filter((m) =>
            incomingMatches.some((n) => n.match_id === m.match_id),
          )
        : data.snapshot.upcoming_predictions,
    },
    players: [...byPlayer.values()],
    feedUnavailable: !!(
      record(raw.source_health) && raw.source_health.access_error
    ),
    pollAfterMs: Math.max(
      60_000,
      Math.min(900_000, Number(raw.poll_after_ms) || 180_000),
    ),
  };
}

export function mergeDesk(
  current: DeskData | null,
  incoming: DeskData,
): DeskData {
  if (!current) return incoming;
  const byId = new Map(current.players.map((p) => [p.player_id, p]));
  for (const p of incoming.players)
    byId.set(p.player_id, {
      ...mergePlayerProfile(byId.get(p.player_id), p),
      player_id: p.player_id,
      nickname: p.nickname,
    } as Player);
  const snapshot = canApplySnapshot(
    incoming.snapshot.coverage.last_verified_utc,
    current.snapshot.coverage.last_verified_utc,
  )
    ? incoming.snapshot
    : current.snapshot;
  return {
    ...incoming,
    snapshot,
    players: [...byId.values()],
    assets: { ...current.assets, ...incoming.assets },
  };
}

export function eventPhase(
  event: Event,
  now = Date.now(),
): "current" | "archive" | "unscheduled" {
  const end = Date.parse(
    event.end_date ? event.end_date.slice(0, 10) + "T23:59:59Z" : "",
  );
  if (
    /finished|completed|cancelled|canceled/.test(event.status || "") ||
    (Number.isFinite(end) && end < now)
  )
    return "archive";
  const rows = event.matches || [];
  if (Number.isFinite(end) && end >= now) return "current";
  if (rows.length && rows.every(isFinal)) return "archive";
  const latest = Math.max(
    ...rows
      .map((m) => Date.parse(m.starts_at || m.match_date || ""))
      .filter(Number.isFinite),
  );
  if (!event.start_date && latest < now - 86400000 && Number.isFinite(latest))
    return "archive";
  if (
    event.start_date ||
    rows.some((m) => Date.parse(m.starts_at || "") >= now)
  )
    return "current";
  return "unscheduled";
}

// Valve ranks rosters; an ambiguous organization cannot inherit one roster’s rank.
export function teamRating(
  data: DeskData,
  name: string,
): TeamRating | undefined {
  const model = data.snapshot.model_state?.teams?.find(
    (t) => teamKey(t.team_name) === teamKey(name),
  );
  const standings = data.snapshot.coverage.vrs;
  const rows =
    standings?.teams?.filter((t) => teamKey(t.team_name) === teamKey(name)) ||
    [];
  if (rows.length > 1)
    return model
      ? { ...model, vrs_rank: undefined, vrs_points: undefined }
      : undefined;
  if (
    rows.length === 1 &&
    (!model?.ranking_date || (standings?.as_of || "") >= model.ranking_date)
  ) {
    return {
      ...model,
      team_name: rows[0].team_name,
      vrs_rank: rows[0].rank,
      vrs_points: rows[0].points,
      ranking_date: standings?.as_of,
    };
  }
  return model;
}
