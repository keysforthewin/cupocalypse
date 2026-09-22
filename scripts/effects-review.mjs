import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const quality = process.env.QUALITY || "performance";
const out = quality === "high" ? "artifacts/effects-pyramid/high" : "artifacts/effects-pyramid";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") { errors.push(m.text()); console.log(m.text()); } });
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.evaluate(quality => localStorage.setItem("gate-runner-profile", JSON.stringify({currency:0,upgrades:[0,0,0],records:{},muted:true,quality,runs:0})), quality);
  await page.reload();
  await page.waitForFunction(() => window.__gateRunner);
  await page.evaluate(() => { window.__gateRunner.freeze(); window.__gateRunner.start(); });
  await page.waitForFunction(() => window.__gateRunner.sim.seed === "QA-SEED");
  await page.waitForFunction(() => window.__sceneReview?.scene.getObjectByName("death-effects"));
  for (const count of (quality === "high" ? [100, 600] : [24, 100, 600, 1600])) {
    console.log("Capturing formation",count);
    await page.evaluate(count => {
      const s = window.__gateRunner.sim;
      s.army = count; s.x = 0; s.nextBoss = s.nextEncounter = 1e9;
      window.__gateRunner.advance(0);
    }, count);
    await page.waitForTimeout(600);
    await page.screenshot({ timeout: 60000, path: `${out}/pyramid-${count}.png` });
  }
  const styles = ["collapse", "tumble", "shred", "rupture", "acid", "armor"];
  await page.evaluate(styles => {
    const s = window.__gateRunner.sim;
    s.army = 100;
    s.effects.forEach(e => e.active = false);
    for (let i = 0; i < styles.length; i++) {
      const x = (i % 3 - 1) * 3, z = 6 + Math.floor(i / 3) * 6;
      s.effect(x, z, "corpse", 1.2, { style: styles[i], energy: 1.5 });
      s.effect(x, z, "blast", 1.2, { style: styles[i], energy: 1.5 });
    }
    window.__gateRunner.advance(0);
  }, styles);
  for (const age of [0.08, 0.3, 0.65, 1.4]) {
    await page.evaluate(age => { window.__gateRunner.sim.effects.forEach(e => { if (e.active) e.age = age; }); }, age);
    await page.waitForTimeout(400);
    await page.screenshot({ timeout: 60000, path: `${out}/deaths-${age}.png` });
  }
  const behavior = await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    s.effects.forEach(e => e.active = false);
    s.army = 2400; s.x = -3; s.shield = 50;
    for (let i = 0; i < 600; i++) s.update({x:-3}, false);
    window.__gateRunner.advance(0);
    return { army: s.army, edgeLosses: s.edgeLosses, shield: s.shield, render: window.__renderInfo };
  });
  assert.ok(behavior.army < 2400 && behavior.edgeLosses > 0);
  assert.equal(behavior.shield, 50);
  await page.screenshot({ timeout: 60000, path: `${out}/attrition-left.png` });
  fs.writeFileSync(`${out}/review.json`, JSON.stringify({ quality, errors, behavior }, null, 2));
  console.log(JSON.stringify({ errors, behavior }));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
