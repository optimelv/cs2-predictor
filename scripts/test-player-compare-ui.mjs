import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, app] = await Promise.all([
  readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
  readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
]);

assert.match(html, /id="playerCompareLayer"/);
assert.match(html, /id="playerCompareTray"/);
assert.match(html, /aria-modal="true" aria-labelledby="playerCompareTitle"/);
assert.match(app, /parsePlayerCompare/);
assert.match(app, /buildPlayerCompareUrl/);
assert.match(app, /data-compare-player/);
assert.match(app, /data-share-player-compare/);
assert.match(app, /window\.requestAnimationFrame\(openPlayerCompare\)/);
assert.match(css, /\.player-compare-hero/);
assert.match(css, /@media \(max-width: 620px\)/);
assert.match(css, /prefers-reduced-motion/);
console.log("player compare UI contract tests ok");
