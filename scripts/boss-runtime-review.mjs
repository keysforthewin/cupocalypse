import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "artifacts/boss-review";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() =>
  localStorage.setItem(
    "gate-runner-profile",
    JSON.stringify({
      currency: 0,
      upgrades: [0, 0, 0],
      records: {},
      muted: true,
      quality: "performance",
      runs: 0,
    }),
  ),
);
await page.goto("http://localhost:5173");
await page.waitForFunction(() => window.__gateRunner);
await page.evaluate(() => {
  window.__gateRunner.freeze();
  window.__gateRunner.scenario("The Last Witness");
});
await page.waitForFunction(
  () => window.__gateRunner.sim.boss?.kind === "The Last Witness",
);
await page.waitForFunction(() =>
  window.__sceneReview?.scene.getObjectByName(
    `boss-the-last-witness-${window.__gateRunner.sim.boss.id}`,
  ),
);
await page.getByRole("button", { name: "Unmute audio", exact: true }).click();
await page.evaluate(() => window.__gateRunner.audio.init());
console.log("Scene loaded; loading sounds");
await page.waitForFunction(() =>
  window.__gateRunner.audio.buffers.has("boss-the-last-witness-death"),
);
const audio = await page.evaluate(async () => {
  const a = window.__gateRunner.audio;
  a.sample("boss-the-last-witness-entrance", 0, 0.5);
  await new Promise((r) => setTimeout(r, 100));
  const playing = a.voices.size;
  a.muted = true;
  const mutedVoices = a.voices.size;
  a.muted = false;
  a.sample("boss-the-last-witness-death", 0, 0.5);
  a.setActive(false);
  const pausedVoices = a.voices.size;
  a.setActive(true);
  return {
    playing,
    mutedVoices,
    pausedVoices,
    bossBuffers: [...a.buffers.keys()].filter((k) => k.startsWith("boss-"))
      .length,
    expectedBossBuffers: Object.keys(a.cues).filter(k=>k.startsWith("boss-")).length,
  };
});
console.log("Audio checked", audio);
assert.ok(audio.playing > 0);
assert.equal(audio.mutedVoices, 0);
assert.equal(audio.pausedVoices, 0);
assert.equal(audio.bossBuffers, audio.expectedBossBuffers);
await page.getByRole("button", { name: /PAUSE/ }).click();
const tick = await page.evaluate(() => window.__gateRunner.sim.tick);
await page.waitForTimeout(150);
assert.equal(await page.evaluate(() => window.__gateRunner.sim.tick), tick);
await page.getByRole("button", { name: /RESUME/ }).click();
await page.evaluate(() => {
  const q = window.__gateRunner;
  q.sim.kill(q.sim.boss);
  q.freeze(false);
});
await page.waitForSelector(".victory-reveal");
console.log("Victory shown");
const victory = await page.evaluate(() => ({
  outcome: window.__gateRunner.sim.outcome,
  kills: window.__gateRunner.sim.bossKills,
  distance: window.__gateRunner.sim.distance,
  tick: window.__gateRunner.sim.tick,
}));
assert.equal(victory.outcome, "victory");
assert.equal(victory.kills, 8);
assert.equal(victory.distance, 1200);
await page.screenshot({ path: `${out}/victory.png`, timeout: 120000 });
await page.waitForSelector(".victory-reveal", { state: "detached" });
assert.ok(
  await page
    .getByText("VICTORY · EIGHT TARGETS ELIMINATED", { exact: true })
    .isVisible(),
);
assert.equal(
  await page.evaluate(() => window.__gateRunner.sim.tick),
  victory.tick,
);
fs.writeFileSync(
  `${out}/runtime.json`,
  JSON.stringify({ audio, victory, errors }, null, 2),
);
await browser.close();
assert.equal(errors.length, 0, errors.join("\n"));
console.log(
  "Victory, results, frozen simulation, pause, 30 audio decodes, mute and stop checks passed.",
);
