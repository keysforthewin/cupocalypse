import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const designs = JSON.parse(fs.readFileSync("assets/bosses/designs.json"));
const out = process.env.BOSS_REVIEW_OUT || "artifacts/boss-review";
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
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(
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
  process.env.BOSS_RENDER_QUALITY || "performance",
);
await page.goto(process.env.GAME_URL || "http://localhost:5173");
await page.waitForFunction(() => window.__gateRunner);
await page.evaluate(() => window.__gateRunner.freeze());
const reports = [];
for (const d of designs) {
  if (process.env.BOSS_ONLY && !process.env.BOSS_ONLY.split(",").includes(d.id))
    continue;
  await page.evaluate((name) => window.__gateRunner.scenario(name), d.name);
  await page.waitForFunction(
    (name) => window.__gateRunner.sim.enemies[0]?.kind === name,
    d.name,
  );
  await page.evaluate(() => {
    const q = window.__gateRunner,
      s = q.sim,
      e = s.enemies[0];
    s.tick = 180;
    e.age = 3;
    e.cooldown = 0;
    s.fireClock = 1e9;
    e.hp = e.maxHp = 1e6;
    s.army = 60;
    s.shield = 1e6;
    q.advance(1);
  });
  await page.waitForFunction(
    (id) =>
      window.__sceneReview?.scene.getObjectByName(
        `boss-${id}-${window.__gateRunner.sim.enemies[0].id}`,
      ),
    d.id,
    { timeout: 60000 },
  );
  await page.waitForTimeout(1000);
  const data = await page.evaluate((id) => {
    const s = window.__gateRunner.sim;
    const model = window.__sceneReview.scene.getObjectByName(
      `boss-${id}-${s.enemies[0].id}`,
    );
    const cores = [];
    let triangles = 0;
    model.traverse((o) => {
      if (o.name.includes("living-core"))
        cores.push({ name: o.name, visible: o.visible });
      if (o.isMesh)
        triangles +=
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    });
    return {
      modelTriangles: triangles,
      cores,
      motions: s.enemies[0].motions,
      hazards: s.hazards,
      render: window.__renderInfo,
    };
  }, d.id);
  assert.ok(
    data.cores.length && data.cores.every((c) => !c.visible),
    `${d.id}: phase-one aperture visible`,
  );
  await page.screenshot({ timeout: 120000, path: `${out}/${d.id}-arena.png` });
  const m = data.motions[0];
  if (m && !process.env.BOSS_STILL_ONLY)
    for (const [label, tick] of [
      ["windup", (m.release ?? m.strike) - 14],
      ["impact", m.release ?? m.strike],
      ["recovery", m.strike + 40],
    ]) {
      await page.evaluate((t) => {
        window.__gateRunner.sim.tick = t;
        window.__gateRunner.advance(0);
      }, tick);
      await page.waitForTimeout(120);
      await page.screenshot({
        timeout: 120000,
        path: `${out}/${d.id}-${label}.png`,
      });
    }
  reports.push({ id: d.id, ...data });
  console.log(d.id, "captured");
}
const prior = fs.existsSync(`${out}/report.json`)
  ? JSON.parse(fs.readFileSync(`${out}/report.json`))
  : { reports: [] };
fs.writeFileSync(
  `${out}/report.json`,
  JSON.stringify(
    {
      reports: [
        ...prior.reports.filter((r) => !reports.some((n) => n.id === r.id)),
        ...reports,
      ],
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
