import { readFile, writeFile } from "node:fs/promises";

const tierFor = (row) => {
  const declared = String(row.product_tier || row.tier || "").toLowerCase();
  if (["tier_2", "tier 2", "t2"].includes(declared)) return "tier_2";
  return /cct|roman imperium|esl challenger|thunderpick world championship/i.test(String(row.event_name || "")) ? "tier_2" : "tier_1";
};

function applyCalibration(rows, champion) {
  const calibration = champion.segment_calibration || {};
  const nextShrink = Number(calibration.tier_2_shrink);
  if (!Number.isFinite(nextShrink)) return rows;
  return (rows || []).map((row) => {
    const probability = Number(row.prob_team1);
    if (tierFor(row) !== "tier_2" || !Number.isFinite(probability)) return row;
    const previousShrink = Number(row.calibration_shrink);
    const rawProbability = Number.isFinite(previousShrink) && previousShrink > 0
      ? 0.5 + (probability - 0.5) / previousShrink
      : probability;
    const calibrated = Math.max(0.08, Math.min(0.92, 0.5 + nextShrink * (rawProbability - 0.5)));
    return {
      ...row,
      product_tier: "tier_2",
      prob_team1: Math.round(calibrated * 10_000) / 10_000,
      confidence: Math.round(Math.max(calibrated, 1 - calibrated) * 10_000) / 10_000,
      predicted_winner: calibrated >= 0.5 ? row.team1_name : row.team2_name,
      model_version: champion.version,
      calibration_version: calibration.version || "tier2-shrink-v1",
      calibration_shrink: nextShrink,
    };
  });
}

export async function syncModelRegistry({ registryPath, predictionsPath, predictionsJsPath }) {
  const [registry, predictions] = await Promise.all([
    readFile(registryPath, "utf8").then(JSON.parse),
    readFile(predictionsPath, "utf8").then(JSON.parse),
  ]);
  if (!registry?.champion?.version || !registry?.champion?.metrics) throw new Error("Model registry is invalid.");
  predictions.model_registry = registry;
  predictions.model ||= {};
  predictions.model.production = registry.champion;
  predictions.model_state ||= {};
  predictions.model_state.portable_model = registry.champion;
  predictions.upcoming_predictions = applyCalibration(predictions.upcoming_predictions, registry.champion);
  const body = `${JSON.stringify(predictions, null, 2)}\n`;
  await writeFile(predictionsPath, body);
  await writeFile(predictionsJsPath, `window.__STRIKESIGNAL_DATA__ = ${body.trim()};\n`);
  return { champion: registry.champion.version, monitoring_slices: registry.monitoring?.champion_slices?.length || 0 };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = await syncModelRegistry({
    registryPath: "docs/data/model-registry.json",
    predictionsPath: "docs/data/predictions.json",
    predictionsJsPath: "docs/data/predictions.js",
  });
  console.log(JSON.stringify(result));
}
