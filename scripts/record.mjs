import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: "artifacts/video-raw",
    size: { width: 1440, height: 900 },
  },
});
const page = await context.newPage();
const errors = [],
  chapters = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://game:5173");
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
await page.waitForFunction(() => !!window.__gateRunner);
await page.evaluate(() => window.__gateRunner.freeze());
const started = Date.now();
for (const name of ["Bulwark", "Broodmass", "Congregation", "Dense"]) {
  await page.evaluate((name) => {
    if (name === "Dense") window.__gateRunner.dense();
    else window.__gateRunner.scenario(name);
  }, name);
  await page.locator(".army-label").waitFor({ timeout: 60000 });
  await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    if (s.boss) {
      s.boss.hp = s.boss.maxHp = 5000;
      s.boss.cooldown = 30;
    }
  });
  chapters.push({ name, wallSeconds: (Date.now() - started) / 1000 });
  for (let i = 0; i < 80; i++) {
    await page.evaluate(async (i) => {
      const qa = window.__gateRunner;
      if (i === 40 && qa.sim.boss) {
        const b = qa.sim.boss;
        qa.sim.damageEnemy(b, b.armor + b.hp * 0.55);
        b.cooldown = qa.sim.tick;
      }
      qa.advance(6);
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    }, i);
  }
  console.log(name, "recorded with DOM warnings and HUD");
}
const video = page.video();
await context.close();
await video.saveAs("artifacts/combat-full-ui.webm");
await browser.close();
fs.writeFileSync(
  "artifacts/recording-metadata.json",
  JSON.stringify(
    {
      chapters,
      errors,
      note: "1440x900 full-page recording includes HTML numbers, HUD and telegraphs. Deterministic 6-tick steps; synthetic 5000 HP boss scenarios keep both phases visible. Performance graphics preset on software WebGL.",
    },
    null,
    2,
  ),
);
