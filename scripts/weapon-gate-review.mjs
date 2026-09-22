import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";

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
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.waitForFunction(() => window.__gateRunner);
  await page.evaluate(() => {
    window.__gateRunner.freeze();
    window.__gateRunner.start();
  });
  await page.waitForFunction(() => window.__gateRunner.sim.seed === "QA-SEED");
  await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    s.nextBoss = s.nextEncounter = 1e9;
    s.x = -3;
    s.spawnGate();
    Object.assign(s.gates[0], { z: 15, left: "+", a: 10, right: "−", b: 10 });
    window.__gateRunner.advance(0);
  });
  await page.waitForFunction(
    () => document.querySelector(".gate-number strong")?.textContent === "+10",
  );
  const firstHit = await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    for (let i = 0; i < 60 && !s.gates[0].hitsA; i++) s.update({ x: -3 });
    return s.gates[0].a;
  });
  assert.equal(firstHit, 11);
  await page.waitForFunction(
    () => document.querySelector(".gate-number strong")?.textContent === "+11",
  );
  const combined = await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    for (const kind of ["spread", "damage", "rate", "hero"]) {
      s.drops.push({ id: s.id++, x: -3, z: 0.2, kind });
      s.update({ x: -3 });
    }
    s.bullets.forEach((b) => {
      b.active = false;
    });
    s.fireClock = 0;
    s.update({ x: -3 });
    const volley = s.bullets.filter((b) => b.active);
    window.__gateRunner.advance(0);
    return {
      count: volley.length,
      damage: volley.map((b) => b.damage),
      boosts: s.boosts,
    };
  });
  assert.equal(combined.count, 3);
  assert.deepEqual(combined.boosts, { spread: 1, damage: 1, rate: 1, hero: 1 });
  assert.ok(combined.damage.every((damage) => damage > 6));
  await page.waitForFunction(() =>
    document
      .querySelector(".weapon-combination")
      ?.textContent.includes("3 SHOTS · 2.40× DAMAGE"),
  );
  const increments = [];
  for (let i = 0; i < 5; i++) {
    const value = await page.evaluate(() => {
      const s = window.__gateRunner.sim;
      const before = s.gates[0].a;
      for (let tick = 0; tick < 40 && s.gates[0].a === before; tick++)
        s.update({ x: -3 });
      return s.gates[0].a;
    });
    increments.push(value);
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".gate-number strong")?.textContent ===
        `+${expected}`,
      value,
    );
  }
  for (let i = 1; i < increments.length; i++)
    assert.equal(increments[i] - increments[i - 1], 9);
  fs.mkdirSync("artifacts/weapon-gate", { recursive: true });
  await page.screenshot({ path: "artifacts/weapon-gate/combined.png" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ firstHit, combined, increments, errors }));
} finally {
  await browser.close();
}
