import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const css = readFileSync("web/styles.css", "utf8");
for (const declaration of css.matchAll(
  /(?:^|[;{\n])\s*(?:gap|padding(?:-inline|-block|-left|-right|-top|-bottom)?|margin(?:-inline|-block|-left|-right|-top|-bottom)?):\s*([^;{}]+);/g,
)) {
  assert.ok(
    !/\d+px/.test(declaration[1]) || declaration[1].trim() === "1px",
    `Use spacing tokens: ${declaration[0]}`,
  );
}
for (const file of readdirSync("web/views").filter((f) => f.endsWith(".tsx"))) {
  const source = readFileSync("web/views/" + file, "utf8");
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(source), `${file}: use semantic colors`);
}
console.log(
  "Design boundaries: product spacing tokens and semantic view colors passed.",
);
