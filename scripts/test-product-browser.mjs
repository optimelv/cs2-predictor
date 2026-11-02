import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile, access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const origin = process.env.PRODUCT_TEST_URL || "http://127.0.0.1:4281";
const output = "outputs/product-readiness/browser";
await mkdir(output, { recursive: true });
const server = process.env.PRODUCT_TEST_URL
  ? null
  : spawn(process.execPath, ["scripts/dev-server.mjs"], {
      env: { ...process.env, PORT: "4281" },
      stdio: "ignore",
    });
let browser;
const results = [];
const errors = [];
async function check(name, run) {
  await run();
  results.push(name);
  console.log("PASS: " + name);
}
async function context(options = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...options,
  });
  await ctx.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  ctx.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  return ctx;
}
async function open(ctx, route) {
  const page = await ctx.newPage();
  await page.goto(origin + "/#/" + route);
  await page.locator("main h1").waitFor();
  await page.getByRole("button", { name: "Refresh", exact: true }).waitFor();
  return page;
}
async function noOverflow(p) {
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
}
async function audit(p) {
  const v = (
    await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  ).violations;
  assert.deepEqual(
    v.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        html: n.html,
        reason: n.failureSummary,
      })),
    })),
    [],
    p.url(),
  );
}
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(origin + "/")).ok) break;
    } catch {}
    if (i === 49) throw new Error("Preview did not start");
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
  const base = JSON.parse(await readFile("docs/data/predictions.json", "utf8"));
  const supported = base.coverage.events.filter((e) =>
    [
      "single_elimination",
      "double_elimination",
      "swiss",
      "gsl",
      "round_robin",
    ].includes(e.format?.type),
  );
  await check(
    "Every supported published event opens without errors or page overflow",
    async () => {
      const ctx = await context();
      const p = await open(ctx, "events");
      for (const event of supported) {
        await p.goto(origin + "/#/events/" + encodeURIComponent(event.id));
        await p.locator("main h1").waitFor();
        await noOverflow(p);
        assert.ok(
          await p
            .locator(
              '[role=region][aria-label="Tournament rounds"], [data-slot=empty]',
            )
            .count(),
        );
      }
      await ctx.close();
    },
  );
  await check(
    "Desktop, tablet, phone and 320px layouts in both appearances",
    async () => {
      const ctx = await context();
      const p = await open(ctx, "matches");
      for (const width of [1440, 768, 390, 320]) {
        await p.setViewportSize({ width, height: 900 });
        for (const route of [
          "matches",
          "events",
          "players",
          "teams",
          "picks",
          "system",
        ]) {
          await p.goto(origin + "/#/" + route);
          await p.locator("main h1").waitFor();
          await noOverflow(p);
        }
      }
      for (const theme of ["light", "dark"]) {
        const toggle = p.getByRole("button", {
          name: "Switch to " + theme + " appearance",
        });
        if (await toggle.count()) await toggle.click();
        for (const route of [
          "matches",
          "events",
          "players",
          "teams",
          "picks",
          "system",
        ]) {
          await p.goto(origin + "/#/" + route);
          await p.locator("main h1").waitFor();
          await audit(p);
        }
        await p.screenshot({
          path: output + "/system-" + theme + ".png",
          fullPage: true,
        });
      }
      await ctx.close();
    },
  );
  await check(
    "Player search, two-person comparison and profile navigation",
    async () => {
      const ctx = await context();
      const p = await open(ctx, "players");
      await p.getByLabel("Find a player or team").fill("SunPayus");
      assert.equal(await p.locator(".player-card").count(), 1);
      await p
        .getByRole("button", { name: "Compare player", exact: true })
        .click();
      await p.getByLabel("Find a player or team").fill("ZywOo");
      await p
        .getByRole("button", { name: "Compare player", exact: true })
        .click();
      await p.locator(".comparison .comparison-head>div").nth(1).waitFor();
      assert.equal(
        await p.locator(".comparison .comparison-head>div").count(),
        2,
      );
      await p
        .locator(".comparison")
        .getByRole("link", { name: "ZywOo", exact: true })
        .click();
      await p.getByRole("heading", { name: "ZywOo", exact: true }).waitFor();
      await p.getByRole("tab", { name: /Recorded form/ }).click();
      await noOverflow(p);
      await ctx.close();
    },
  );
  await check(
    "Veto requires select then confirm, undo/reset and Escape restores focus",
    async () => {
      const ctx = await context({ reducedMotion: "reduce" });
      const id = base.upcoming_predictions.find(
        (m) => m.series_format === "bo3",
      ).match_id;
      const p = await open(ctx, "matches/" + encodeURIComponent(id));
      const trigger = p.getByRole("button", { name: "Simulate map veto" });
      await trigger.click();
      const d = p.getByRole("dialog");
      await d.waitFor();
      await d.getByRole("button", { name: "Ancient", exact: true }).click();
      assert.equal(await d.locator(".veto-log li").count(), 0);
      await d.getByRole("button", { name: "Confirm ban", exact: true }).click();
      assert.equal(await d.locator(".veto-log li").count(), 1);
      await d.getByRole("button", { name: "Undo", exact: true }).click();
      assert.equal(await d.locator(".veto-log li").count(), 0);
      for (let i = 0; i < 6; i++) {
        await d.locator(".map-options button:not(:disabled)").first().click();
        await d.getByRole("button", { name: /^Confirm / }).click();
      }
      assert.equal(await d.locator(".veto-log li").count(), 7);
      await d.getByRole("button", { name: "Reset veto" }).click();
      assert.equal(await d.locator(".veto-log li").count(), 0);
      await audit(p);
      await p.keyboard.press("Escape");
      await d.waitFor({ state: "hidden" });
      assert.equal(
        await trigger.evaluate((e) => e === document.activeElement),
        true,
      );
      await ctx.close();
    },
  );
  const now = new Date().toISOString(),
    future = new Date(Date.now() + 3_600_000).toISOString(),
    old = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const match = {
    match_id: "qa:match",
    event_id: "qa:event",
    event_name: "IEM QA fixture",
    product_tier: "tier_1",
    team1_name: "QA Alpha",
    team2_name: "QA Beta",
    starts_at: future,
    status: "upcoming",
    series_format: "bo3",
    prob_team1: 0.63,
  };
  const event = {
    id: "qa:event",
    name: "IEM QA fixture",
    product_tier: "tier_1",
    format: { type: "single_elimination", label: "Test fixture" },
    participants: ["QA Alpha", "QA Beta"],
  };
  const snapshot = {
    generated_at_utc: now,
    coverage: {
      events: [event],
      daily_matches: [match],
      last_verified_utc: now,
    },
    upcoming_predictions: [match],
    model_state: {
      map_pool: [
        "Ancient",
        "Anubis",
        "Dust2",
        "Inferno",
        "Mirage",
        "Nuke",
        "Overpass",
      ],
    },
  };
  async function fixture(ctx, { stamp = now, blocked = false } = {}) {
    let feed = {
      ok: true,
      contract_version: "1.1",
      fetched_at_utc: stamp,
      matches: [match],
      events: [event],
      players: [],
    };
    await ctx.route(origin + "/data/predictions.json", (r) =>
      r.fulfill({
        json: {
          ...snapshot,
          coverage: { ...snapshot.coverage, last_verified_utc: stamp },
        },
      }),
    );
    await ctx.route(origin + "/data/team-assets.json", (r) =>
      r.fulfill({ json: {} }),
    );
    await ctx.route(origin + "/data/players.json", (r) =>
      r.fulfill({ json: { players: [] } }),
    );
    await ctx.route(origin + "/api/live-snapshot", (r) =>
      blocked
        ? r.fulfill({ status: 503, json: { ok: false } })
        : r.fulfill({ json: feed }),
    );
    return (value) => {
      feed = value;
    };
  }
  await check(
    "Fresh pick saves only after selection, survives reload and follows persist",
    async () => {
      const ctx = await context();
      await fixture(ctx);
      const p = await open(ctx, "matches/qa%3Amatch");
      assert.equal(
        await p
          .getByRole("button", { name: "Save pick", exact: true })
          .isDisabled(),
        true,
      );
      await p.getByRole("button", { name: "QA Alpha", exact: true }).click();
      await p.getByRole("button", { name: "Save pick", exact: true }).click();
      await p.reload();
      await p.getByText("Saved: QA Alpha", { exact: false }).waitFor();
      await p.goto(origin + "/#/teams/QA%20Alpha");
      await p.getByRole("button", { name: "Follow", exact: true }).click();
      await p.reload();
      await p.getByRole("button", { name: "Following", exact: true }).waitFor();
      await p.goto(origin + "/#/picks");
      await p.locator(".match-row").waitFor();
      assert.ok(
        (await p.locator(".following-strip").innerText()).includes("QA Alpha"),
      );
      await ctx.close();
    },
  );
  await check(
    "A new result refreshes the UI; an older snapshot cannot erase it",
    async () => {
      const ctx = await context();
      const setFeed = await fixture(ctx);
      const p = await open(ctx, "matches/qa%3Amatch");
      const final = {
        ...match,
        status: "finished",
        score1: 2,
        score2: 0,
        winner_name: "QA Alpha",
      };
      setFeed({
        ok: true,
        contract_version: "1.1",
        fetched_at_utc: new Date().toISOString(),
        matches: [final],
        events: [event],
        players: [],
      });
      await p.getByRole("button", { name: "Refresh", exact: true }).click();
      await p
        .getByRole("heading", { name: "Published result", exact: true })
        .waitFor();
      setFeed({
        ok: true,
        contract_version: "1.1",
        fetched_at_utc: old,
        matches: [match],
        events: [event],
        players: [],
      });
      await p.getByRole("button", { name: "Refresh", exact: true }).click();
      await p.getByRole("button", { name: "Refresh", exact: true }).waitFor();
      assert.equal(
        await p
          .getByRole("heading", { name: "Published result", exact: true })
          .count(),
        1,
      );
      await ctx.close();
    },
  );
  await check(
    "Stale or failed source retains data and blocks new picks",
    async () => {
      const ctx = await context();
      await fixture(ctx, { stamp: new Date().toISOString(), blocked: true });
      const p = await open(ctx, "matches/qa%3Amatch");
      assert.equal(
        await p
          .getByRole("button", { name: "Save pick", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await p
          .getByRole("heading", { name: "QA Alpha vs QA Beta", exact: true })
          .count(),
        1,
      );
      await p.getByText("Refresh unavailable", { exact: true }).waitFor();
      await audit(p);
      await ctx.close();
    },
  );
  await check(
    "Unavailable browser storage does not crash theme, profiles or follow",
    async () => {
      const ctx = await context();
      await ctx.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Blocked", "SecurityError");
          },
        });
      });
      const p = await open(ctx, "players/hltv%3A19164");
      await p.getByRole("button", { name: "Follow", exact: true }).click();
      await p
        .getByText("Browser storage is unavailable.", { exact: false })
        .waitFor();
      await p
        .getByRole("button", { name: "Switch to light appearance" })
        .click();
      await noOverflow(p);
      await ctx.close();
    },
  );
  await check("Unknown entity routes provide an exit", async () => {
    const ctx = await context();
    for (const route of [
      "matches/missing",
      "events/missing",
      "players/missing",
      "teams/missing",
    ]) {
      const p = await ctx.newPage();
      await p.goto(origin + "/#/" + route);
      await p.getByText(/not found/i).waitFor();
      assert.ok(await p.locator("main a.back-link").count());
      await p.close();
    }
    await ctx.close();
  });
  await check(
    "Stored results search, pagination, detail and return preserve the archive",
    async () => {
      const ctx = await context();
      const p = await open(ctx, "history");
      await p.locator(".match-row").first().waitFor();
      const first = await p.locator(".match-row").first().getAttribute("href");
      await p.getByRole("button", { name: "Load more stored results" }).click();
      await p.waitForFunction(
        () => document.querySelectorAll(".match-row").length > 40,
      );
      await p.locator(".match-row").first().click();
      await p.getByText("Stored source result.", { exact: false }).waitFor();
      await p
        .getByRole("link", { name: "All stored results", exact: false })
        .click();
      await p.locator(".match-row").first().waitFor();
      assert.equal(
        await p.locator(".match-row").first().getAttribute("href"),
        first,
      );
      await p
        .getByRole("textbox", { name: "Team or tournament" })
        .fill("natus vincere");
      await p
        .getByRole("button", { name: "Search archive", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Search archive", exact: true })
        .waitFor({ state: "visible" });
      await p.waitForFunction(
        () => !document.querySelector('button[type="submit"]').disabled,
      );
      await noOverflow(p);
      await audit(p);
      await ctx.close();
    },
  );
  await check(
    "White and black artwork retain contrast; failed media falls back",
    async () => {
      const ctx = await context();
      await fixture(ctx);
      await ctx.route(origin + "/data/team-assets.json", (r) =>
        r.fulfill({
          json: {
            "qa alpha": { logo_url: "/assets/qa-white.svg" },
            "qa beta": { logo_url: "/assets/qa-black.svg" },
          },
        }),
      );
      await ctx.route(origin + "/assets/qa-*.svg", (r) =>
        r.fulfill({
          contentType: "image/svg+xml",
          body:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><circle cx="15" cy="15" r="10" fill="' +
            (r.request().url().includes("white") ? "white" : "black") +
            '"/></svg>',
        }),
      );
      const p = await open(ctx, "matches");
      await p.waitForFunction(
        () =>
          [...document.querySelectorAll(".crest img")].length === 2 &&
          [...document.querySelectorAll(".crest img")].every(
            (i) => i.complete && i.naturalWidth > 0,
          ),
      );
      for (const theme of ["light", "dark"]) {
        const toggle = p.getByRole("button", {
          name: "Switch to " + theme + " appearance",
        });
        if (await toggle.count()) await toggle.click();
        assert.deepEqual(
          await p
            .locator(".crest img")
            .evaluateAll((images) =>
              images.map((i) => [
                getComputedStyle(i).filter,
                getComputedStyle(i.parentElement).backgroundColor,
              ]),
            ),
          [
            ["none", "rgb(118, 118, 118)"],
            ["none", "rgb(118, 118, 118)"],
          ],
        );
      }
      await ctx.route(origin + "/assets/qa-*.svg", (r) => r.abort());
      await p.reload();
      await p.waitForFunction(
        () => document.querySelectorAll(".crest img").length === 0,
      );
      await ctx.close();
    },
  );
  await check(
    "Old entity links and malformed saved picks remain usable",
    async () => {
      const ctx = await context();
      await ctx.addInitScript(() => {
        if (location.protocol === "about:") return;
        localStorage.setItem(
          "strikesignal.saved-picks.v1",
          JSON.stringify({ bad: null, also: { team_name: 4 } }),
        );
      });
      const p = await ctx.newPage();
      await p.goto(origin + "/?player=hltv%3A19164#players");
      await p
        .getByRole("heading", { level: 1, name: "SunPayus", exact: true })
        .waitFor();
      await p.goto(origin + "/#/picks");
      await p
        .getByRole("heading", { level: 1, name: "Your match desk" })
        .waitFor();
      await ctx.close();
    },
  );
  await check(
    "Classic tournament tools, search and desk remain reachable",
    async () => {
      const ctx = await context();
      const p = await ctx.newPage();
      await p.goto(origin + "/legacy.html?event=iem-beijing-2026#featured");
      await p.waitForFunction(() =>
        document.body.classList.contains("product-ready"),
      );
      await p.locator("#eventSelector").selectOption("iem-beijing-2026");
      await p.waitForFunction(
        () => document.querySelector("#swissBoard").textContent.length > 100,
      );
      await p.locator("#openSearch").click();
      await p.locator("#productSearch").fill("Spirit");
      await p
        .locator("#searchResults")
        .getByText("Spirit", { exact: true })
        .first()
        .waitFor();
      await p.keyboard.press("Escape");
      await p.locator("#mobileMyDesk").click();
      await p.waitForFunction(
        () => document.body.dataset.productPage === "picks",
      );
      assert.ok((await p.locator("#myDeskContent").innerText()).length > 50);
      await p
        .getByRole("link", {
          name: "Return to the current match desk",
          exact: false,
        })
        .click();
      await p
        .getByRole("heading", { level: 1, name: "The match desk", exact: true })
        .waitFor();
      await ctx.close();
    },
  );
  assert.deepEqual(errors, [], "No uncaught browser errors");
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      output + "/RESULTS.json",
      JSON.stringify(
        {
          checked_at_utc: new Date().toISOString(),
          checks: results,
          uncaught_errors: errors,
          external_requests: "blocked",
        },
        null,
        2,
      ) + "\n",
    ),
  );
  console.log(
    `Product browser checks passed (${results.length} scenarios, ${supported.length} event formats).`,
  );
} finally {
  await browser?.close();
  server?.kill();
}
