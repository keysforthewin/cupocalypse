import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "artifacts/arsenal";
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
page.setDefaultTimeout(60000);
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.evaluate(() =>
    localStorage.setItem(
      "gate-runner-profile",
      JSON.stringify({
        currency: 0,
        upgrades: [0, 0, 0],
        records: {},
        muted: false,
        quality: "performance",
        runs: 0,
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
  await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
  const catalog = await page.evaluate(async () => {
    window.__gateRunner.freeze();
    const p = await import("/src/game/projectiles.ts"),
      t = await import("/src/game/types.ts");
    const { Simulation } = await import("/src/game/simulation.ts");
    window.__arsenalReset = () => {
      const q = window.__gateRunner;
      Object.assign(q.sim, new Simulation("REVIEW"));
      q.sim.debug = true;
      q.sim.nextBoss = q.sim.nextEncounter = q.sim.nextSupply = 1e9;
      q.sim.army = 36;
      q.advance(0);
      return q.sim;
    };
    await window.__gateRunner.audio.loading;
    return {
      guns: p.GUNS,
      boosts: t.BOOSTS,
      audio: [...window.__gateRunner.audio.buffers.keys()],
    };
  });
  assert.equal(catalog.audio.filter(name => !name.startsWith("super-")).length, 38);
  const additions = [...catalog.guns.slice(5), ...catalog.boosts.slice(4)];
  for (let i = 0; i < additions.length; i += 4) {
    await page.evaluate(
      (kinds) => {
        const s = window.__arsenalReset();
        s.drops = kinds.map((kind, i) => ({
          id: 100 + i,
          kind,
          x: i % 2 ? 2 : -2,
          z: 9 + Math.floor(i / 2) * 7,
        }));
        window.__gateRunner.advance(0);
      },
      additions.slice(i, i + 4),
    );
    await page.waitForTimeout(350);
    await page.screenshot({
      path: `${out}/symbols-${i / 4 + 1}.png`,
      timeout: 60000,
    });
  }
  for (const kind of process.env.SKIP_WEAPON_CAPTURES ? [] : catalog.guns.slice(5)) {
    await page.evaluate((kind) => {
      const s = window.__arsenalReset();
      s.pickup(kind);
      s.pickup("titan");
      for (let i = 0; i < 45; i++) s.update({ x: 0 }, false);
      window.__gateRunner.advance(0);
    }, kind);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: `${out}/weapon-${kind}.png`,
      timeout: 60000,
    });
  }
  for (let i = 0; i < (process.env.SKIP_WEAPON_CAPTURES ? 0 : catalog.guns.slice(5).length); i += 4) {
    await page.evaluate(
      (kinds) => {
        const s = window.__arsenalReset();
        kinds.forEach((kind, i) => {
          const x = i % 2 ? 2 : -2,
            z = 8 + Math.floor(i / 2) * 8;
          s.launch(kind, x, 0, 10);
          const b = s.bullets.find((b) => b.active && b.kind === kind);
          b.previous = b.z = z;
          const target = s.spawnEnemy("Walker", x, z);
          target.hp = target.maxHp = 1000;
          s.projectileImpact(b, z, true, target);
          b.active = false;
        });
        s.impacts.filter((e) => e.active).forEach((e) => (e.age = 0.15));
        s.fields.forEach((f) => (f.age = 0.3));
        window.__gateRunner.advance(0);
      },
      catalog.guns.slice(5 + i, 9 + i),
    );
    await page.waitForTimeout(200);
    await page.screenshot({
      path: `${out}/impacts-${i / 4 + 1}.png`,
      timeout: 60000,
    });
  }
  await page.evaluate((catalog) => {
    const s = window.__arsenalReset();
    catalog.guns.forEach((k) => s.pickup(k));
    catalog.boosts.forEach((k) => s.pickup(k));
    for (let i = 0; i < 8; i++)
      s.spawnEnemy("Walker", ((i % 3) - 1) * 2, 8 + Math.floor(i / 3) * 3);
    for (let i = 0; i < 65; i++) s.update({ x: 0 }, false);
    window.__gateRunner.advance(0);
  }, catalog);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/combined.png`, timeout: 60000 });
  await page.evaluate(() => {
    const panel = document.querySelector(".active-boosts");
    panel.scrollTop = panel.scrollHeight;
  });
  await page.screenshot({ path: `${out}/hud-modifiers.png`, timeout: 60000 });
  const result = await page.evaluate(async () => {
    const q = window.__gateRunner,
      a = q.audio;
    const buffers = [...a.buffers].map(([name, b]) => {
      const samples = b.getChannelData(0);
      let peak = 0,
        sum = 0;
      for (const v of samples) {
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      return {
        name,
        duration: b.duration,
        peak,
        rms: Math.sqrt(sum / samples.length),
      };
    });
    a.stop();
    a.lastPlayed.clear();
    a.muted = false;
    a.setActive(true);
    for (const name of a.buffers.keys()) a.sample(name, 0, 0.4);
    const voices = a.voices.size;
    a.muted = true;
    const muted = a.voices.size;
    a.muted = false;
    a.lastPlayed.clear();
    a.sample("rail", 0, 0.4);
    a.setActive(false);
    const paused = a.voices.size;
    const panel = document.querySelector(".active-boosts");
    const before = q.sim.tick;
    await new Promise((r) => setTimeout(r, 100));
    return {
      buffers,
      voices,
      muted,
      paused,
      tickStable: before === q.sim.tick,
      hud: {
        height: panel.clientHeight,
        scrollHeight: panel.scrollHeight,
        bottom: panel.getBoundingClientRect().bottom,
        viewport: innerHeight,
      },
      render: window.__renderInfo,
    };
  });
  assert.equal(result.voices, 16);
  assert.equal(result.muted, 0);
  assert.equal(result.paused, 0);
  assert.ok(result.tickStable);
  assert.ok(result.hud.scrollHeight > result.hud.height);
  assert.ok(
    result.hud.bottom < result.hud.viewport,
    "arsenal scroll area must fit the viewport",
  );
  for (const b of result.buffers) {
    assert.ok(b.rms > 0, `silent ${b.name}`);
    assert.ok(b.peak <= 1);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/review.json`,
    JSON.stringify({ catalog, result, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ sounds: result.buffers.length, errors, hud: result.hud }),
  );
} finally {
  await browser.close();
}
