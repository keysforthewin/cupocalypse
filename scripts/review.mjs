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
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(r.status() + " " + r.url());
});
await page.goto("http://game:5173");
await page.waitForFunction(() => !!window.__gateRunner);
await page.evaluate(() => window.__gateRunner.freeze());
const names = [
  "Walker",
  "Runner",
  "Crawler",
  "Riot Guard",
  "Charger",
  "Spitter",
  "Bloater",
  "Screamer",
  "Carrier",
  "Gunner",
  "Bulwark",
  "Broodmass",
  "Congregation",
];
for (const name of names) {
  await page.evaluate((name) => window.__gateRunner.scenario(name), name);
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: `artifacts/review-${name.toLowerCase().replaceAll(" ", "-")}.png`,
    timeout: 60000,
  });
  if (names.indexOf(name) >= 10) {
    await page.evaluate(() => {
      const s = window.__gateRunner.sim,
        e = s.boss;
      s.damageEnemy(e, e.armor + e.hp * 0.55);
      s.update({ x: 3 });
      e.cooldown = 0;
      s.update({ x: 3 });
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `artifacts/phase2-${name.toLowerCase()}.png`,
      timeout: 60000,
    });
  }
}
await page.evaluate(() => window.__gateRunner.dense());
await page.waitForTimeout(1500);
await page.screenshot({ path: "artifacts/dense-combat.png", timeout: 60000 });
const renderer = await page.evaluate(() => {
  const gl = document.querySelector("canvas").getContext("webgl2"),
    e = gl.getExtension("WEBGL_debug_renderer_info");
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "unknown";
});
fs.writeFileSync(
  "artifacts/roster-review.json",
  JSON.stringify({ names, errors, renderer }, null, 2),
);
console.log(JSON.stringify({ errors, renderer, reviewed: names.length }));
await browser.close();
if (errors.length) process.exitCode = 1;
