import assert from "node:assert/strict";
import { mergePlayerProfile, mergePlayerTimeline, summarizePlayerEvents, summarizePlayerMaps, summarizePlayerRosterEras, summarizePlayerTimeline } from "../docs/lib/player-history.js";
import { refreshPlayerProfiles } from "./build-player-snapshot.mjs";

const existing = Array.from({ length: 12 }, (_, index) => ({ match_id: `m${index + 1}`, date: `2026-01-${String(index + 1).padStart(2, "0")}`, rating: 1 + index / 100, adr: 70 + index }));
const merged = mergePlayerTimeline(existing, [
  { match_id: "m12", date: "2026-01-12", rating: 1.5, adr: 100 },
  { match_id: "m13", date: "2026-01-13", rating: 1.6, adr: 110 },
]);
assert.equal(merged.length, 13);
assert.equal(merged[0].match_id, "m1");
assert.equal(merged.at(-1).match_id, "m13");
assert.equal(merged.find((row) => row.match_id === "m12").rating, 1.5);

const summary = summarizePlayerTimeline(merged);
assert.equal(summary.series, 13);
assert.equal(summary.recent_rating, 1.4);
assert.equal(summary.average_adr, 79.6);
assert.equal(summary.rating_delta, 0.32);
console.log("player history contract tests ok");

const mapSummary = summarizePlayerMaps([
  { map_name: "Mirage", maps: 5, average_rating: 1.31 },
  { map_name: "Nuke", maps: 2, average_rating: 1.55 },
  { map_name: "Inferno", maps: 4, average_rating: 1.12 },
]);
assert.deepEqual(mapSummary, { maps: 11, map_count: 3, best_map: "Mirage", best_rating: 1.31 });

const richTimeline = [
  { date: "2026-01-01", event_name: "Event A", team_name: "Alpha", rating: 1.1, adr: 74, won: true },
  { date: "2026-01-02", event_name: "Event A", team_name: "Alpha", rating: 1.3, adr: 82, won: false },
  { date: "2026-02-01", event_name: "Event B", team_name: "Bravo", rating: 1.4, adr: 88, won: true },
];
assert.deepEqual(summarizePlayerEvents(richTimeline).map((row) => [row.event_name, row.series, row.average_rating]), [["Event B", 1, 1.4], ["Event A", 2, 1.2]]);
assert.deepEqual(summarizePlayerRosterEras(richTimeline).map((row) => [row.team_name, row.series, row.win_rate]), [["Bravo", 1, 1], ["Alpha", 2, 0.5]]);
console.log("player intelligence contract tests ok");

assert.equal(summarizePlayerTimeline([{ rating: null, adr: "" }]).average_rating, null);
assert.equal(summarizePlayerTimeline([{ rating: 0, adr: 0 }]).average_adr, 0);
const profile = { rating_3_0: 1.2, maps_3m: 40, stats_through_date: "2026-06-08", form_timeline: [{ match_id: "old", date: "2026-06-01", rating: 1.1 }] };
const partial = mergePlayerProfile(profile, { rating_3_0: 2, maps_3m: 1, form_timeline: [{ match_id: "new", date: "2026-10-13", rating: 2 }] });
assert.equal(partial.rating_3_0, 1.2, "A live series must not overwrite an aggregate profile");
assert.equal(partial.maps_3m, 40);
assert.equal(partial.form_timeline.length, 2, "Browser and publisher must preserve collected history");
const fresh = mergePlayerProfile(profile, { rating_3_0: 1.3, maps_3m: 55, stats_from_date: "2026-07-14", stats_through_date: "2026-10-14" });
assert.equal(fresh.rating_3_0, 1.3);
assert.equal(mergePlayerProfile(fresh, { rating_3_0: .7, stats_from_date: "2026-03-01", stats_through_date: "2026-06-08" }).rating_3_0, 1.3);

const verifiedProfile = { player_id: "hltv:21167", nickname: "donk", current_team: "Spirit", verified: true,
  rating_3_0: 1.37, maps_3m: 63, source_url: "https://www.hltv.org/player/21167/donk",
  stats_through_date: "2026-10-13", checked_at_utc: "2026-10-14T07:00:00Z",
  traits: { firepower: 100, entrying: 60, trading: 75, opening: 96, clutching: 48, sniping: 0, utility: 31 } };
const source = { checked_at_utc: verifiedProfile.checked_at_utc, players: [verifiedProfile] };
const refreshed = refreshPlayerProfiles({ players: [{ ...profile, player_id: "hltv:21167" }, { player_id: "hltv:1", nickname: "Other" }] }, source);
assert.equal(refreshed.players.length, 2, "Profile refresh must retain players outside the source batch");
assert.equal(refreshed.players[0].rating_3_0, 1.37);
assert.equal(refreshed.players[0].stats_through_date, "2026-10-13", "Retrieval today must not relabel yesterday's source");
assert.equal(refreshed.players[0].form_timeline.length, 1);
assert.equal(refreshed.players[0].traits.sniping, 0, "Zero is a valid trait value");
assert.equal(mergePlayerProfile(refreshed.players[0], { team_name: "Former team", form_timeline: [{ match_id: "old-result", date: "2026-10-12" }] }).team_name, "Spirit", "Older match lineups cannot overwrite a newer profile team");
assert.throws(() => refreshPlayerProfiles({ players: [] }, { ...source, players: [{ ...verifiedProfile, source_url: "https://example.com/player/21167/donk" }] }), /source/);
assert.throws(() => refreshPlayerProfiles({ players: [] }, { ...source, players: [{ ...verifiedProfile, verified: false }] }), /No verified/);
