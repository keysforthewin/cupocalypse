import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "artifacts/projectiles";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.evaluate(
    (quality) =>
      localStorage.setItem(
        "gate-runner-profile",
        JSON.stringify({
          currency: 0,
          upgrades: [0, 0, 0],
          records: {},
          muted: false,
          quality,
          runs: 0,
        }),
      ),
    process.env.QUALITY || "high",
  );
  await page.reload();
  await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
  await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
  await page.evaluate(() => window.__gateRunner.freeze());
  await page.evaluate(async () => {
    const audio = window.__gateRunner.audio;
    await audio.loading;
    window.__audioReview = audio;
  });
  const audio = await page.evaluate(() => ({
    loaded: [...window.__audioReview.buffers.keys()],
    durations: Object.fromEntries(
      [...window.__audioReview.buffers.entries()].map(([k, v]) => [
        k,
        v.duration,
      ]),
    ),
  }));
  assert.equal(audio.loaded.filter(name => !name.startsWith("super-")).length, 38);
  const kinds = ["seeker", "helix", "scatter", "cursor", "mortar"];
  for (const kind of process.env.SKIP_CAPTURES || process.env.ARSENAL_ONLY ? [] : kinds) {
    await page.evaluate((kind) => {
      const s = window.__gateRunner.sim;
      s.nextBoss = s.nextEncounter = 1e9;
      s.army = 48;
      s.x = s.crowdX = 0;
      s.enemies = [];
      s.gates = [];
      s.drops = [];
      s.bullets.forEach((b) => (b.active = false));
      s.effects.forEach((e) => (e.active = false));
      s.impacts.forEach((e) => (e.active = false));
      for (const k in s.guns) {
        s.guns[k] = 0;
        s.gunClocks[k] = 0;
      }
      s.pickup(kind);
      s.fireClock = 0;
      for (let i = 0; i < 8; i++)
        s.spawnEnemy(
          i % 2 ? "Riot Guard" : "Walker",
          i % 2 ? 2.5 : -2.5,
          19 + Math.floor(i / 2) * 4,
        );
      for (let i = 0; i < 48; i++) s.update({ x: 0, aim: 3 }, false);
      window.__gateRunner.advance(0);
    }, kind);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/${kind}.png`, timeout: 60000 });
  }
  await page.evaluate((kinds) => {
    const s = window.__gateRunner.sim;
    s.enemies = [];
    s.gates = [];
    s.drops = [];
    s.bullets.forEach((b) => (b.active = false));
    s.effects.forEach((e) => (e.active = false));
    s.impacts.forEach((e) => (e.active = false));
    for (const k of kinds) {
      s.guns[k] = 1;
      s.gunClocks[k] = 0;
    }
    s.army = 100;
    for (let i = 0; i < 18; i++)
      s.spawnEnemy(
        i % 3 ? "Riot Guard" : "Bloater",
        ((i % 3) - 1) * 2.8,
        30 + Math.floor(i / 3) * 2.8,
      );
    for (let i = 0; i < 78; i++)
      s.update({ x: 0, aim: Math.sin(i / 20) * 3 }, false);
    window.__gateRunner.advance(0);
  }, kinds);
  await page.waitForTimeout(500);
  if (!process.env.SKIP_CAPTURES)
    await page.screenshot({ path: `${out}/arsenal.png`, timeout: 60000 });
  // Isolated readable impact frame for every payload.
  await page.evaluate((kinds) => {
    const s = window.__gateRunner.sim;
    s.effects.forEach((e) => (e.active = false));
    s.impacts.forEach((e) => (e.active = false));
    for (let i = 0; i < kinds.length; i++) {
      const b = {
        ...s.bullets[0],
        kind: kinds[i],
        serial: 10000 + i,
        seed: 10000 + i,
      };
      b.x = b.previousX = ((i % 3) - 1) * 2.9;
      b.z = b.previous = 8 + Math.floor(i / 3) * 6;
      s.projectileImpact(b, b.z, false);
    }
    s.impacts
      .filter((e) => e.active)
      .forEach((e, i) => (e.age = 0.12 + i * 0.025));
  }, kinds);
  await page.waitForTimeout(250);
  if (!process.env.SKIP_CAPTURES)
    await page.screenshot({ path: `${out}/impacts.png`, timeout: 60000 });
  // Actual canvas pointer input controls aim without dragging the squad.
  await page.mouse.move(940, 560);
  await page.evaluate(() => window.__gateRunner.freeze(false));
  await page.waitForFunction(() => window.__gateRunner.sim.aim > 0.5);
  await page.evaluate(() => window.__gateRunner.freeze());
  const right = await page.evaluate(() => ({
    aim: window.__gateRunner.sim.aim,
    x: window.__gateRunner.sim.x,
  }));
  await page.mouse.move(660, 560);
  await page.evaluate(() => window.__gateRunner.freeze(false));
  await page.waitForFunction(() => window.__gateRunner.sim.aim < -0.5);
  await page.evaluate(() => window.__gateRunner.freeze());
  const left = await page.evaluate(() => ({
    aim: window.__gateRunner.sim.aim,
    x: window.__gateRunner.sim.x,
  }));
  assert.ok(Math.abs(left.x - right.x) < 0.2);
  const runtime = await page.evaluate(() => {
    const a = window.__audioReview;
    a.muted = false;
    a.setActive(true);
    a.stop();
    const names = [...a.buffers.keys()];
    for (let i = 0; i < 32; i++)
      (a.lastPlayed.clear(), a.sample(names[i % names.length], 0, 0.4));
    const peakVoices = a.voices.size;
    const audibleKinds = [...new Set(a.voiceNames.values())];
    a.muted = true;
    return {
      peakVoices,
      audibleKinds,
      mutedVoices: a.voices.size,
      muted: a.muted,
      render: window.__renderInfo,
      activeProjectiles: window.__gateRunner.sim.bullets.filter((b) => b.active)
        .length,
    };
  });
  assert.equal(runtime.peakVoices, 16);
  assert.equal(runtime.audibleKinds.length, 16);
  assert.equal(runtime.mutedVoices, 0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "RESUME OPERATION" }).waitFor();
  const tick = await page.evaluate(() => window.__gateRunner.sim.tick);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__gateRunner.sim.tick), tick);
  assert.equal(await page.evaluate(() => window.__audioReview.active), false);
  fs.writeFileSync(
    `${out}/review.json`,
    JSON.stringify({ errors, audio, right, left, runtime }, null, 2),
  );
  console.log(JSON.stringify({ errors, audio, right, left, runtime }));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
