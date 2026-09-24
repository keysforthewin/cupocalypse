import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { biomeAtVisit } from "../src/render/biomes.ts";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(90000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const seedFor = (biome) => {
  for (let i = 0; i < 100; i++) {
    const seed = `SEED-CHECK-${i}`;
    if (biomeAtVisit(seed, 0) === biome) return seed;
  }
  throw Error(`No seed found for ${biome}`);
};
async function started(expectedSeed) {
  await page.waitForFunction(
    (seed) =>
      window.__gateRunner?.sim.seed === seed &&
      window.__gateRunner.sim.tick > 0 &&
      window.__biomeStatus?.revision.startsWith(seed + ":"),
    expectedSeed,
  );
  await page.evaluate(() => window.__gateRunner.freeze());
  assert.equal(
    await page.evaluate(() => window.__biomeStatus.from),
    biomeAtVisit(expectedSeed, 0),
  );
}
async function finish() {
  await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    s.debug = true;
    s.over = true;
    window.__gateRunner.freeze(false);
  });
  await page.getByRole("button", { name: /DEPLOY AGAIN/ }).waitFor();
}
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.evaluate(() =>
    localStorage.setItem(
      "gate-runner-profile",
      JSON.stringify({
        upgrades: [0, 0, 0],
        quality: "performance",
        muted: true,
      }),
    ),
  );
  await page.reload();
  const city = seedFor("city"),
    forest = seedFor("forest");
  await page.getByLabel("SEED", { exact: true }).fill(city);
  await page.getByRole("button", { name: /DEPLOY SQUAD/ }).click();
  await started(city);
  const replay = await page.evaluate(() => window.__gateRunner.sim.replay());
  mkdirSync("artifacts/seeds", { recursive: true });
  await page.screenshot({ path: "artifacts/seeds/city.png" });
  await finish();
  await page.getByRole("button", { name: /DEPLOY AGAIN/ }).click();
  await page.waitForFunction(
    (old) => window.__gateRunner.sim.seed !== old,
    city,
  );
  const second = await page.evaluate(() => window.__gateRunner.sim.seed);
  await started(second);
  console.log(
    "PASS: displayed seed is applied; Deploy Again uses a fresh seed and the matching biome",
  );
  await finish();
  await page
    .getByRole("button", { name: "RETURN TO BASE", exact: true })
    .click();
  const queued = await page.getByLabel("SEED", { exact: true }).inputValue();
  assert.notEqual(queued, second);
  await page.getByLabel("SEED", { exact: true }).fill(forest);
  await page.getByRole("button", { name: "Pin seed", exact: true }).click();
  await page.getByRole("button", { name: /DEPLOY SQUAD/ }).click();
  await started(forest);
  await page.screenshot({ path: "artifacts/seeds/forest.png" });
  await finish();
  await page.getByRole("button", { name: /DEPLOY AGAIN/ }).click();
  await started(forest);
  await finish();
  await page
    .getByRole("button", { name: "RETURN TO BASE", exact: true })
    .click();
  await page.reload();
  assert.equal(
    await page.getByLabel("SEED", { exact: true }).inputValue(),
    forest,
  );
  assert.ok(
    await page
      .getByRole("button", { name: "Unpin seed", exact: true })
      .isVisible(),
  );
  console.log(
    "PASS: pinned seeds repeat across deployments and reloads; city and forest screenshots captured",
  );
  await page.getByRole("button", { name: "Unpin seed", exact: true }).click();
  const pending = await page.getByLabel("SEED", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "seed-replay.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(replay)),
    });
  await started(city);
  // Playback may already have paused at the end of this short recording.
  if (
    !(await page
      .getByRole("button", { name: "RETURN TO BASE", exact: true })
      .isVisible())
  )
    await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "RETURN TO BASE", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("SEED", { exact: true }).inputValue(),
    pending,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: replay uses its recorded seed without consuming the next random seed; no browser errors",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
