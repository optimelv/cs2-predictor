import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const origin = process.env.PRODUCT_TEST_URL || "http://127.0.0.1:4283";
const output = "outputs/product-readiness/rounded-review";
const server = process.env.PRODUCT_TEST_URL
  ? null
  : spawn(process.execPath, ["scripts/dev-server.mjs"], {
      env: { ...process.env, PORT: "4283" },
      stdio: "ignore",
    });
let browser, page;
const errors = [],
  checks = [];
async function open(route) {
  await page.goto(origin + "/#/" + route);
  await page.locator("main h1").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator(".freshness")
    .getByRole("button", { name: "Refresh", exact: true })
    .waitFor();
}
async function fits() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    "No page overflow",
  );
}
try {
  await mkdir(output, { recursive: true });
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
    await access(chrome);
    executablePath = chrome;
  } catch {}
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const ctx = await browser.newContext();
  await ctx.route("**/*", (r) =>
    new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
  );
  page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await open("");
    assert.match(await page.locator("h1").innerText(), /Read the\nCS2 circuit/);
    assert.equal(
      await page
        .locator("h1")
        .evaluate(
          (e) =>
            e.getBoundingClientRect().height /
              parseFloat(getComputedStyle(e).lineHeight) <=
            2.05,
        ),
      true,
      "Hero fits two lines",
    );
    await fits();
    const previews = page.locator(".hero-switch button");
    if ((await previews.count()) > 1) {
      const before = await page.locator(".hero-match-teams").innerText();
      await previews.nth(1).click();
      assert.notEqual(
        await page.locator(".hero-match-teams").innerText(),
        before,
      );
    }
    await page.screenshot({
      path: `${output}/home-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Open match desk", exact: false })
      .click();
    await page.locator(".match-row").first().waitFor();
    const matchRadius = await page
      .locator(".match-row")
      .first()
      .evaluate((e) => getComputedStyle(e).borderRadius);
    assert.equal(matchRadius, "8px");
    assert.ok(await page.locator(".match-day").count());
    for (const heading of await page.locator(".match-day").all()) {
      assert.equal(
        await heading.evaluate((e) => {
          const r = document.createRange();
          r.selectNodeContents(e);
          const t = r.getBoundingClientRect(),
            b = e.getBoundingClientRect();
          return (
            t.top >= b.top &&
            t.bottom <= b.bottom &&
            t.left >= b.left &&
            t.right <= b.right
          );
        }),
        true,
        "Complete date text fits its own box",
      );
    }
    await fits();
    await page.screenshot({
      path: `${output}/matches-${width}.png`,
      fullPage: true,
    });
    await open("events");
    assert.equal(
      await page
        .locator(".event-row")
        .first()
        .evaluate((e) => getComputedStyle(e).borderRadius),
      matchRadius,
    );
    await fits();
    await page.screenshot({
      path: `${output}/events-${width}.png`,
      fullPage: true,
    });
    await open("teams");
    assert.ok(
      await page.getByText("Predicted VRS rank", { exact: true }).count(),
    );
    assert.ok(
      await page.getByText("Official VRS rank", { exact: true }).count(),
    );
    await fits();
    await page.screenshot({
      path: `${output}/teams-${width}.png`,
      fullPage: true,
    });
    checks.push(
      `Landing, switchable match preview, rounded match/event cards, date bounds, rankings at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open("system");
  // Exercise the real media slot with wide/tall/square original artwork dimensions.
  for (const [w, h] of [
    [100, 20],
    [20, 100],
    [100, 100],
  ]) {
    await page
      .locator(".crest")
      .first()
      .evaluate(
        (e, { w, h }) => {
          e.innerHTML = `<img alt="" src="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/></svg>`)}">`;
        },
        { w, h },
      );
    assert.equal(
      await page
        .locator(".crest")
        .first()
        .evaluate((e) => {
          const i = e.querySelector("img"),
            a = e.getBoundingClientRect(),
            b = i.getBoundingClientRect();
          const s = getComputedStyle(i);
          return (
            Math.abs(a.x + a.width / 2 - b.x - b.width / 2) < 0.6 &&
            Math.abs(a.y + a.height / 2 - b.y - b.height / 2) < 0.6 &&
            s.objectPosition === "50% 50%" &&
            s.objectFit === "contain"
          );
        }),
      true,
      "Logo slot centered for every aspect ratio",
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const movement = await page
    .locator('[data-slot="button"]')
    .first()
    .evaluate((e) => getComputedStyle(e).transitionProperty);
  assert.equal(movement.includes("transform"), false);
  checks.push(
    "Wide/tall/square crest alignment; reduced-motion removes transforms",
  );
  for (const theme of ["dark", "light"]) {
    await open("");
    if (theme === "light")
      await page
        .getByRole("button", { name: "Switch to light appearance" })
        .click();
    await page.locator(".skip-link").focus();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
      `Landing accessibility ${theme}`,
    );
    await page.screenshot({
      path: `${output}/home-${theme}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/RESULTS.json`,
    JSON.stringify(
      {
        checked_at_utc: new Date().toISOString(),
        checks,
        uncaught_errors: errors,
        external_requests: "blocked",
      },
      null,
      2,
    ),
  );
  console.log("PASS", checks.length, "design regression groups");
} finally {
  await browser?.close();
  server?.kill();
}
