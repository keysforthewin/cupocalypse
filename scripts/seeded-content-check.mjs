import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

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
  const snapshots = [];
  mkdirSync("artifacts/seeded-content", { recursive: true });
  for (const [index, seed] of [
    "content-a",
    "content-b",
    "content-a",
  ].entries()) {
    await page.reload();
    await page.getByLabel("SEED", { exact: true }).fill(seed);
    await page.getByRole("button", { name: /DEPLOY SQUAD/ }).click();
    await page.waitForFunction((seed) => {
      const runner = window.__gateRunner;
      if (runner?.sim.seed !== seed || runner.sim.tick < 1) return false;
      runner.freeze();
      return true;
    }, seed);
    const snapshot = await page.evaluate(() => {
      const s = window.__gateRunner.sim;
      if (s.tick >= 120) throw Error("Missed the opening capture window");
      while (s.tick < 300 && !s.over) s.update({ x: 0 });
      return {
        tick: s.tick,
        enemies: s.enemies.map(({ kind, x, z }) => ({ kind, x, z })),
        gates: s.gates.map(({ left, right, a, b, wall, z }) => ({
          left,
          right,
          a,
          b,
          wall,
          z,
        })),
        drops: s.drops.map(({ kind, x, z }) => ({ kind, x, z })),
        nextEncounter: s.nextEncounter,
        nextSupply: s.nextSupply,
      };
    });
    assert.ok(snapshot.enemies.length > 0);
    assert.ok(snapshot.drops.length > 0);
    snapshots.push(snapshot);
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `artifacts/seeded-content/${index}-${seed}.png`,
    });
    console.log(
      `${seed}: ${snapshot.enemies.map((e) => e.kind).join(", ")} / ${snapshot.drops.map((d) => d.kind).join(", ")}`,
    );
  }
  assert.notDeepEqual(snapshots[0].enemies, snapshots[1].enemies);
  assert.notDeepEqual(snapshots[0].drops, snapshots[1].drops);
  assert.notDeepEqual(snapshots[0].gates, snapshots[1].gates);
  assert.deepEqual(snapshots[0], snapshots[2]);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: browser deployments use seeded enemies, gates and pickups; repeating a seed recreates the same content; no browser errors",
  );
} finally {
  await browser.close();
}
