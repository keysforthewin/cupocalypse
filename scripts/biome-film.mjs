import { chromium } from "playwright";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { sourceHash } from "./biome-evidence.mjs";
const output = process.argv[2] || "artifacts/biomes/final",
  frames = `${output}/film-frames`;
fs.mkdirSync(frames, { recursive: true });
const initial = sourceHash(),
  browser = await chromium.connectOverCDP(
    process.env.CDP || "http://127.0.0.1:9222",
  );
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://localhost:5173");
  await page.evaluate(() =>
    localStorage.setItem(
      "gate-runner-profile",
      JSON.stringify({
        quality: "high",
        muted: true,
        upgrades: [0, 0, 0],
        records: {},
        currency: 0,
        runs: 0,
      }),
    ),
  );
  await page.reload();
  await page.waitForFunction(() => window.__gateRunner);
  await page.evaluate(() => {
    window.__gateRunner.freeze();
    window.__gateRunner.start();
  });
  await page.waitForFunction(() => window.__biomeStatus);
  const ids = ["city", "suburb", "country", "forest", "ash", "city"];
  let index = 0;
  for (let pair = 0; pair < 5; pair++)
    for (let frame = 0; frame <= 100; frame++) {
      await page.evaluate(
        (args) => {
          if (!window.__biomeStatus)
            throw Error("Review scene was reloaded during capture");
          window.__biomeReview = args;
          const s = window.__gateRunner.sim;
          s.tick = Math.round((60 + 20 * args.progress) * 60);
          s.distance = (60 + 20 * args.progress) * 3.2;
        },
        {
          from: ids[pair],
          to: ids[pair + 1],
          progress: frame / 100,
          seed: "BIOME-A",
        },
      );
      await page.evaluate(async () => {
        await Promise.race([
          (async () => {
            for (let i = 0; i < 2; i++)
              await new Promise(requestAnimationFrame);
          })(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(Error("No browser frames for 10 seconds")),
              10000,
            ),
          ),
        ]);
      });
      await page.screenshot({
        path: `${frames}/${String(index++).padStart(4, "0")}.jpg`,
        type: "jpeg",
        quality: 85,
        timeout: 15000,
      });
      if (frame === 100)
        console.log(`Recorded ${ids[pair]} to ${ids[pair + 1]}`);
    }
  if (initial !== sourceHash())
    throw Error("Source changed during film capture");
  if (errors.length) throw Error(errors.join("\n"));
  const encode = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      "5",
      "-i",
      `${frames}/%04d.jpg`,
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "30",
      `${output}/transitions.webm`,
    ],
    { encoding: "utf8" },
  );
  if (encode.status !== 0) throw Error(encode.stderr);
  fs.writeFileSync(
    `${output}/film.json`,
    JSON.stringify(
      {
        sourceHash: initial,
        frames: index,
        fps: 5,
        note: "Deterministic 20-second transition timelines sampled at 5 fps; not a realtime performance recording.",
      },
      null,
      2,
    ),
  );
  console.log("Saved transition film", index, "frames");
} finally {
  await page.close();
}
process.exit(0);
