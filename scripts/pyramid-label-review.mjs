import { chromium } from "playwright";
import assert from "node:assert/strict";
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.waitForFunction(() => window.__gateRunner);
  await page.evaluate(() => {
    window.__gateRunner.freeze();
    window.__gateRunner.start();
  });
  await page.waitForFunction(() =>
    window.__sceneReview?.scene.getObjectByName("army-count-anchor"),
  );
  await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    s.army = 600;
    s.x = s.crowdX = -3;
    window.__gateRunner.advance(0);
  });
  await page.waitForFunction(
    () =>
      document.querySelector(".army-label")?.getBoundingClientRect().top > 800,
  );
  const result = await page.evaluate(() => ({
    anchor: window.__sceneReview.scene
      .getObjectByName("army-count-anchor")
      .position.toArray(),
    labelTop: document.querySelector(".army-label").getBoundingClientRect().top,
  }));
  assert.equal(result.anchor[0], -2.94);
  assert.ok(result.anchor[2] > 4);
  await page.screenshot({
    path: "artifacts/effects-pyramid/steered-pyramid.png",
    timeout: 60000,
  });
  fs.writeFileSync(
    "artifacts/effects-pyramid/label-review.json",
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(JSON.stringify({ result, errors }));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
