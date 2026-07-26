const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const signal = (key, label, delta, detail, weight = 1) => ({
  key,
  label,
  detail,
  directional_score: clamp(delta * weight, -1, 1),
});

export function explainMatch(input = {}) {
  const probability = clamp(finite(input.prob_team1, 0.5), 0.001, 0.999);
  const favoriteSide = probability >= 0.5 ? 1 : 2;
  const favorite = favoriteSide === 1 ? input.team1_name : input.team2_name;
  const underdog = favoriteSide === 1 ? input.team2_name : input.team1_name;
  const orient = (delta) => favoriteSide === 1 ? delta : -delta;
  const rating1 = finite(input.rating1, 1500);
  const rating2 = finite(input.rating2, 1500);
  const form1 = finite(input.form1, 0.5);
  const form2 = finite(input.form2, 0.5);
  const depth1 = finite(input.map_depth1, 0.5);
  const depth2 = finite(input.map_depth2, 0.5);
  const rank1 = finite(input.vrs_rank1);
  const rank2 = finite(input.vrs_rank2);
  const signals = [
    signal("rating", "Team rating", orient((rating1 - rating2) / 260), `${Math.round(favoriteSide === 1 ? rating1 : rating2)} vs ${Math.round(favoriteSide === 1 ? rating2 : rating1)}`, 1),
    signal("form", "Recent form", orient(form1 - form2), `${Math.round((favoriteSide === 1 ? form1 : form2) * 100)}% vs ${Math.round((favoriteSide === 1 ? form2 : form1) * 100)}%`, 2.2),
    signal("maps", "Map depth", orient(depth1 - depth2), `${Math.round((favoriteSide === 1 ? depth1 : depth2) * 100)}% vs ${Math.round((favoriteSide === 1 ? depth2 : depth1) * 100)}%`, 2),
  ];
  if (rank1 && rank2) {
    const favoriteRank = favoriteSide === 1 ? rank1 : rank2;
    const underdogRank = favoriteSide === 1 ? rank2 : rank1;
    signals.push(signal("ranking", "VRS order", (underdogRank - favoriteRank) / 20, `#${favoriteRank} vs #${underdogRank}`, 1));
  }
  const mapAdjusted = finite(input.map_adjusted_prob_team1);
  if (mapAdjusted !== null) {
    signals.push(signal("veto", input.veto_known ? "Official veto" : "Projected veto", orient(mapAdjusted - probability), `${Math.abs((mapAdjusted - probability) * 100).toFixed(1)} point shift`, 5));
  }

  const ordered = signals.filter((row) => Math.abs(row.directional_score) >= 0.025).sort((left, right) => Math.abs(right.directional_score) - Math.abs(left.directional_score));
  const supports = ordered.filter((row) => row.directional_score > 0).slice(0, 3);
  const counter = ordered.find((row) => row.directional_score < 0) || null;
  const confidence = Math.max(probability, 1 - probability);
  const rosterMinimum = Math.min(finite(input.lineup1_count, 0), finite(input.lineup2_count, 0));
  const vetoMinimum = Math.min(finite(input.veto1_sample, 0), finite(input.veto2_sample, 0));
  const mapEvidence = finite(input.map_evidence, 0);
  let risk = { label: "Balanced evidence", detail: "No major coverage gap", severity: "low" };
  if (confidence < 0.56) risk = { label: "Thin edge", detail: `${(confidence * 100).toFixed(1)}% leaves little separation`, severity: "high" };
  else if (rosterMinimum < 5) risk = { label: "Lineup gap", detail: `${rosterMinimum}/5 verified on the thinner side`, severity: "high" };
  else if (input.map_adjusted_prob_team1 !== undefined && vetoMinimum < 10) risk = { label: "Veto sample", detail: `${vetoMinimum} tracked vetoes on the thinner side`, severity: "medium" };
  else if (input.map_adjusted_prob_team1 !== undefined && mapEvidence < 20) risk = { label: "Map sample", detail: `${mapEvidence} combined maps in the read`, severity: "medium" };
  else if (counter && Math.abs(counter.directional_score) > 0.2) risk = { label: `${counter.label} disagrees`, detail: counter.detail, severity: "medium" };

  return {
    favorite,
    underdog,
    confidence,
    supports,
    counter,
    risk,
    signal_count: ordered.length,
  };
}
