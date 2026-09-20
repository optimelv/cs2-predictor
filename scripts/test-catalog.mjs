import assert from "node:assert/strict";
import { catalogManifest, queryCatalog, validateCatalogDatasets } from "../server/catalog.js";

const datasets = {
  live: {
    ok: true,
    fetched_at_utc: "2026-08-01T12:00:00Z",
    events: [{ id: "major", name: "PGL Major", status: "upcoming", product_tier: "tier_1" }],
    matches: [
      { match_id: "m1", event_id: "major", event_name: "PGL Major", team1_name: "Spirit", team2_name: "Vitality", starts_at: "2099-08-01T12:00:00Z", status: "scheduled", product_tier: "tier_1", maps: ["Nuke"], lineups: { team1: ["donk"] } },
      { match_id: "m2", event_id: "major", event_name: "PGL Major", team1_name: "MOUZ", team2_name: "G2", starts_at: "2099-08-01T13:00:00Z", status: "live", product_tier: "tier_1" },
      { event_id: "major", event_name: "PGL Major", team1_name: "NAVI", team2_name: "FURIA", starts_at: "2099-08-02T12:00:00Z", status: "scheduled", product_tier: "tier_1" },
    ],
    rankings: { teams: [{ rank: 1, team_name: "Spirit", region: "EU" }] },
    product_filter: { event_tiers: { major: "tier_1" } },
  },
  history: {
    generated_at_utc: "2026-07-31T12:00:00Z",
    matches: [{ match_id: "h1", match_date: "2026-01-01", event_name: "CCT 2026 Europe Series 5", team1_name: "Spirit", team2_name: "MOUZ", tier: "tier_2", maps: [{ map_name: "Nuke" }] }],
  },
  players: {
    players: [{ player_id: "p1", nickname: "donk", real_name: "Danil", team_name: "Spirit", rating_3_0: 1.4, form_timeline: [{ rating: 1.4 }], map_profile: [{ map_name: "Nuke" }] }],
  },
  predictions: {
    coverage: { daily_matches: [] },
    upcoming_predictions: [{ match_id: "m1", event_id: "major", event_name: "PGL Major", team1_name: "Spirit", team2_name: "Vitality", prob_team1: 0.64, predicted_winner: "Spirit", product_tier: "tier_1" }],
    major_projection: {
      event_id: "major",
      stage: "Major Swiss",
      stage_status: "live",
      seed_rows: [{ seed: 1, team_name: "Spirit" }],
      current_stage_board: { rounds: [{ round: 1, groups: [] }] },
      playoff_bracket: { quarterfinals: [] },
      final_records: [],
    },
  },
};

assert.equal(catalogManifest(datasets).resources.matches.current, 3);
assert.equal(catalogManifest(datasets).resources.events.current, 1);
const teamMatches = queryCatalog("matches", datasets, { team: "spirit" });
assert.equal(teamMatches.data.length, 1);
assert.deepEqual(teamMatches.data[0].maps, ["Nuke"]);
assert.equal(teamMatches.data[0].lineups, undefined);
assert.equal(teamMatches.data[0].prob_team1, 0.64);
assert.equal(teamMatches.data[0].status, "scheduled");
const fullMatch = queryCatalog("matches", datasets, { id: "m1", detail: "full" });
assert.deepEqual(fullMatch.data[0].maps, ["Nuke"]);
assert.equal(queryCatalog("players", datasets, { detail: "full" }).status, 400);
assert.equal(queryCatalog("players", datasets, { id: "p1", detail: "full" }).data[0].form_timeline.length, 1);
assert.equal(queryCatalog("matches", datasets, { history: "true", team: "Spirit" }).data[0].match_id, "h1");
assert.equal(queryCatalog("matches", datasets, { history: "true", event: "CCT Europe Series 5" }).data[0].match_id, "h1");
assert.equal(queryCatalog("rankings", datasets, { region: "EU" }).data.length, 1);
const firstPage = queryCatalog("matches", datasets, { limit: 1 });
assert.equal(firstPage.data.length, 1);
assert.ok(firstPage.pagination.next_cursor);
const secondPage = queryCatalog("matches", datasets, { limit: 1, cursor: firstPage.pagination.next_cursor });
assert.equal(secondPage.data[0].match_id, "m2");
const synthetic = queryCatalog("matches", datasets, { team: "NAVI" });
assert.equal(synthetic.data[0].match_id, "navi:furia:2099-08-02T12:00:00Z");
assert.equal(queryCatalog("unknown", datasets).status, 400);
assert.equal(queryCatalog("brackets", datasets).status, 400);
const bracket = queryCatalog("brackets", datasets, { event: "major" });
assert.equal(bracket.data[0].stage, "Major Swiss");
assert.equal(bracket.data[0].contract_version, "1.0");
assert.equal(bracket.data[0].lanes[0].id, "swiss");
assert.equal(bracket.data[0].lanes[0].rounds.length, 1);
assert.equal(bracket.data[0].blueprint.playoff_type, "single_elimination");
assert.equal(queryCatalog("brackets", datasets, { event: "missing" }).status, 404);
assert.equal(validateCatalogDatasets(datasets), datasets);
assert.throws(() => validateCatalogDatasets({ ...datasets, live: { ...datasets.live, matches: [{ ...datasets.live.matches[0], product_tier: "excluded" }] } }), /ineligible match/);

const staleDatasets = {
  ...datasets,
  live: {
    ...datasets.live,
    events: [{ id: "old-event", name: "Old Circuit", status: "ongoing", start_date: "2020-01-01", end_date: "2020-01-03" }],
    matches: [
      { match_id: "old-match", event_id: "old-event", event_name: "Old Circuit", team1_name: "Alpha", team2_name: "Beta", starts_at: "2020-01-02T12:00:00Z", status: "live", product_tier: "tier_1" },
      { match_id: "old-score", event_id: "old-event", event_name: "Old Circuit", team1_name: "Gamma", team2_name: "Delta", starts_at: "2020-01-02T12:00:00Z", status: "live", score1: 0, score2: 1, product_tier: "tier_1" },
      { match_id: "old-finished", event_id: "old-event", event_name: "Old Circuit", team1_name: "Epsilon", team2_name: "Zeta", starts_at: "2020-01-02T12:00:00Z", status: "finished", product_tier: "tier_1" },
    ],
    product_filter: { event_tiers: { "old-event": "tier_1" } },
  },
  predictions: { coverage: { daily_matches: [] }, upcoming_predictions: [] },
};
assert.equal(queryCatalog("matches", staleDatasets, { team: "Alpha" }).data.length, 0);
assert.equal(queryCatalog("events", staleDatasets, { status: "historical" }).data[0].display_status, "historical");
console.log("public catalog contract tests ok");
