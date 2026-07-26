import { eventIsProductEligible, productTierForEvent, slugify } from "./snapshot.js";

const matchEventKey = (match = {}) => String(match.event_id || slugify(match.event_name || ""));

export function filterProductLiveSnapshot(snapshot = {}) {
  const events = (snapshot.events || []).filter(eventIsProductEligible);
  const eligibleEventIds = new Set(events.flatMap((event) => [String(event.id || event.event_id || ""), slugify(event.name || event.event_name || "")]).filter(Boolean));
  const matches = (snapshot.matches || []).filter((match) => {
    const eventKey = matchEventKey(match);
    if (eligibleEventIds.has(eventKey) || eligibleEventIds.has(slugify(match.event_name || ""))) return true;
    return eventIsProductEligible({
      name: match.event_name,
      product_tier: match.product_tier,
      tier: match.event_tier,
    });
  });

  const eligibleMatchIds = new Set(matches.map((match) => String(match.match_id || match.hltv_match_id || "")).filter(Boolean));
  const playerIds = new Set(matches.flatMap((match) => [
    ...(match.lineups?.team1 || []),
    ...(match.lineups?.team2 || []),
  ]).map((player) => String(player.player_id || (player.hltv_player_id ? `hltv:${player.hltv_player_id}` : "")).trim()).filter(Boolean));
  const players = (snapshot.players || []).filter((player) => {
    if (!playerIds.size) return true;
    const playerId = String(player.player_id || (player.hltv_player_id ? `hltv:${player.hltv_player_id}` : "")).trim();
    return playerIds.has(playerId);
  });

  return {
    ...snapshot,
    events,
    matches,
    players,
    product_filter: {
      eligible_tiers: ["tier_1", "tier_2"],
      events_kept: events.length,
      matches_kept: matches.length,
      players_kept: players.length,
      event_tiers: Object.fromEntries(events.map((event) => [String(event.id || event.name), productTierForEvent(event)])),
      eligible_match_ids: [...eligibleMatchIds],
    },
  };
}
