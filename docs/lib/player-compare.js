const MAX_ID_LENGTH = 180;

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const cleanId = (value) => String(value || "").trim().slice(0, MAX_ID_LENGTH);

export function parsePlayerCompare(value, validIds = []) {
  const allowed = new Set(validIds.map(String));
  const rows = String(value || "").split(",").map(cleanId).filter(Boolean);
  return rows.filter((id, index) => rows.indexOf(id) === index && (!allowed.size || allowed.has(id))).slice(0, 2);
}

export function serializePlayerCompare(ids) {
  return parsePlayerCompare(Array.isArray(ids) ? ids.join(",") : ids).join(",");
}

export function buildPlayerCompareUrl(currentUrl, ids) {
  const compare = serializePlayerCompare(ids);
  const url = new URL(currentUrl);
  for (const key of ["event", "view", "player", "team", "match", "pickem", "release", "desk"]) url.searchParams.delete(key);
  if (compare) url.searchParams.set("compare", compare);
  else url.searchParams.delete("compare");
  url.hash = "players";
  return url.toString();
}

function metric(key, label, left, right, digits = 0, suffix = "") {
  return { key, label, left: finite(left), right: finite(right), digits, suffix };
}

function mapRows(left, right) {
  const rows = new Map();
  for (const [side, player] of [["left", left], ["right", right]]) {
    for (const map of player.map_profile || []) {
      const name = String(map.map_name || "").trim();
      if (!name) continue;
      const row = rows.get(name) || { map_name: name, left: null, right: null };
      row[side] = {
        rating: finite(map.average_rating),
        adr: finite(map.average_adr),
        kd: finite(map.kd_ratio),
        maps: finite(map.maps),
        win_rate: finite(map.win_rate),
      };
      rows.set(name, row);
    }
  }
  return [...rows.values()].sort((a, b) => {
    const aSample = (a.left?.maps || 0) + (a.right?.maps || 0);
    const bSample = (b.left?.maps || 0) + (b.right?.maps || 0);
    return bSample - aSample || a.map_name.localeCompare(b.map_name);
  });
}

export function comparePlayerProfiles(left, right) {
  if (!left || !right) return null;
  const metrics = [
    metric("rating", "Rating 3.0", left.rating_3_0, right.rating_3_0, 2),
    metric("recent", "Recent rating", left.form_summary?.recent_rating, right.form_summary?.recent_rating, 2),
    metric("adr", "Tracked ADR", left.form_summary?.average_adr, right.form_summary?.average_adr, 1),
    metric("signal", "Signal index", left.signal_index, right.signal_index, 0),
    metric("maps", "Map sample", left.maps_3m, right.maps_3m, 0),
  ];
  const traitKeys = ["firepower", "entrying", "trading", "opening", "clutching", "sniping", "utility"];
  const traits = traitKeys.map((key) => metric(key, key === "entrying" ? "Entry" : key[0].toUpperCase() + key.slice(1), left.traits?.[key], right.traits?.[key], 0));
  const decidedTraits = traits.filter((row) => row.left !== null && row.right !== null && row.left !== row.right);
  return {
    left,
    right,
    metrics,
    traits,
    maps: mapRows(left, right),
    trait_lead: {
      left: decidedTraits.filter((row) => row.left > row.right).length,
      right: decidedTraits.filter((row) => row.right > row.left).length,
      tied: traits.length - decidedTraits.length,
    },
  };
}
