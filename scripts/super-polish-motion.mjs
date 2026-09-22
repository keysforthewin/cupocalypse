import {manualRendering} from "./super-review-render.mjs";
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const phase = process.env.PHASE || "iteration-5-motion";
const out = `artifacts/super-polish/${phase}`;
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
const page = await browser.newPage({
  viewport: { width: 960, height: 720 },
  recordVideo: { dir: `${out}/video`, size: { width: 640, height: 480 } },
  reducedMotion: process.env.REDUCED ? "reduce" : "no-preference",
});
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const rows = [];
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5179");
  await page.evaluate(
    (quality) =>
      localStorage.setItem(
        "gate-runner-profile",
        JSON.stringify({
          currency: 20000,
          upgrades: [0, 0, 0],
          records: {},
          quality,
          muted: true,
        }),
      ),
    process.env.QUALITY || "performance",
  );
  await page.reload();
  const catalog = await page.evaluate(async () => {
    const { SUPER_IDS, SUPERS } = await import("/src/game/superWeapons.ts");
    return SUPER_IDS.map((id) => ({
      id,
      name: SUPERS[id].name,
      duration: SUPERS[id].duration,
    }));
  });
  const selected = process.env.IDS ? catalog.filter(d => process.env.IDS.split(",").includes(d.id)) : catalog;
  if (!process.env.MODELS_ONLY) {
    await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
    await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
    await page.setViewportSize({width:640,height:480});
    await manualRendering(page);
    await page.addStyleTag({ content: "body * { visibility: hidden !important } canvas { visibility: visible !important }" });
    for (const d of selected.filter(d => !fs.existsSync(`${out}/motion-${d.id}.json`))) {
      await page.evaluate((id) => {
        window.__oldReview = window.__gateRunner.sim;
        window.__gateRunner.superScenario([id]);
      }, d.id);
      await page.waitForFunction(
        () => window.__oldReview !== window.__gateRunner.sim,
      );
      await page.evaluate(() => {
        const q = window.__gateRunner,
          s = q.sim,
          id = s.supers.slot.id;
        if (id === "kismet") {
          s.spawnGate();
          s.gates[0].z = 26;
        }
        if (id === "doc") {
          s.shield = 0;
          s.hitSquad(25, "review");
        }
        if (id === "pokey") s.spawnEnemy("Riot Guard", s.x, 10);
        if (id === "so1ician") {
          const e = s.spawnEnemy("Carrier", 0, 23);
          e.action = "summon";
          e.prepareUntil = 100;
          s.warn(e.id, [1], "pool", 10, 1.5);
        }
        if (id === "platypus")
          s.warn(s.enemies[0].id, [0, 1, 2], "pool", 10, 0.4, 8);
        if (id === "gimmy")
          for (let i = 0; i < 7; i++)
            s.drops.push({
              id: 500 + i,
              kind: "damage",
              x: ((i % 3) - 1) * 3,
              z: 12 + i * 3,
            });
        q.sim.supers.slot.charge = q.sim.supers.slot.quota;
        assertActivation(q.sim.supers.activate());
        if (id === "panda" || id === "pauly")
          s.hitSquad(60, "review", 0, 0, false, s.enemies[0].id);
        q.advance(0);
        function assertActivation(v) {
          if (!v) throw Error("activation failed");
        }
      });
      // Sample anticipation, impact, sustain and release at authoritative simulation ticks.
      await page.waitForFunction((id) => {
        let found = false;
        window.__sceneReview?.scene.traverse((o) => {
          if (o.userData.id === id) found = true;
        });
        return found;
      }, d.id);
      await page.evaluate(() => window.__sceneReview.scene.__r3f.root.getState().setFrameloop("never"));
      const samples = [],
        frames = [],
        startMs = Date.now();
      const end = Math.ceil(d.duration * 60) + 90;
      const screenshotTicks = new Set([
        6,
        18,
        36,
        42,
        66,
        ...Array.from(
          { length: 7 },
          (_, i) => Math.round((d.duration * 60 * (i + 1)) / 8 / 6) * 6,
        ),
        Math.round((d.duration * 60) / 6) * 6,
        Math.round((d.duration * 60) / 6) * 6 + 12,
        end,
      ]);
      for (let tick = 6; tick <= end; tick += 6) {
        const frame = await page.evaluate(async () => {
          window.__gateRunner.advance(6);
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          window.__sceneReview.scene.__r3f.root.getState().advance(window.__gateRunner.sim.time, true);
          const models = [];
          window.__sceneReview.scene.traverse((o) => {
            if (o.userData.id)
              models.push({
                id: o.userData.id,
                matrix: [...o.matrixWorld.elements],
              });
          });
          if (models.some((m) => m.matrix.some((v) => !Number.isFinite(v))))
            throw Error("Non-finite animation transform");
          return {
            tick: window.__gateRunner.sim.tick,
            models,
            render: { ...window.__renderInfo },
          };
        });
        frames.push(frame);
        if (screenshotTicks.has(tick)) {
          samples.push(tick);
          await page.screenshot({
            path: `${out}/motion-${d.id}-${String(tick).padStart(4, "0")}.png`,
          });
        }
      }
      assert.equal(
        frames.at(-1).models.length,
        0,
        `${d.id}: signature removed after release`,
      );
      const row = { id: d.id, samples, startMs, endMs: Date.now(), frames };
      rows.push(row);
      fs.writeFileSync(
        `${out}/motion-${d.id}.json`,
        JSON.stringify(row, null, 2),
      );
      console.log(`${phase}: ${d.id}`);
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ phase, catalog: selected, rows, errors }, null, 2),
  );
} catch (error) {
  fs.writeFileSync(`${out}/failure-${Date.now()}.json`, JSON.stringify({message:String(error), rows:rows.map(r=>r.id),errors},null,2));
  throw error;
} finally {
  await page.close();
  await browser.close();
}
