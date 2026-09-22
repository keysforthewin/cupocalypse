import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "artifacts/animation-review";
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
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
await page.goto(process.env.GAME_URL || "http://localhost:5173");
await page.waitForFunction(() => window.__gateRunner);
await page.evaluate(() => window.__gateRunner.freeze());
const checks = [];
for (const kind of (
  process.env.KINDS ||
  "Bulwark,Broodmass,Congregation,Screamer,Spitter,Gunner,Carrier,Charger"
).split(",")) {
  await page.evaluate((kind) => window.__gateRunner.scenario(kind), kind);
  await page.waitForTimeout(300);
  const motions = await page.evaluate(() => {
    const q = window.__gateRunner,
      s = q.sim,
      e = s.enemies[0];
    e.z = 14;
    e.cooldown = 0;
    s.fireClock = 1e9;
    s.update({ x: 0 }, false);
    q.advance(0);
    return e.motions;
  });
  assert.ok(motions.length, kind + " committed motion");
  await page.waitForTimeout(500);
  const m = motions[0];
  for (const [label, tick] of [
    ["ready", m.start],
    ["windup", m.strike - (m.kind === "pool" ? 41 : 14)],
    ["impact", m.strike],
    ["recover", m.strike + 40],
  ]) {
    await page.evaluate((t) => {
      const q = window.__gateRunner;
      q.sim.tick = t;
      q.advance(0);
    }, tick);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `${out}/${kind.toLowerCase()}-${label}.png`,
    });
  }
  checks.push({ kind, motions });
  if (kind === "Broodmass") {
    const summon = await page.evaluate(() => {
      const q = window.__gateRunner,
        s = q.sim,
        e = s.enemies[0];
      s.hazards = [];
      e.motions = [];
      e.prepareUntil = 0;
      e.cooldown = 0;
      s.update({ x: 0 }, false);
      q.advance(0);
      return e.motions[0];
    });
    for (const [label, tick] of [
      ["windup", summon.strike - 14],
      ["release", summon.strike],
    ]) {
      await page.evaluate((t) => {
        const q = window.__gateRunner;
        q.sim.tick = t;
        q.advance(0);
      }, tick);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${out}/broodmass-summon-${label}.png` });
    }
  }
}
await page.evaluate(() => window.__gateRunner.start());
await page.waitForTimeout(300);
await page.evaluate(() => {
  const q = window.__gateRunner,
    s = q.sim;
  s.nextEncounter = s.nextBoss = 1e9;
  s.army = 24;
  q.advance(0);
});
for (const [label, x] of [
  ["right", 3],
  ["left", -3],
]) {
  await page.evaluate((x) => {
    const q = window.__gateRunner;
    for (let i = 0; i < 12; i++) q.sim.update({ x }, false);
    q.advance(0);
  }, x);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/squad-${label}.png` });
}
await page.evaluate(() => window.__gateRunner.dense());
await page.waitForTimeout(300);
await page.evaluate(() => {
  window.__gateRunner.sim.tick = 80;
  window.__gateRunner.advance(0);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/crowd.png` });
const ticks = await page.evaluate(() => window.__gateRunner.sim.tick);
await page.waitForTimeout(100);
assert.equal(await page.evaluate(() => window.__gateRunner.sim.tick), ticks);
fs.writeFileSync(
  `${out}/report.json`,
  JSON.stringify({ checks, errors }, null, 2),
);
console.log(JSON.stringify({ checks: checks.map((c) => c.kind), errors }));
await browser.close();
assert.equal(errors.length, 0);
