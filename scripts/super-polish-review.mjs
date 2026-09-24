import {manualRendering, renderReview} from "./super-review-render.mjs";
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const phase = process.env.PHASE || "iteration-1";
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
  viewport: { width: 1440, height: 1000 },
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
  await page.getByRole("button", { name: /SUPER LOADOUT/ }).click();
  const selected = process.env.IDS
    ? catalog.filter((d) => process.env.IDS.split(",").includes(d.id))
    : catalog;
  for (const d of process.env.EFFECTS_ONLY ? [] : selected) {
    await page
      .locator(".super-card")
      .filter({
        has: page.locator("strong", { hasText: new RegExp(`^${d.name}$`) }),
      })
      .click();
    await page.waitForTimeout(220);
    await page
      .locator(".super-preview")
      .screenshot({ path: `${out}/model-${d.id}.png` });
    await page
      .locator(".super-card.inspected")
      .screenshot({ path: `${out}/icon-${d.id}.png` });
  }
  if (!process.env.MODELS_ONLY) {
    await page
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
    await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
    await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
    await manualRendering(page);
    for (const d of selected) {
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
        q.sim.supers.charge = q.sim.supers.quota;
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
      const samples = [
        6,
        Math.min(
          Math.floor(d.duration * 60) - 2,
          d.id === "mortal" ? 39 : d.id === "five10" ? 38 : 68,
        ),
        Math.floor(d.duration * 60 * 0.65),
        Math.ceil(d.duration * 60) + 8,
      ].sort((a, b) => a - b);
      let previous = 0;
      for (const [i, tick] of samples.entries()) {
        await page.evaluate(
          (n) => window.__gateRunner.advance(n),
          tick - previous,
        );
        previous = tick;
        await renderReview(page);
        await page.screenshot({ path: `${out}/effect-${d.id}-${i}.png` });
      }
      rows.push({
        id: d.id,
        samples,
        render: await page.evaluate(() => window.__renderInfo),
      });
      fs.writeFileSync(`${out}/report-${d.id}.json`, JSON.stringify({phase, definition:d, row:rows.at(-1), errors}, null, 2));
      console.log(`${phase}: ${d.id}`);
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ phase, catalog: selected, rows, errors }, null, 2),
  );
} catch (error) {
  fs.writeFileSync(`${out}/failure-${Date.now()}.json`, JSON.stringify({message:String(error), rows, errors},null,2));
  throw error;
} finally {
  await browser.close();
}
