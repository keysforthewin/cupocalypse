import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(60000);
const rows = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  for (const quality of ["performance", "high"]) {
    await page.goto(process.env.GAME_URL || "http://localhost:5173");
    await page.evaluate(
      (quality) =>
        localStorage.setItem(
          "gate-runner-profile",
          JSON.stringify({
            currency: 0,
            upgrades: [0, 0, 0],
            records: {},
            quality,
            muted: true,
          }),
        ),
      quality,
    );
    await page.reload();
    await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
    await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
    for (const active of [false, true]) {
      await page.evaluate(() => {
        window.__previousPerfSim = window.__gateRunner.sim;
        window.__gateRunner.superScenario([
          "panda",
          "machinegunqueen",
          "sybex",
        ]);
      });
      await page.waitForFunction(
        () => window.__gateRunner.sim !== window.__previousPerfSim,
      );
      if (active)
        await page.evaluate(() => {
          const q = window.__gateRunner;
          for (let i = 0; i < 3; i++) {
            q.sim.supers.selected = i;
            q.sim.supers.slot.charge = q.sim.supers.slot.quota;
            q.sim.supers.activate();
          }
          q.advance(20);
        });
      await page.waitForTimeout(200);
      const sample = await page.evaluate(async () => {
        const times = [];
        let last = performance.now();
        for (let i = 0; i < 40; i++)
          await new Promise((resolve) =>
            requestAnimationFrame((t) => {
              if (i > 4) times.push(t - last);
              last = t;
              resolve();
            }),
          );
        times.sort((a, b) => a - b);
        return {
          p50Ms: times[Math.floor(times.length * 0.5)],
          p95Ms: times[Math.floor(times.length * 0.95)],
          render: window.__renderInfo,
          frames: times.length,
          casts: window.__gateRunner.sim.supers.casts.map((c) => c.id),
          tick: window.__gateRunner.sim.tick,
          sceneSuperModels: (() => {
            let n = 0;
            window.__sceneReview.scene.traverse((o) => {
              if (o.userData.id) n++;
            });
            return n;
          })(),
        };
      });
      assert.equal(sample.casts.length, active ? 3 : 0);
      assert.equal(sample.sceneSuperModels, active ? 3 : 0);
      await page.screenshot({
        path: `artifacts/supers/performance-${quality}-${active ? "combined" : "baseline"}.png`,
      });
      rows.push({ quality, active, ...sample });
      console.log(JSON.stringify(rows.at(-1)));
    }
  }
  for (const quality of ["performance", "high"]) {
    const base = rows.find((r) => r.quality === quality && !r.active),
      active = rows.find((r) => r.quality === quality && r.active);
    assert.ok(
      active.render.calls - base.render.calls < 200,
      "super effects should have a bounded draw-call budget",
    );
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "artifacts/supers/performance.json",
    JSON.stringify(
      {
        environment:
          "Headless Chromium / SwiftShader software rendering; timings are comparative, not a hardware FPS promise. Identical frozen 18-enemy / 80-soldier scenes; three concurrent effects.",
        rows,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
