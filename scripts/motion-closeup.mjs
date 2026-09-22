import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "artifacts/motion-closeup";
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
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://localhost:5173");
await page.evaluate(() =>
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
await page.reload();
await page.waitForFunction(() => window.__gateRunner);
await page.evaluate(() => {
  window.__gateRunner.freeze();
  window.__gateRunner.start();
});
await page.waitForFunction(() => window.__sceneReview);
await page.waitForTimeout(500);
await page.addStyleTag({
  content:
    ".hud-left,.hud-right,.topbar,.bottom-hud,.boss-hud,.army-label,.enemy-label,.lane-warning,.controls-hint{visibility:hidden!important}",
});
await page.evaluate(() => {
  const q = window.__gateRunner,
    s = q.sim;
  s.army = 7;
  s.nextBoss = s.nextEncounter = 1e9;
  const c = window.__sceneReview.camera;
  c.position.set(3, 2.5, 5);
  c.lookAt(0, 0.55, 0.7);
  c.updateProjectionMatrix();
  q.advance(0);
});
for (const [label, x] of process.env.BOSSES_ONLY
  ? []
  : [
      ["right", 3],
      ["left", -3],
    ]) {
  for (let frame = 0; frame < 8; frame++) {
    await page.evaluate((x) => {
      const q = window.__gateRunner,
        s = q.sim;
      for (let i = 0; i < 4; i++) s.update({ x }, false);
      const c = window.__sceneReview.camera;
      c.position.set(s.x + 3, 2.5, 5);
      c.lookAt(s.x, 0.55, 0.7);
      q.advance(0);
    }, x);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/squad-${label}-${frame}.png` });
  }
}
// Inspect both phases and every strike in the Congregation chain.
for (const kind of process.env.SQUAD_ONLY
  ? []
  : ["Bulwark", "Broodmass", "Congregation"]) {
  await page.evaluate((kind) => window.__gateRunner.scenario(kind), kind);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const q = window.__gateRunner,
      s = q.sim,
      e = s.enemies[0];
    e.phase = 2;
    e.cooldown = 0;
    s.fireClock = 1e9;
    s.update({ x: 0 }, false);
    const c = window.__sceneReview.camera;
    c.position.set(8, 7, -10);
    c.lookAt(0, 2, -22);
    c.updateProjectionMatrix();
    q.advance(0);
  });
  await page.waitForTimeout(300);
  const motions = await page.evaluate(
    () => window.__gateRunner.sim.enemies[0].motions,
  );
  for (const [i, m] of motions.entries())
    for (const [label, tick] of [
      ["windup", m.strike - 14],
      ["impact", m.strike],
      ["recover", m.strike + 35],
    ]) {
      await page.evaluate((tick) => {
        window.__gateRunner.sim.tick = tick;
        window.__gateRunner.advance(0);
      }, tick);
      await page.waitForTimeout(80);
      await page.screenshot({ path: `${out}/${kind}-${i}-${label}.png` });
    }
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify({ errors }, null, 2));
console.log({ errors });
await browser.close();
assert.equal(errors.length, 0);
