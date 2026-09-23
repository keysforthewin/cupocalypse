import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
const base = process.env.GAME_URL || "http://localhost:5195";
// Run only against an isolated review server/database: this creates test scores.
if (!process.env.LEADERBOARD_REVIEW_ALLOW_WRITES)
  throw new Error(
    "Set LEADERBOARD_REVIEW_ALLOW_WRITES=1 for an isolated test database.",
  );
for (let i = 1; i <= 12; i++) {
  const response = await fetch(`${base}/api/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: randomUUID(),
      playerId: randomUUID(),
      name: `Survivor ${i}`,
      distance: 100 * i,
      kills: 13 - i,
      mode: "Classic",
    }),
  });
  assert.equal(response.status, 200);
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page
    .getByRole("table", { name: "Top 10 by distance" })
    .locator("tbody tr")
    .nth(9)
    .waitFor();
  assert.equal(
    await page
      .getByRole("table", { name: "Top 10 by distance" })
      .locator("tbody tr")
      .count(),
    10,
  );
  assert.equal(
    await page
      .getByRole("table", { name: "Top 10 by kill count" })
      .locator("tbody tr")
      .count(),
    0,
  );
  for (const mode of [
    "Reverse",
    "Swarm",
    "Fortress",
    "Mirror",
    "Sudden Death",
  ]) {
    await page.locator("#mode").selectOption(mode);
    await page
      .getByText(`No scores yet for ${mode}. Set the first record.`, {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".leaderboards tbody tr").count(), 0);
    assert.ok(
      (await page.locator(".leaderboard-heading").innerText()).includes(
        mode.toUpperCase(),
      ),
    );
  }
  await page.locator("#mode").selectOption("Classic");
  await page.locator(".leaderboards tbody tr").nth(9).waitFor();
  // A failed request for another protocol must not leave Classic scores visible.
  await page.route("**/api/leaderboards?mode=Reverse", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.locator("#mode").selectOption("Reverse");
  await page
    .getByText("Shared scores are unavailable.", { exact: false })
    .waitFor();
  assert.equal(await page.locator(".leaderboards tbody tr").count(), 0);
  await page.unroute("**/api/leaderboards?mode=Reverse");
  await page
    .locator(".leaderboards")
    .getByRole("button", { name: "RETRY" })
    .click();
  await page
    .getByText("No scores yet for Reverse. Set the first record.", {
      exact: true,
    })
    .waitFor();
  await page.locator("#mode").selectOption("Classic");
  await page.locator(".leaderboards tbody tr").nth(9).waitFor();
  const inset = await page.locator("#mode").evaluate((el) => ({
    padding: getComputedStyle(el).paddingLeft,
    position: getComputedStyle(el).backgroundPosition,
    appearance: getComputedStyle(el).appearance,
  }));
  assert.equal(inset.appearance, "none");
  assert.ok(inset.position.includes(inset.padding));
  fs.mkdirSync("artifacts/leaderboards", { recursive: true });
  await page.screenshot({ path: "artifacts/leaderboards/menu.png" });
  for (const [width, height] of [
    [1280, 720],
    [960, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .getByRole("table", { name: "Top 10 by distance" })
      .isVisible()
      .then((v) => assert.equal(v, true));
    await page.screenshot({
      path: `artifacts/leaderboards/menu-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#quality").selectOption("performance");
  await page.getByRole("button", { name: "Close panel" }).click();
  const finish = async (distance, kills) => {
    await page.waitForFunction(() => window.__gateRunner?.sim.tick > 5, null, {
      timeout: 90000,
    });
    await page.evaluate(
      ({ distance, kills }) => {
        const s = window.__gateRunner.sim;
        s.distance = distance;
        s.kills = kills;
        s.hitSquad(100000, "Leaderboard review");
      },
      { distance, kills },
    );
    await page.getByRole("button", { name: "DEPLOY AGAIN" }).waitFor();
  };
  await page.locator("#mode").selectOption("Reverse");
  await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
  await finish(2345, 321);
  await page.getByLabel("YOUR NAME ON THE LEADERBOARD").fill("Cup Tester");
  await page.getByRole("button", { name: "SAVE SCORE", exact: true }).click();
  await page.getByText("Score saved as Cup Tester.", { exact: true }).waitFor();
  await page
    .getByRole("table", { name: "Top 10 by distance" })
    .getByText("Cup Tester", { exact: true })
    .waitFor();
  assert.ok(
    (await page.locator(".leaderboard-heading").innerText()).includes(
      "REVERSE",
    ),
  );
  await page.screenshot({ path: "artifacts/leaderboards/results.png" });
  const other = await browser.newPage();
  await other.goto(base);
  await other.locator("#mode").selectOption("Reverse");
  await other
    .getByRole("table", { name: "Top 10 by distance" })
    .getByText("Cup Tester", { exact: true })
    .waitFor();
  await other.close();
  await page.getByRole("button", { name: "RETURN TO BASE" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Leaderboard name", { exact: true })
    .fill("Cup Renamed");
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(
    await page.getByLabel("Leaderboard name", { exact: true }).inputValue(),
    "Cup Renamed",
  );
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.locator("#mode").selectOption("Reverse");
  await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
  await page.route("**/api/scores", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await finish(3000, 400);
  await page.getByText("Score could not be saved.", { exact: false }).waitFor();
  assert.equal(await page.locator("#score-name").count(), 0);
  await page.unroute("**/api/scores");
  await page
    .locator(".score-submission")
    .getByRole("button", { name: "RETRY" })
    .click();
  await page
    .getByText("Score saved as Cup Renamed.", { exact: true })
    .waitFor();
  await page
    .getByRole("table", { name: "Top 10 by distance" })
    .getByText("Cup Renamed", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("table", { name: "Top 10 by distance" })
      .getByText("Cup Tester", { exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "DEPLOY AGAIN" }).click();
  await page.waitForFunction(() => window.__gateRunner?.sim.tick > 5, null, {
    timeout: 90000,
  });
  await page.evaluate(() => {
    window.__gateRunner.sim.debug = true;
  });
  await finish(4000, 500);
  assert.equal(await page.locator(".score-submission").count(), 0);
  assert.ok(
    !(
      await (await fetch(`${base}/api/leaderboards?mode=Reverse`)).json()
    ).distance.some((s) => s.distance === 4000),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: distance only, protocol switching and isolation, failed switch and retry, shared browsers, responsive layout, select inset, name entry, remembered rename, auto submit, retry, unique player, practice exclusion.",
  );
} catch (error) {
  await page.screenshot({ path: "artifacts/leaderboards/failure.png" });
  console.error("Browser errors:", errors);
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
