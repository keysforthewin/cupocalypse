import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const reports = [];
for (const quality of ["high", "performance"]) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.evaluate(
    (q) =>
      localStorage.setItem(
        "gate-runner-profile",
        JSON.stringify({
          currency: 0,
          upgrades: [0, 0, 0],
          records: {},
          muted: true,
          quality: q,
          runs: 0,
        }),
      ),
    quality,
  );
  await page.reload();
  await page.waitForFunction(() => !!window.__gateRunner);
  await page.evaluate(() => {
    const qa = window.__gateRunner;
    qa.freeze();
    qa.dense();
  });
  await page.waitForTimeout(3000);
  const report = await page.evaluate(async (quality) => {
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(resolve));
    for (let i = 0; i < 15; i++) await frame();
    const times = [];
    let previous = await frame();
    for (let i = 0; i < 120; i++) {
      window.__gateRunner.advance(1);
      const now = await frame();
      times.push(now - previous);
      previous = now;
    }
    times.sort((a, b) => a - b);
    const gl = document.querySelector("canvas").getContext("webgl2"),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      quality,
      hardware: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown",
      resolution: [1920, 1080],
      sampleCount: times.length,
      p50: times[60],
      p95: times[114],
      p99: times[118],
      render: window.__renderInfo,
    };
  }, quality);
  reports.push(report);
  console.log(JSON.stringify(report));
  await page.close();
}
fs.writeFileSync(
  "artifacts/animation-performance.json",
  JSON.stringify(
    {
      reports,
      note: "120 measured requestAnimationFrame intervals per quality setting after 15 warmup frames, animated dense scene initialized with 35 enemies and 72 rendered soldiers, advanced one simulation tick per frame. Software Vulkan/SwiftShader; not an RTX 3060 acceptance measurement.",
    },
    null,
    2,
  ),
);
await browser.close();
