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
  scenarios = [];
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
  await page.waitForFunction(() => window.__gateRunner.sim.seed === "QA-SEED");
  for (const [name, distance, level] of [
    ["opening", 0, 0],
    ["powered-encounter", 500, 3],
  ]) {
    scenarios.push(
      await page.evaluate(
        ({ name, distance, level }) => {
          const s = window.__gateRunner.sim;
          s.distance = distance;
          s.army = level ? 300 : 24;
          s.crowdX = s.x = 0;
          s.enemies = [];
          s.gates = [];
          s.drops = [];
          s.boosts = { damage: level, rate: level, spread: level, hero: level };
          s.introduced = level ? 10 : 1;
          s.generate();
          s.enemies.forEach((e) => (e.z -= 12));
          s.gates = [];
          window.__gateRunner.advance(0);
          return {
            name,
            count: s.enemies.length,
            pressure: s.encounterScale,
            enemies: s.enemies.map((e) => ({
              kind: e.kind,
              hp: e.hp,
              armor: e.armor,
              x: e.x,
            })),
          };
        },
        { name, distance, level },
      ),
    );
    await page.waitForFunction(
      () => {
        if (!window.__sceneReview) return false;
        let count = 0;
        window.__sceneReview.scene.traverse((o) => {
          if (o.name.startsWith("animated-")) count++;
        });
        return count === window.__gateRunner.sim.enemies.length;
      },
      {},
      { timeout: 60000 },
    );
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 60000 });
  }
  assert.ok(scenarios[1].count > scenarios[0].count);
  assert.ok(scenarios[1].enemies.some((e) => e.armor > 0));
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/escalation-review.json`,
    JSON.stringify({ scenarios, errors }, null, 2),
  );
  console.log(JSON.stringify({ scenarios, errors }));
} finally {
  await browser.close();
}
