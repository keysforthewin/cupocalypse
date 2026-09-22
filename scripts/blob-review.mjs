import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "artifacts/blob-crowd";
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  states = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
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
  await page.waitForFunction(() =>
    window.__sceneReview?.scene.getObjectByName("army-count-anchor"),
  );
  for (const [name, count, target, ticks] of [
    ["small-rounded", 100, 0, 0],
    ["rounded-center", 600, 0, 0],
    ["tip-leads-left", 600, -3.8, 20],
    ["compressed-left", 600, -3.8, 150],
    ["tip-leads-right", null, 3.8, 32],
    ["compressed-right", 600, 3.8, 150],
  ]) {
    states.push(
      await page.evaluate(
        ({ name, count, target, ticks }) => {
          const s = window.__gateRunner.sim;
          s.nextBoss = s.nextEncounter = 1e9;
          s.fireClock = 1e9;
          if (count) s.army = count;
          for (let i = 0; i < ticks; i++) s.update({ x: target }, false);
          window.__gateRunner.advance(0);
          return {
            name,
            army: s.army,
            x: s.x,
            rear: s.crowdX,
            front: s.crowd.front,
            back: s.crowd.back,
            losses: s.edgeLosses,
          };
        },
        { name, count, target, ticks },
      ),
    );
    console.log(states.at(-1));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 60000 });
  }
  assert.ok(states[2].x < states[2].rear - 0.5);
  assert.ok(states[3].front < states[1].front - 0.5);
  assert.ok(states[3].losses > 0 && states[3].army > 450);
  assert.ok(states[5].x > 3.7);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/review.json`,
    JSON.stringify({ states, errors }, null, 2),
  );
} finally {
  await browser.close();
}
