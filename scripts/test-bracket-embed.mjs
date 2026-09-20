import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, app] = await Promise.all([
  readFile(new URL("../docs/embed/bracket/index.html", import.meta.url), "utf8"),
  readFile(new URL("../docs/embed/bracket/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/embed/bracket/app.js", import.meta.url), "utf8"),
]);

assert.match(html, /id="bracketEmbed"/);
assert.match(html, /viewport/);
assert.match(app, /resource=brackets/);
assert.match(app, /data-lane/);
assert.match(app, /strikesignal:resize/);
assert.match(app, /Open event room/);
assert.match(css, /@media \(max-width:620px\)/);
assert.match(css, /prefers-reduced-motion/);
console.log("bracket embed contract tests ok");
