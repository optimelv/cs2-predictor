import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile("docs/embed/index.html", "utf8");
const app = await readFile("docs/embed/app.js", "utf8");
const css = await readFile("docs/embed/styles.css", "utf8");
assert.match(html, /id="embedCard"/);
assert.match(html, /team-assets\.js/);
assert.match(app, /resource=matches/);
assert.match(app, /detail=full/);
assert.match(app, /Model read pending/);
assert.match(app, /strikesignal:resize/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /@media \(max-width:520px\)/);
console.log("prediction embed contract tests ok");
