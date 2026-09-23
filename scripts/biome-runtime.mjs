import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
import { sourceHash } from "./biome-evidence.mjs";
const initialHash = sourceHash();
const output = process.argv[2] || "artifacts/biomes/final";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.connectOverCDP(
  process.env.CDP || "http://127.0.0.1:9222",
);
const reports = [],
  errors = [];
for (const quality of ["high", "performance"]) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  page.setDefaultTimeout(120000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173");
  await page.evaluate(
    (quality) =>
      localStorage.setItem(
        "gate-runner-profile",
        JSON.stringify({
          quality,
          muted: true,
          upgrades: [0, 0, 0],
          records: {},
          currency: 0,
          runs: 0,
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
  const data = await page.evaluate(async () => {
    const frame = () => new Promise(requestAnimationFrame),
      ids = ["city", "suburb", "country", "forest", "ash"],
      rounds = [];
    for (let round = 0; round < 3; round++)
      for (const biome of ids) {
        window.__biomeReview = { biome, seed: "BIOME-A" };
        for (let i = 0; i < 4; i++) await frame();
        const samples = [];
        if (round === 2) {
          let before = await frame();
          for (let i = 0; i < 60; i++) {
            const now = await frame();
            samples.push(now - before);
            before = now;
          }
          samples.sort((a, b) => a - b);
        }
        rounds.push({
          round,
          biome,
          ...window.__renderInfo,
          frameP50: samples[30],
          frameP95: samples[57],
        });
      }
    const pairs = [];
    for (const from of ids)
      for (const to of ids)
        if (from !== to) {
          window.__biomeReview = { from, to, progress: 0, seed: "BIOME-A" };
          for (let i = 0; i <= 40; i++) {
            window.__biomeReview.progress = i / 40;
            await frame();
            if (window.__biomeStatus.chunks !== 15)
              throw Error("Unbounded sections");
          }
          pairs.push({ from, to, complete: true });
        }
    window.__biomeReview = { biome: "forest", seed: "BIOME-A" };
    for (let i = 0; i < 4; i++) await frame();
    const snapshot = () => {
      const poses = [];
      window.__sceneReview.scene.traverse((o) => {
        if (o.name.startsWith("biome-section-"))
          poses.push([o.name, ...o.position.toArray()]);
        if (o.isPoints && o.material.uniforms?.time)
          poses.push(["particle-time", o.material.uniforms.time.value]);
      });
      return JSON.stringify(poses);
    };
    const tick = window.__gateRunner.sim.tick,
      pose = snapshot();
    for (let i = 0; i < 5; i++) await frame();
    const frozen = tick === window.__gateRunner.sim.tick && pose === snapshot();
    window.__biomeReview = undefined;
    const s = window.__gateRunner.sim;
    s.army = 180;
    s.shield = 100000;
    s.nextBoss = s.nextEncounter = s.nextSupply = 1e9;
    for (let i = 0; i < 18; i++)
      s.spawnEnemy(
        i % 4 === 0 ? "Riot Guard" : "Walker",
        ((i % 3) - 1) * 3,
        15 + Math.floor(i / 3) * 3,
      );
    const gl = document.querySelector("canvas").getContext("webgl2"),
      ext = gl.getExtension("WEBGL_debug_renderer_info"),
      hardware = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
    const frames = [];
    for (const biome of ids) {
      window.__biomeReview = { biome, seed: "BIOME-A" };
      // Exclude only the artificial review jump and first shader compilation.
      // Every sampled interval still includes four normal section recycles.
      for (let i = 0; i < 90; i++) {
        s.update({ x: 0 }, false);
        await frame();
      }
      const times = [],
        slowFrames = [];
      let previous = await frame();
      for (let i = 0; i < 600; i++) {
        s.update({ x: 0 }, false);
        const now = await frame();
        times.push(now - previous);
        if (now - previous > 50)
          slowFrames.push({ frame: i, ms: now - previous });
        previous = now;
      }
      times.sort((a, b) => a - b);
      frames.push({
        biome,
        samples: times.length,
        p50: times[300],
        p95: times[570],
        p99: times[594],
        max: times.at(-1),
        slowFrames,
      });
    }
    return { rounds, pairs, frozen, frames, hardware };
  });
  for (const biome of ["city", "suburb", "country", "forest", "ash"]) {
    const a = data.rounds.find((r) => r.round === 1 && r.biome === biome),
      b = data.rounds.find((r) => r.round === 2 && r.biome === biome);
    assert.equal(
      a.geometries,
      b.geometries,
      `${quality}/${biome} geometry leak`,
    );
    assert.equal(a.textures, b.textures, `${quality}/${biome} texture leak`);
  }
  assert.ok(data.frozen);
  for (const sample of data.frames) {
    if (sample.p95 > 34 || sample.p99 > 51 || sample.max > 100)
      errors.push(
        `${quality}/${sample.biome}: live frame budget exceeded (${sample.p95.toFixed(1)} ms p95, ${sample.p99.toFixed(1)} ms p99, ${sample.max.toFixed(1)} ms max)`,
      );
  }
  reports.push({ quality, ...data });
  await page.close();
}
if (sourceHash() !== initialHash)
  errors.push("Source changed during runtime review");
const result = {
  passed: errors.length === 0,
  sourceHash: initialHash,
  reports,
  errors,
};
fs.writeFileSync(`${output}/runtime.json`, JSON.stringify(result, null, 2));
if (fs.existsSync(`${output}/report.json`)) {
  const report = JSON.parse(fs.readFileSync(`${output}/report.json`));
  report.runtime = result;
  fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({
    passed: result.passed,
    frames: reports.map((r) => ({ quality: r.quality, samples: r.frames })),
  }),
);
process.exit(errors.length ? 1 : 0);
