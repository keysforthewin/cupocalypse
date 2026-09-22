import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const reports = [],
  errors = [];
try {
  for (const quality of ["performance", "high"]) {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    });
    page.setDefaultTimeout(60000);
    page.on("pageerror", (e) => errors.push(e.message));
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
    await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
    await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
    await page.evaluate(() => window.__gateRunner.freeze());
    for (const level of [1, 50]) {
      await page.evaluate(async (level) => {
        const { Simulation } = await import("/src/game/simulation.ts");
        const { GUNS } = await import("/src/game/projectiles.ts");
        const { BOOSTS } = await import("/src/game/types.ts");
        const s = window.__gateRunner.sim;
        Object.assign(s, new Simulation("PERFORMANCE", "Mirror", [5, 5, 5]));
        s.debug = true;
        s.army = 600;
        s.nextBoss = s.nextEncounter = s.nextSupply = 1e9;
        for (let i = 0; i < level; i++) {
          GUNS.forEach((k) => s.pickup(k));
          BOOSTS.forEach((k) => s.pickup(k));
        }
        for (let i = 0; i < 150; i++) s.update({ x: 0 }, false);
        window.__gateRunner.advance(0);
      }, level);
      const report = await page.evaluate(
        async ({ quality, level }) => {
          const frame = () => new Promise((r) => requestAnimationFrame(r));
          for (let i = 0; i < 4; i++) await frame();
          let previous = await frame();
          const times = [],
            simulationTimes = [];
          for (let i = 0; i < 32; i++) {
            const start = performance.now();
            window.__gateRunner.sim.update({ x: 0 }, false);
            simulationTimes.push(performance.now() - start);
            const now = await frame();
            times.push(now - previous);
            previous = now;
          }
          times.sort((a, b) => a - b);
          simulationTimes.sort((a, b) => a - b);
          const gl = document.querySelector("canvas").getContext("webgl2"),
            ext = gl.getExtension("WEBGL_debug_renderer_info");
          const s = window.__gateRunner.sim;
          return {
            quality,
            level,
            hardware: ext
              ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
              : "unknown",
            frames: times.length,
            p50: times[16],
            p95: times[30],
            simulationP95: simulationTimes[30],
            active: s.bullets.filter((b) => b.active).length,
            pending: s.pendingShots.length,
            droppedShots: s.droppedShots,
            droppedSchedules: s.droppedSchedules,
            render: window.__renderInfo,
          };
        },
        { quality, level },
      );
      reports.push(report);
      console.log(JSON.stringify(report));
    }
    await page.close();
  }
  fs.writeFileSync(
    "artifacts/arsenal/performance.json",
    JSON.stringify(
      {
        reports,
        errors,
        note: "32 measured frames per scenario after warmup, 1600x1000, development build; SwiftShader software rendering is not hardware FPS acceptance.",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
