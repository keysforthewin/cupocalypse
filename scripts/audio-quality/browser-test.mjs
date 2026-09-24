import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { OUTPUT, hash, writeJSON } from "./core.mjs";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:5174");
  await page.waitForSelector("audio");
  const review = await page.evaluate(async () => {
    const data = await fetch("/api/review").then((r) => r.json());
    const ctx = new AudioContext();
    const decoded = [];
    for (const item of data.items) {
      const response = await fetch(item.url);
      const b = await ctx.decodeAudioData(await response.arrayBuffer());
      decoded.push({ id: item.id, duration: b.duration });
    }
    const response = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: data.items[0].id,
        reviewer: "Automated test",
        notes: "This must not be accepted",
        evidenceHash: "stale",
        rubric: data.rubric.version,
        scores: {},
      }),
    });
    await ctx.close();
    return { decoded, staleStatus: response.status };
  });
  assert.equal(review.staleStatus, 400);
  assert.ok(review.decoded.length >= 31);
  assert.ok(review.decoded.every((d) => d.duration > 0.1));
  await page
    .locator("audio")
    .first()
    .evaluate((a) => a.play());
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "Stop all", exact: true }).click();
  assert.equal(
    await page
      .locator("audio")
      .first()
      .evaluate((a) => a.paused),
    true,
  );
  await page.screenshot({ path: `${OUTPUT}/audition.png`, fullPage: false });
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  const runtime = await page.evaluate(async () => {
    const { AudioEngine } = await import("/src/game/audio.ts");
    const { Simulation } = await import("/src/game/simulation.ts");
    const a = new AudioEngine();
    a.init();
    await a.loading;
    const variantCounts = Object.fromEntries(
      [...a.sampleVariants]
        .filter(([, bank]) => bank.length > 1)
        .map(([name, bank]) => [name, bank.length]),
    );
    const before = a.ctx.currentTime;
    a.sample("pulse", 0, 0.2);
    a.sample("super-mortal", 0, 0.4);
    a.sample("boss-grave-marshal-attack", -2, 0.4);
    a.tone(400, 0.2, 0.03);
    a.roar();
    const voices = a.voices.size;
    a.muted = true;
    const muted = a.voices.size;
    a.muted = false;
    await a.previewSuper("mortal");
    const preview = a.voices.size;
    a.setActive(false);
    const paused = a.voices.size;
    a.setActive(true);
    const sim = new Simulation(
      "browser-audio",
      "Classic",
      [0, 0, 0],
      ["mortal"],
    );
    sim.supers.charge = sim.supers.quota;
    a.updateSuperReady(sim);
    const ready = !!a.superReadySource;
    a.muted = true;
    const readyStopped = !a.superReadySource;
    a.muted = false;
    a.cues = {
      "test-missing": {
        variants: ["/missing-audio-test.wav"],
        bus: "ui",
        gain: 1,
        priority: 5,
        cooldown: 0.1,
        maxVoices: 1,
      },
    };
    await a.loadSamples();
    const missing = a.sample("test-missing", 0, 0.1);
    const result = {
      loaded: a.buffers.size,
      variantCounts,
      voices,
      muted,
      preview,
      paused,
      ready,
      readyStopped,
      missing,
      elapsed: a.ctx.currentTime - before,
    };
    a.stop();
    await a.ctx.close();
    return result;
  });
  assert.ok(runtime.loaded >= 95);
  for (const cue of [
    "pulse",
    "seeker",
    "impact",
    "creature-roar",
    "boss-grave-marshal-attack",
    "super-mortal",
    "ui-ready",
    "ambience-city",
  ])
    assert.equal(
      runtime.variantCounts[cue],
      3,
      `${cue} must load all three accepted takes`,
    );
  assert.ok(runtime.voices >= 5);
  assert.equal(runtime.muted, 0);
  assert.equal(runtime.paused, 0);
  assert.equal(runtime.preview, 1);
  assert.equal(runtime.ready, true);
  assert.equal(runtime.readyStopped, true);
  assert.equal(runtime.missing, false);
  assert.deepEqual(errors, []);
  writeJSON(`${OUTPUT}/browser-validation.json`, {
    passed: true,
    sourceHash: hash(fs.readFileSync("src/game/audio.ts")),
    review,
    runtime,
    errors,
  });
  console.log(
    `Browser checks passed: ${review.decoded.length} audition files, runtime lifecycle, preview, missing asset, and stale-score rejection.`,
  );
} finally {
  await browser.close();
}
