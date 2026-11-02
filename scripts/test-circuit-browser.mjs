import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile, access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const origin = process.env.PRODUCT_TEST_URL || "http://127.0.0.1:4282";
const server = process.env.PRODUCT_TEST_URL
  ? null
  : spawn(process.execPath, ["scripts/dev-server.mjs"], {
      env: { ...process.env, PORT: "4282" },
      stdio: "ignore",
    });
const output = "outputs/product-readiness/design-review";
const errors = [],
  checks = [];
let browser;
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log("PASS: " + name);
};
try {
  await mkdir(output, { recursive: true });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await delay(100);
  }
  const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  let executablePath;
  try { await access(chrome); executablePath = chrome; } catch {}
  browser = await chromium.launch({headless:true,...(executablePath ? {executablePath} : {})});
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("**/*", (r) =>
    new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
  );
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  const open = async (route) => {
    await p.goto(origin + "/#/" + route, { waitUntil: "domcontentloaded" });
    await p.locator("main h1").waitFor();
    assert.equal(await p.locator(".site-header").count(), 1);
  };
  const overflow = async () =>
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  await check(
    "Saved BLAST archive renders seven results, three rounds and six valid connections",
    async () => {
      await open("events/blast-bounty-s2-finals-2026");
      await p
        .getByRole("heading", {
          name: "Reconstructed tournament path",
          exact: true,
        })
        .waitFor();
      await p.waitForFunction(
        () =>
          document.querySelectorAll(".bracket-connectors path").length === 6,
      );
      assert.equal(await p.locator(".series:visible").count(), 7);
      assert.deepEqual(await p.locator(".bracket-round h4").allTextContents(), [
        "Quarterfinals",
        "Semifinals",
        "Grand final",
      ]);
      assert.equal(
        await p.locator(".series-meta").filter({ hasText: "Live" }).count(),
        0,
      );
      await p
        .locator(".series")
        .first()
        .getByRole("button", { name: "View series" })
        .click();
      await p.locator(".series-details").waitFor();
      assert.ok(
        (await p.locator(".series-details a").getAttribute("href")).includes(
          "/history/",
        ),
      );
      await p.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await p.screenshot({
        animations: "disabled",
        path: output + "/blast-desktop.png",
        fullPage: true,
      });
      await p.locator(".series-details a").click();
      await p
        .getByRole("link", { name: "All stored results", exact: false })
        .waitFor();
      assert.equal(
        await p.getByText("Result not found", { exact: true }).count(),
        0,
      );
    },
  );
  await check(
    "Partial World Cup archive keeps all 56 results and labels missing round assignments",
    async () => {
      await open("events/esports-world-cup-2026");
      await p.getByRole("tab", { name: "Matches (56)", exact: true }).waitFor();
      assert.equal(await p.locator(".unassigned-results").count(), 1);
      assert.equal(
        await p
          .getByRole("heading", {
            name: "Reconstructed tournament path",
            exact: true,
          })
          .count(),
        0,
      );
      await p.getByRole("tab", { name: "Matches (56)", exact: true }).click();
      assert.equal(await p.locator(".series:visible").count(), 56);
      const ids = await p
        .locator(".series:visible")
        .evaluateAll((ns) => ns.map((n) => n.dataset.matchId));
      assert.equal(new Set(ids).size, 56);
    },
  );
  await check(
    "Current events and archive are disjoint, without a duplicate All view",
    async () => {
      await open("events");
      const current = await p
        .locator(".event-row")
        .evaluateAll((ns) => ns.map((n) => n.getAttribute("href")));
      await p.getByRole("tab", { name: "Archive", exact: true }).click();
      const archive = await p
        .locator(".event-row")
        .evaluateAll((ns) => ns.map((n) => n.getAttribute("href")));
      assert.ok(current.length && archive.length);
      assert.equal(
        archive.some((id) => current.includes(id)),
        false,
      );
      assert.equal(
        await p.getByRole("tab", { name: "All", exact: true }).count(),
        0,
      );
      await open("matches");
      const fixtures = await p
        .locator(".match-row")
        .evaluateAll((ns) => ns.map((n) => n.getAttribute("href")));
      await p.getByRole("tab", { name: "Results", exact: true }).click();
      const results = await p
        .locator(".match-row")
        .evaluateAll((ns) => ns.map((n) => n.getAttribute("href")));
      assert.equal(
        results.some((id) => fixtures.includes(id)),
        false,
      );
    },
  );
  await check(
    "Archive failure retains content and explicit retry restores full results",
    async () => {
      let fail = true;
      await p.route("**/api/catalog?resource=brackets*", (r) =>
        fail ? r.fulfill({ status: 503, json: { ok: false } }) : r.continue(),
      );
      await open("events/blast-bounty-s2-finals-2026");
      const retry = p.getByRole("button", { name: "Retry stored results" });
      await retry.waitFor();
      assert.ok(await p.locator(".series:visible").count());
      fail = false;
      await retry.click();
      await p.getByRole("tab", { name: "Matches (7)", exact: true }).waitFor();
      await p.unroute("**/api/catalog?resource=brackets*");
    },
  );
  await check(
    "Shared boundary specimens, expanded long names and connected rounds fit 320–1440px in both themes",
    async () => {
      for (const theme of ["dark", "light"]) {
        await open("system");
        const toggle = p.getByRole("button", {
          name: "Switch to " + theme + " appearance",
        });
        if (await toggle.count()) await toggle.click();
        for (const width of [320, 390, 768, 1440]) {
          await p.setViewportSize({ width, height: 1000 });
          await overflow();
          const sample = p.getByTestId("product-specimens");
          assert.ok(
            (await sample.locator(".score").allTextContents()).includes("0"),
          );
          assert.ok(
            (await sample.locator(".score").allTextContents()).includes("—"),
          );
          const violations = (
            await new AxeBuilder({ page: p })
              .include('[data-testid="product-specimens"]')
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations;
          assert.deepEqual(
            violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
            [],
          );
        }
        await p.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        await p.screenshot({
          animations: "disabled",
          path: output + "/system-" + theme + ".png",
          fullPage: true,
        });
        for (const route of [
          "matches",
          "events",
          "events/blast-bounty-s2-finals-2026",
        ]) {
          await open(route);
          if (route.includes("blast"))
            await p
              .getByRole("tab", { name: "Matches (7)", exact: true })
              .waitFor();
          for (const width of [390, 1440]) {
            await p.setViewportSize({ width, height: 1000 });
            await overflow();
            await p.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
            await p.screenshot({
              animations: "disabled",
              path:
                output +
                "/" +
                route.split("/").at(-1) +
                "-" +
                theme +
                "-" +
                width +
                ".png",
              fullPage: true,
            });
          }
        }
      }
    },
  );
  await check(
    "Reduced motion and keyboard input suppress decorative movement",
    async () => {
      await p.emulateMedia({ reducedMotion: "reduce" });
      await open("system");
      await p.keyboard.press("Tab");
      assert.equal(
        await p.locator("html").getAttribute("data-input"),
        "keyboard",
      );
      const durations = await p
        .locator('[data-slot="button"]')
        .evaluateAll((ns) =>
          ns.map((n) => parseFloat(getComputedStyle(n).transitionDuration)),
        );
      assert.ok(durations.every((n) => n <= 0.00001));
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    output + "/CIRCUIT-RESULTS.json",
    JSON.stringify(
      {
        checked_at_utc: new Date().toISOString(),
        origin,
        checks,
        errors,
        external_media: "blocked; synthetic artwork tested by product suite",
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server?.kill();
}
