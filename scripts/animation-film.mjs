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
const context = await browser.newContext({
  viewport: { width: 1100, height: 800 },
  recordVideo: {
    dir: "artifacts/animation-video",
    size: { width: 1100, height: 800 },
  },
});
const page = await context.newPage(),
  errors = [],
  chapters = [],
  geometry = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
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
await page.evaluate(() => window.__gateRunner.freeze());
const started = Date.now();
for (const [name, phase, summon, frames] of [
  ["Squad", 1, false, 40],
  ["Bulwark", 1, false, 33],
  ["Bulwark", 2, false, 33],
  ["Broodmass", 1, false, 33],
  ["Broodmass", 2, true, 33],
  ["Congregation", 1, false, 55],
  ["Congregation", 2, false, 70],
  ["Crowd", 1, false, 40],
]) {
  await page.evaluate((name) => {
    const q = window.__gateRunner;
    if (name === "Squad") q.start("Mirror");
    else if (name === "Crowd") q.dense();
    else q.scenario(name);
  }, name);
  await page.waitForFunction(() => window.__sceneReview);
  await page.waitForTimeout(400);
  await page.evaluate(
    ({ name, phase, summon }) => {
      const q = window.__gateRunner,
        s = q.sim,
        c = window.__sceneReview.camera;
      s.fireClock = 1e9;
      s.nextBoss = s.nextEncounter = 1e9;
      s.shield = 1e6;
      if (s.boss) {
        s.boss.hp = s.boss.maxHp = 1e6;
        s.boss.cooldown = 1;
        s.boss.phase = phase;
        s.boss.attacks = summon ? 1 : 0;
        c.position.set(7, 6, -9);
        c.lookAt(0, 2, -22);
      } else if (name === "Squad") {
        s.army = 14;
        c.position.set(0, 4, 8);
        c.lookAt(0, 0.5, 1);
      } else {
        c.position.set(8, 9, 3);
        c.lookAt(0, 1, -15);
      }
      c.updateProjectionMatrix();
      q.advance(0);
    },
    { name, phase, summon },
  );
  chapters.push({
    name,
    phase,
    summon,
    wallSeconds: (Date.now() - started) / 1000,
  });
  for (let i = 0; i < frames; i++) {
    await page.evaluate(
      async ({ i, name }) => {
        const q = window.__gateRunner,
          s = q.sim;
        for (let k = 0; k < 6; k++)
          s.update({ x: name === "Squad" ? (i % 40 < 20 ? 3 : -3) : 0 }, false);
        q.advance(0);
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      },
      { i, name },
    );
    if (name === "Bulwark") {
      const sample = await page.evaluate(() => {
        const { sim: s } = window.__gateRunner,
          e = s.boss,
          m = e?.motions.find((m) => Math.abs(s.tick - m.strike) < 6);
        if (!e || !m) return null;
        const root = window.__sceneReview.scene.getObjectByName(
          `animated-${e.kind}-${e.id}`,
        );
        if (!root) return null;
        return {
          tick: s.tick,
          strike: m.strike,
          wrists: ["handL", "handR"].map((name) => {
            const b = root.getObjectByName(name);
            return b.localToWorld(b.position.clone().set(0, 0.27, 0)).toArray();
          }),
        };
      });
      if (sample) geometry.push(sample);
    }
  }
  console.log(name, phase, summon ? "summon" : "attack", "recorded");
}
const video = page.video();
await context.close();
await video.saveAs("artifacts/animation-pass.webm");
await browser.close();
fs.writeFileSync(
  "artifacts/animation-film.json",
  JSON.stringify(
    {
      chapters,
      geometry,
      errors,
      note: "Fixed six-tick steps per captured frame; software WebGL. Synthetic boss health retains full attack cycles. Mirror squad exercises opposite sidesteps.",
    },
    null,
    2,
  ),
);
assert.equal(errors.length, 0);
