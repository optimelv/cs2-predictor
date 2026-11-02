import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs/promises";
import { chromium } from "playwright";
const origin = process.env.PRODUCT_TEST_URL || "http://127.0.0.1:4284";
const out = "outputs/product-readiness/event-audit";
await fs.mkdir(out, { recursive: true });
const server = process.env.PRODUCT_TEST_URL
  ? null
  : spawn(process.execPath, ["scripts/dev-server.mjs"], {
      env: { ...process.env, PORT: "4284" },
      stdio: "ignore",
    });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(origin)).ok) break;
  } catch {}
  await delay(100);
}
const chrome =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let executablePath;
try {
  await fs.access(chrome);
  executablePath = chrome;
} catch {}
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
const results = [],
  errors = [];
try {
  const ctx = await browser.newContext();
  await ctx.route("**/*", (r) =>
    new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/#/events");
  await page.locator(".event-row").first().waitFor();
  const links = new Map();
  for (const name of ["Current & upcoming", "Archive", "Dates pending"]) {
    const tab = page.getByRole("tab", { name, exact: true });
    if (!(await tab.count())) continue;
    await tab.click();
    for (const l of await page.locator(".event-row").all())
      links.set(
        await l.getAttribute("href"),
        (await l.innerText()).split("\n").filter(Boolean).join(" · "),
      );
  }
  assert.ok(links.size >= 20);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [href, name] of links) {
      await page.goto(origin + "/" + href);
      await page.locator("main h1").waitFor();
      await page
        .getByText("Checking stored event results…", { exact: true })
        .waitFor({ state: "hidden", timeout: 15000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        `${name}: page overflow ${width}`,
      );
      assert.equal(
        await page
          .getByRole("heading", { name: "Event not found", exact: true })
          .count(),
        0,
      );
      assert.equal(await page.locator('path[d*="NaN"]').count(), 0);
      const count = await page.locator(".series").count();
      results.push({ width, name, href, visible_series: count });
      if (
        /iem-beijing|blast-rivals|pgl-singapore|blast-bounty-s2-finals/.test(
          href,
        )
      )
        await page.screenshot({
          path: `${out}/${href.split("/").at(-1)}-${width}.png`,
          fullPage: true,
        });
      await page.getByRole("tab", { name: /^Matches \(/ }).click();
      await page.getByRole("tab", { name: /^Teams \(/ }).click();
      await page.getByRole("tab", { name: "Bracket", exact: true }).click();
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${out}/RESULTS.json`,
    JSON.stringify(
      {
        origin,
        checked_at_utc: new Date().toISOString(),
        events: links.size,
        checks: results,
        errors,
        external_media: "blocked",
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${links.size} event pages at 320/1440px, all view tabs, no page overflow or uncaught errors`,
  );
} finally {
  await browser.close();
  server?.kill();
}
