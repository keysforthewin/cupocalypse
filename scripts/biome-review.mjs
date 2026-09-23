import { chromium } from "playwright";
import fs from "node:fs";
import { sourceHash } from "./biome-evidence.mjs";
const output = process.env.OUTPUT || "artifacts/biomes/iteration-1";
fs.mkdirSync(output, { recursive: true });
const ids = ["city", "suburb", "country", "forest", "ash"];
const browser = process.env.CDP
  ? await chromium.connectOverCDP(process.env.CDP)
  : await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
const report = {
  errors: [],
  captures: [],
  sourceHash: sourceHash(),
};
try {
  for (const quality of process.env.FULL ? ["high", "performance"] : ["high"]) {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    });
    page.setDefaultTimeout(120000);
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
    });
    await page.goto(process.env.GAME_URL || "http://localhost:5173");
    await page.evaluate(
      (q) =>
        localStorage.setItem(
          "gate-runner-profile",
          JSON.stringify({
            quality: q,
            muted: true,
            upgrades: [0, 0, 0],
            runs: 0,
            records: {},
            currency: 0,
          }),
        ),
      quality,
    );
    await page.reload();
    await page.waitForFunction(() => window.__gateRunner);
    await page.evaluate(() => {
      window.__gateRunner.freeze();
      window.__gateRunner.start();
    });
    await page.waitForFunction(() => window.__biomeStatus);
    await page.evaluate(() => {
      const s = window.__gateRunner.sim;
      s.army = 120;
      s.spawnGate();
      s.gates[0].z = 19;
      for (let i = 0; i < 6; i++)
        s.spawnEnemy(
          i % 3 === 0 ? "Riot Guard" : "Walker",
          ((i % 3) - 1) * 3,
          24 + Math.floor(i / 3) * 5,
        );
      window.__gateRunner.advance(0);
    });
    for (const seed of process.env.FULL
      ? ["BIOME-A", "BIOME-B", "BIOME-C"]
      : ["BIOME-A"])
      for (const biome of ids) {
        await page.evaluate(
          ({ biome, seed }) => {
            window.__biomeReview = { biome, seed };
          },
          { biome, seed },
        );
        await page.waitForFunction(
          (b) => window.__biomeStatus?.from === b,
          biome,
        );
        await page.evaluate(async () => {
          for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
        });
        const file = `${biome}-${seed}-${quality}.png`;
        await page.screenshot({ path: `${output}/${file}` });
        const metrics = await page.evaluate(() => ({
          render: window.__renderInfo,
          status: window.__biomeStatus,
        }));
        report.captures.push({ biome, seed, quality, file, ...metrics });
        if (seed === "BIOME-A" && quality === "high") {
          await page.evaluate(() => {
            const c = window.__sceneReview.camera;
            c.position.set(15, 9, 17);
            c.lookAt(9, 3, -5);
            c.updateProjectionMatrix();
          });
          await page.evaluate(async () => {
            for (let i = 0; i < 3; i++)
              await new Promise(requestAnimationFrame);
          });
          await page.screenshot({ path: `${output}/closeup-${biome}.png` });
          await page.evaluate(() => {
            const c = window.__sceneReview.camera;
            c.position.set(0, 16, 18);
            c.lookAt(0, 0, -8);
            c.updateProjectionMatrix();
          });
        }
      }
    if (process.env.FULL)
      for (const from of ids)
        for (const to of ids)
          if (from !== to)
            for (const progress of [0, 0.5, 1]) {
              await page.evaluate((args) => (window.__biomeReview = args), {
                from,
                to,
                progress,
                seed: "BIOME-A",
              });
              await page.evaluate(async () => {
                for (let i = 0; i < 3; i++)
                  await new Promise(requestAnimationFrame);
              });
              const file = `transition-${from}-${to}-${progress}-${quality}.png`;
              await page.screenshot({ path: `${output}/${file}` });
              report.captures.push({ from, to, progress, quality, file });
            }
    await page.close();
  }
} finally {
  if (!process.env.CDP) await browser.close();
  if (sourceHash() !== report.sourceHash)
    report.errors.push("Source changed during captures; evidence is stale");
  fs.cpSync("assets/biomes/renders", `${output}/models`, { recursive: true });
  fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({ captures: report.captures.length, errors: report.errors }),
);
if (report.errors.length) process.exitCode = 1;

if (process.env.CDP) process.exit(process.exitCode || 0);
