import { readFile } from "node:fs/promises";

const [registryPath = "docs/data/model-registry.json", predictionsPath = "docs/data/predictions.json"] = process.argv.slice(2);
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const predictions = JSON.parse(await readFile(predictionsPath, "utf8"));
const artifactFields = new Set(["features", "weights", "mean", "std", "trees", "initial_log_odds", "children_left", "children_right"]);

function assertPublicModel(model, label) {
  if (!model || typeof model !== "object") return;
  const leakedFields = Object.keys(model).filter((key) => artifactFields.has(key));
  if (leakedFields.length) throw new Error(`${label} contains private model artifact fields: ${leakedFields.join(", ")}`);
  if (["portable_logistic_blend", "portable_gbdt_blend"].includes(model.kind)) {
    throw new Error(`${label} needs server-side inference before this trained model can be published.`);
  }
}

assertPublicModel(registry.champion, "model registry champion");
for (const [index, item] of (registry.history || []).entries()) assertPublicModel(item.champion, `model registry history ${index}`);
assertPublicModel(predictions.model_registry?.champion, "predictions model registry champion");
for (const [index, item] of (predictions.model_registry?.history || []).entries()) assertPublicModel(item.champion, `predictions model registry history ${index}`);
assertPublicModel(predictions.model?.production, "predictions production model");
assertPublicModel(predictions.model_state?.portable_model, "predictions portable model");
console.log("public model privacy guard ok");
