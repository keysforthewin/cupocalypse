import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.setDefaultTimeout(120000);
const errors = [];
const expectedErrors = [];
let injectingMissingAsset = false;
page.on("pageerror", (e) => {
  if (
    injectingMissingAsset &&
    e.message.includes("Could not load /assets/bosses/widow-of-the-salvo") &&
    e.message.includes("404: Not Found")
  )
    expectedErrors.push(e.message);
  else errors.push(e.message);
});
await page.addInitScript(() =>
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
await page.goto("http://localhost:5173");
await page.waitForFunction(() => window.__gateRunner);
await page.evaluate(() => {
  window.__gateRunner.freeze();
  window.__gateRunner.scenario("Grave Marshal");
});
await page.waitForFunction(
  () => window.__gateRunner.sim.boss?.kind === "Grave Marshal",
);
await page.waitForFunction(() =>
  window.__sceneReview?.scene.getObjectByName(
    `boss-grave-marshal-${window.__gateRunner.sim.boss.id}`,
  ),
);
await page.getByRole("button", { name: "Settings", exact: true }).click();
const samples = [];
for (const quality of ["high", "performance", "high"]) {
  await page.locator("#quality").selectOption(quality);
  await page.waitForFunction(() =>
    window.__sceneReview?.scene.getObjectByName(
      `boss-grave-marshal-${window.__gateRunner.sim.boss.id}`,
    ),
  );
  await page.waitForTimeout(300);
  samples.push(
    await page.evaluate((q) => {
      const model = window.__sceneReview.scene.getObjectByName(
        `boss-grave-marshal-${window.__gateRunner.sim.boss.id}`,
      );
      let triangles = 0;
      model.traverse((o) => {
        if (o.isMesh)
          triangles +=
            (o.geometry.index?.count ?? o.geometry.attributes.position.count) /
            3;
      });
      return { quality: q, triangles };
    }, quality),
  );
  console.log("Quality", samples.at(-1));
}
assert.ok(samples[0].triangles > samples[1].triangles * 2);
assert.equal(samples[0].triangles, samples[2].triangles);
let failed = 0;
injectingMissingAsset = true;
await page.route("**/assets/bosses/widow-of-the-salvo*.glb*", async (r) => {
  failed++;
  await r.fulfill({
    status: 404,
    body: "Review deliberately simulates missing asset",
  });
});
await page.evaluate(() => window.__gateRunner.scenario("Widow of the Salvo"));
await page.waitForFunction(
  () => window.__gateRunner.sim.boss?.kind === "Widow of the Salvo",
);
await page.waitForTimeout(1000);
assert.ok(failed > 0);
const fallback = await page.evaluate(() => {
  let wireframe = false;
  window.__sceneReview.scene.traverse((o) => {
    if (o.isMesh && o.material?.wireframe) wireframe = true;
  });
  return { wireframe, bossAlive: !window.__gateRunner.sim.boss.dead };
});
assert.ok(fallback.wireframe && fallback.bossAlive);
fs.writeFileSync(
  "artifacts/boss-review/quality.json",
  JSON.stringify({ samples, fallback, expectedErrors, errors }, null, 2),
);
await browser.close();
assert.equal(errors.length, 0, errors.join("\n"));
console.log("Quality switches and missing-model fallback passed.");
