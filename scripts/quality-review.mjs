import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const quality = process.env.QUALITY || "high";
const output =
  quality === "high" ? "artifacts/quality" : "artifacts/quality/performance";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => (errors.push(e.message), console.error(e.message)));
page.on("console", (m) => {
  if (m.type() === "error") (errors.push(m.text()), console.error(m.text()));
});
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
await page.goto(process.env.GAME_URL || "http://localhost:5173");
await page.evaluate(
  (quality) =>
    localStorage.setItem(
      "gate-runner-profile",
      JSON.stringify({
        currency: 0,
        upgrades: [0, 0, 0],
        records: {},
        muted: true,
        quality,
        runs: 0,
      }),
    ),
  quality,
);
await page.reload();
await page.waitForFunction(() => window.__gateRunner);
await page.evaluate(() => {
  window.__gateRunner.freeze();
  window.__gateRunner.start();
});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${output}/street.png` });
await page.evaluate(() => {
  const q = window.__gateRunner,
    s = q.sim;
  s.nextBoss = s.nextEncounter = 9999;
  s.enemies = [];
  s.gates = [];
  s.drops = ["damage", "rate", "spread", "hero", "shield", "recruit"].map(
    (kind, i) => ({
      id: 900 + i,
      kind,
      x: ((i % 3) - 1) * 3,
      z: i < 3 ? 7 : 18,
    }),
  );
  q.advance(0);
});
await page.waitForTimeout(1000);
await page.screenshot({ path: `${output}/pickups.png` });
await page.evaluate(() => {
  const q = window.__gateRunner,
    s = q.sim;
  s.tick += 60;
  q.advance(0);
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/pickups-rotated.png` });
await page.evaluate(() => {
  const q = window.__gateRunner,
    s = q.sim;
  for (const k of ["damage", "rate", "spread", "hero"])
    for (let i = 0; i < 3; i++) s.pickup(k);
  s.drops = [];
  q.advance(120);
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/upgraded.png` });
const state = await page.evaluate(() => ({
  levels: window.__gateRunner.sim.boosts,
  render: window.__renderInfo,
  hud: document.querySelector(".active-boosts").textContent,
}));
assert.deepEqual(state.levels, { damage: 3, rate: 3, spread: 3, hero: 3 });
assert.ok(state.hud.includes("LV 3 · ∞"));
await page.evaluate(() => {
  const q = window.__gateRunner,
    s = q.sim;
  s.x = 0;
  s.drops = [{ id: 999, kind: "spread", x: 0, z: 0.2 }];
  s.update({ x: 0 });
  q.advance(0);
});
assert.equal(
  await page.evaluate(() => window.__gateRunner.sim.boosts.spread),
  4,
);
assert.equal(
  await page.evaluate(() => window.__gateRunner.sim.drops.length),
  0,
);
// Capture both sides of a recycle boundary. Moving 0.02m must not create an on-road shadow.
for (const distance of [27.996, 28.004, 35.996, 36.004]) {
  await page.evaluate((distance) => {
    const q = window.__gateRunner,
      s = q.sim;
    s.distance = distance;
    s.tick = 0;
    s.rewardUntil = 0;
    s.lastReward = "";
    s.bullets.forEach((b) => (b.active = false));
    q.advance(0);
  }, distance);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${output}/seam-${distance}.png` });
}
await page.evaluate(() => {
  const q = window.__gateRunner,
    s = q.sim;
  s.spawnGate();
  Object.assign(s.gates[0], {
    z: 8,
    wall: 0,
    left: "+",
    a: 20,
    right: "×",
    b: 1.2,
    revealed: true,
  });
  s.spawnEnemy("Riot Guard", -2, 18);
  s.spawnEnemy("Charger", 1, 22);
  s.spawnEnemy("Runner", 3, 16);
  q.advance(0);
});
await page.waitForFunction(
  () =>
    document.querySelector(".gate-number") &&
    document.querySelector(".enemy-label"),
);
await page.evaluate(async () => {
  for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
});
await page.screenshot({ path: `${output}/combat.png` });
assert.equal(await page.locator(".renderer-error").count(), 0);
const performance = await page.evaluate(async () => {
  const times = [];
  let then = await new Promise(requestAnimationFrame);
  for (let i = 0; i < 45; i++) {
    const now = await new Promise(requestAnimationFrame);
    times.push(now - then);
    then = now;
  }
  times.sort((a, b) => a - b);
  const gl = document.querySelector("canvas").getContext("webgl2"),
    ext = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown",
    p50: times[22],
    p95: times[42],
    ...window.__renderInfo,
  };
});
fs.writeFileSync(
  `${output}/review.json`,
  JSON.stringify({ quality, errors, state, performance }, null, 2),
);
console.log(JSON.stringify({ quality, errors, state, performance }));
await browser.close();
if (errors.length) process.exitCode = 1;
