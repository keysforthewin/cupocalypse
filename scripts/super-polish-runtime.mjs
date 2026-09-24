import {manualRendering} from "./super-review-render.mjs";
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
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
page.setDefaultTimeout(60000);
const out = `artifacts/super-polish/${process.env.PHASE || "iteration-5-runtime"}`;
fs.mkdirSync(out, { recursive: true });
const rows = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
async function scenario(ids, active) {
  await page.evaluate((ids) => {
    window.__old = window.__gateRunner.sim;
    window.__gateRunner.superScenario(ids);
  }, ids);
  await page.waitForFunction(() => window.__old !== window.__gateRunner.sim);
  if (active)
    await page.evaluate(() => {
      const q = window.__gateRunner;
      for (let i = 0; i < q.sim.supers.slots.length; i++) {
        q.sim.supers.selected = i;
        q.sim.supers.charge = q.sim.supers.quota;
        q.sim.supers.activate();
      }
      q.advance(20);
    });
  await page.waitForFunction(
    (n) => {
      let count = 0;
      window.__sceneReview.scene.traverse((o) => {
        if (o.userData.id) count++;
      });
      return count === n;
    },
    active ? ids.length : 0,
  );
  await page.waitForTimeout(250);
  return page.evaluate(async () => {
    const renderer = window.__sceneReview.scene.__r3f.root.getState();
    renderer.setFrameloop("never");
    let previous = "",
      stable = 0,
      sample;
    for (let frame = 0; frame < 40; frame++) {
      await new Promise((resolve) => setTimeout(() => requestAnimationFrame(resolve), 60));
      renderer.advance(window.__gateRunner.sim.time, true);
      sample = { ...window.__renderInfo, tick: window.__gateRunner.sim.tick };
      const key = JSON.stringify([
        sample.calls,
        sample.triangles,
        sample.geometries,
        sample.textures,
      ]);
      stable = key === previous ? stable + 1 : 0;
      previous = key;
      if (frame >= 3 && stable >= 2) return { ...sample, stableFrames: stable };
    }
    throw Error("Renderer did not reach a stable frozen sample");
  });
}
try {
  for (const reduced of [false, true])
    for (const quality of ["performance", "high"]) {
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      await page.goto(process.env.GAME_URL || "http://localhost:5179");
      await page.evaluate(
        (quality) =>
          localStorage.setItem(
            "gate-runner-profile",
            JSON.stringify({
              quality,
              muted: true,
              currency: 0,
              upgrades: [0, 0, 0],
              records: {},
            }),
          ),
        quality,
      );
      await page.reload();
      await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
      await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
      await manualRendering(page);
      const combinations = [
        ["panda", "machinegunqueen", "sybex"],
        ["kuttula", "hondo", "pokey"],
        ["rae", "shannondoa", "platypus"],
      ];
      // Warm assets and shaders before the measured baseline.
      await scenario(combinations[0], true);
      await scenario(combinations[0], false);
      for (const ids of combinations) {
        const baseline = await scenario(ids, false),
          active = await scenario(ids, true);
        const pose = () =>
          page.evaluate(() => {
            const a = [];
            window.__sceneReview.scene.traverse((o) => {
              if (o.userData.id) o.traverse(child => a.push([o.userData.id, child.type, ...child.matrixWorld.elements]));
            });
            return a;
          });
        await page.screenshot({
          path: `${out}/combo-${quality}-${reduced ? "reduced" : "motion"}-${ids[0]}.png`,
        });
        const before = await pose();
        await page.waitForTimeout(200);
        await page.evaluate(() => window.__sceneReview.scene.__r3f.root.getState().advance(window.__gateRunner.sim.time + .2, true));
        const after = await pose();
        assert.deepEqual(
          after,
          before,
          "Frozen simulation must freeze all weapon transforms",
        );
        assert.ok(
          active.calls - baseline.calls < 200,
          "Bounded concurrent super draw calls",
        );
        const released = await scenario(ids, false);
        await scenario(ids, true);
        const releasedAgain = await scenario(ids, false);
        fs.writeFileSync(`${out}/current-resources.json`,JSON.stringify({quality,reduced,ids,baseline,active,released,releasedAgain,errors},null,2));
        assert.ok(
          releasedAgain.geometries <= released.geometries + 2,
          "Repeated powers release GPU geometries",
        );
        assert.ok(
          releasedAgain.textures <= released.textures + 1,
          "Repeated powers release GPU textures",
        );
        rows.push({
          quality,
          reduced,
          ids,
          baseline,
          active,
          pausedPoseStable: true,
          released,
          releasedAgain,
        });
        fs.writeFileSync(`${out}/checkpoint.json`,JSON.stringify({rows,errors},null,2));
        console.log(JSON.stringify(rows.at(-1)));
      }
    }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/report.json`,
    JSON.stringify(
      {
        note: "Software rendering; checks cover draw-call budgets, runtime/shader errors and frozen model transforms. No hardware FPS claim.",
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
