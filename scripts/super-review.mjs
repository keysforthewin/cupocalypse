import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "artifacts/supers";
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: out, size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const checks = {};
async function scenario(ids) {
  await page.evaluate((ids) => {
    window.__previousSuperReview = window.__gateRunner.sim;
    window.__gateRunner.superScenario(ids);
  }, ids);
  await page.waitForFunction(
    (ids) =>
      window.__gateRunner.sim !== window.__previousSuperReview &&
      window.__gateRunner.sim.supers.loadout.join(",") === ids.join(","),
    ids,
  );
}
async function rendered(ids) {
  await page.waitForFunction((ids) => {
    const models = [];
    window.__sceneReview?.scene.traverse((o) => {
      if (typeof o.userData.id === "string") models.push(o.userData.id);
    });
    return ids.every((id) => models.includes(id));
  }, ids);
}
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.evaluate(() =>
    localStorage.setItem(
      "gate-runner-profile",
      JSON.stringify({
        currency: 5000,
        upgrades: [0, 0, 0],
        records: {},
        runs: 0,
        quality: "performance",
        muted: false,
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: /SUPER LOADOUT/ }).click();
  await page.waitForTimeout(800);
  assert.equal(await page.locator(".super-card").count(), 27);
  for (const [i, name] of ["Mortal", "Doc", "Nitro"].entries()) {
    await page
      .locator(".super-card")
      .filter({
        has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }),
      })
      .click();
    await page.getByRole("button", { name: /^UNLOCK/ }).click();
    await page
      .getByRole("button", {
        name: `Select loadout slot ${i + 1}`,
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: /^EQUIP IN SLOT/ }).click();
  }
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gate-runner-profile")),
  );
  assert.deepEqual(saved.superLoadout, ["mortal", "doc", "nitro"]);
  assert.equal(saved.currency, 3900);
  checks.purchases = true;
  await page.screenshot({ path: `${out}/armory-1440.png` });
  await page
    .getByRole("button", { name: "Move Nitro earlier", exact: true })
    .click();
  assert.deepEqual(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gate-runner-profile")).superLoadout,
    ),
    ["mortal", "nitro", "doc"],
  );
  await page
    .getByRole("button", { name: "Move Nitro later", exact: true })
    .click();
  checks.reorder = true;
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
  await page.waitForFunction(() => window.__gateRunner?.sim.tick > 3);
  await page.evaluate(() => {
    window.__gateRunner.freeze();
    window.__gateRunner.sim.debug = true;
  });
  await page.screenshot({ path: `${out}/hud-empty.png` });
  await page.keyboard.press("h");
  assert.equal(await page.locator(".help-content").count(), 0);
  assert.ok(await page.getByRole("button", { name: /SHOW HELP/ }).isVisible());
  await page.keyboard.press("h");
  assert.equal(await page.locator(".help-content").count(), 1);
  checks.help = true;
  await page.evaluate(() => window.__gateRunner.freeze(false));
  await page.keyboard.press("e");
  await page.waitForFunction(
    () => window.__gateRunner.sim.supers.selected === 1,
  );
  await page.keyboard.down("e");
  await page.waitForTimeout(200);
  await page.waitForFunction(
    () => window.__gateRunner.sim.supers.selected === 2,
  );
  await page.keyboard.up("e");
  await page.keyboard.press("e");
  await page.waitForFunction(
    () => window.__gateRunner.sim.supers.selected === 0,
  );
  await page.keyboard.press("q");
  await page.waitForFunction(
    () => window.__gateRunner.sim.supers.selected === 2,
  );
  checks.switching = true;
  await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    s.supers.charge = s.supers.quota;
  });
  await page.keyboard.press("Space");
  await page.waitForFunction(() =>
    window.__gateRunner.sim.supers.active("nitro"),
  );
  await page.keyboard.press("q");
  await page.waitForFunction(
    () => window.__gateRunner.sim.supers.selected === 1,
  );
  await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    s.supers.charge = s.supers.quota;
  });
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => window.__gateRunner.sim.supers.casts.length === 2,
  );
  checks.combinations = true;
  await page.keyboard.press("p");
  await page.waitForTimeout(100);
  const paused = await page.evaluate(() => window.__gateRunner.sim.tick);
  await page.keyboard.press("e");
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__gateRunner.sim.tick), paused);
  checks.pause = true;
  await page.getByRole("button", { name: "ARMORY", exact: true }).click();
  await page
    .getByRole("button", { name: "Unequip Mortal", exact: true })
    .click();
  assert.deepEqual(
    await page.evaluate(() => window.__gateRunner.sim.supers.loadout),
    ["doc", "nitro"],
  );
  await page.getByRole("button", { name: /^EQUIP IN SLOT/ }).click();
  assert.deepEqual(
    await page.evaluate(() => window.__gateRunner.sim.supers.loadout),
    ["mortal", "nitro"],
  );
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page
    .getByRole("button", { name: "RETURN TO BASE", exact: true })
    .click();
  checks.liveLoadout = true;
  await scenario(["mortal", "doc", "nitro"]);
  for (const [label, charge] of [
    ["00", 0],
    ["25", 13],
    ["50", 25],
    ["75", 38],
    ["90", 45],
    ["ready", 50],
  ]) {
    await page.evaluate((n) => {
      const q = window.__gateRunner;
      q.sim.supers.charge = n;
      q.advance(0);
    }, charge);
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${out}/charge-${label}.png` });
  }
  const catalog = await page.evaluate(async () => {
    const { SUPER_IDS, SUPERS } = await import("/src/game/superWeapons.ts");
    return SUPER_IDS.map((id) => ({ id, name: SUPERS[id].name }));
  });
  for (const { id } of catalog) {
    await scenario([id]);
    await page.evaluate(() => {
      const q = window.__gateRunner,
        s = q.sim;
      s.supers.charge = s.supers.quota;
      if (!s.supers.activate()) throw Error("Review activation failed");
      q.advance(0);
    });
    const sample =
      id === "mortal"
        ? 29
        : id === "five10"
          ? 40
          : id === "bronze-leopard"
            ? 14
            : id === "tuna"
              ? 60
              : 35;
    await page.evaluate((n) => window.__gateRunner.advance(n), sample);
    await rendered([id]);
    assert.equal(
      await page.evaluate(
        (id) => window.__gateRunner.sim.supers.active(id)?.id,
        id,
      ),
      id,
    );
    await page.screenshot({ path: `${out}/weapon-${id}.png` });
  }
  const layout = [];
  for (const quality of ["performance", "high"])
    for (const width of [900, 1280, 1920]) {
      await page.setViewportSize({ width, height: width === 900 ? 720 : 1000 });
      await page.evaluate(
        ({ quality }) => {
          const p = JSON.parse(localStorage.getItem("gate-runner-profile"));
          p.quality = quality;
          p.superLoadout = ["panda", "rae", "sybex"];
          p.ownedSuperWeapons = ["panda", "rae", "sybex"];
          localStorage.setItem("gate-runner-profile", JSON.stringify(p));
        },
        { quality },
      );
      await page.reload();
      await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
      await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
      await scenario(["panda", "rae", "sybex"]);
      await page.evaluate(() => {
        const q = window.__gateRunner;
        for (let i = 0; i < 3; i++) {
          q.sim.supers.selected = i;
          q.sim.supers.charge = q.sim.supers.quota;
          q.sim.supers.activate();
        }
        q.advance(20);
      });
      await rendered(["panda", "rae", "sybex"]);
      const measurement = await page.evaluate(() => {
        const hud = document
            .querySelector(".super-hud")
            .getBoundingClientRect(),
          help = document
            .querySelector(".controls-help")
            .getBoundingClientRect();
        return {
          hud: { left: hud.left, right: hud.right, bottom: hud.bottom },
          help: { left: help.left, right: help.right },
          overflow: document.documentElement.scrollWidth > innerWidth,
          render: window.__renderInfo,
        };
      });
      assert.equal(measurement.overflow, false);
      assert.ok(measurement.hud.left >= 0 && measurement.hud.right <= width);
      assert.ok(measurement.hud.right < measurement.help.left);
      layout.push({ width, quality, ...measurement });
      await page.screenshot({
        path: `${out}/combined-${quality}-${width}.png`,
      });
    }
  const audio = await page.evaluate(async () => {
    const a = window.__gateRunner.audio;
    await a.loading;
    const sounds = [...a.buffers]
      .filter(([name]) => name.startsWith("super-"))
      .map(([name, b]) => ({ name, duration: b.duration }));
    a.setActive(true);
    a.muted = false;
    a.lastPlayed.clear();
    a.sample("super-mortal", 0, 0.5);
    const audible = a.voices.size;
    a.muted = true;
    const muted = a.voices.size;
    a.muted = false;
    a.setActive(true);
    a.lastPlayed.clear();
    a.sample("super-tuna", 0, 0.5);
    a.setActive(false);
    return { sounds, audible, muted, paused: a.voices.size };
  });
  assert.equal(audio.sounds.length, 27);
  assert.ok(audio.audible > 0);
  assert.equal(audio.muted, 0);
  assert.equal(audio.paused, 0);
  checks.audio = true;
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/browser-report.json`,
    JSON.stringify({ checks, layout, audio, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, captures: catalog.length, errors }));
} finally {
  const video = page.video();
  await context.close();
  if (video)
    fs.renameSync(await video.path(), `${out}/super-weapons-review.webm`);
  await browser.close();
}
