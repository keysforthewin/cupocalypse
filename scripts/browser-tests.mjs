import { chromium } from "playwright";
import assert from "node:assert/strict";
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.GAME_URL || "http://localhost:5173");
await page.evaluate(() =>
  localStorage.setItem(
    "gate-runner-profile",
    JSON.stringify({
      currency: 300,
      upgrades: [0, 0, 0],
      records: {},
      muted: true,
      quality: "performance",
      runs: 0,
    }),
  ),
);
await page.reload();
await page.getByLabel("SEED", { exact: true }).fill("BROWSER-TEST");
await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
await page.waitForFunction(() => window.__gateRunner.sim.tick > 5);
assert.equal(
  await page.evaluate(() => window.__gateRunner.sim.seed),
  "BROWSER-TEST",
);
await page.keyboard.down("d");
await page.waitForFunction(() => window.__gateRunner.sim.x > 0.8);
await page.keyboard.up("d");
checks.push("keyboard movement");
await page.mouse.move(850, 600);
await page.mouse.down();
await page.mouse.move(650, 600, { steps: 5 });
await page.mouse.up();
await page.waitForFunction(() => window.__gateRunner.sim.x < -0.5);
checks.push("mouse drag movement");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "RESUME OPERATION" }).waitFor();
const pausedTick = await page.evaluate(() => window.__gateRunner.sim.tick);
await page.waitForTimeout(500);
assert.equal(
  await page.evaluate(() => window.__gateRunner.sim.tick),
  pausedTick,
);
checks.push("pause holds tick");
await page.getByRole("button", { name: "RESUME OPERATION" }).click();
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
await page.getByRole("button", { name: "RESUME OPERATION" }).waitFor();
checks.push("focus loss pauses");
await page.getByRole("button", { name: "RESUME OPERATION" }).click();
await page.evaluate(() => {
  const s = window.__gateRunner.sim;
  s.distance = 900;
  s.bossKills = 2;
  s.kills = 50;
  s.peak = 200;
  s.hitSquad(100000, "Test termination");
});
await page.getByRole("button", { name: "DEPLOY AGAIN" }).waitFor();
await page.waitForFunction(
  () => JSON.parse(localStorage.getItem("gate-runner-profile")).runs === 1,
);
let profile = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("gate-runner-profile")),
);
assert.equal(profile.currency, 399);
assert.equal(profile.records.Classic, 900);
checks.push("game-over payout and per-mode record");
await page.getByRole("button", { name: "ARMORY", exact: true }).click();
await page.getByRole("button", { name: "300 CR →" }).first().click();
profile = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("gate-runner-profile")),
);
assert.equal(profile.upgrades[0], 1);
assert.equal(profile.currency, 99);
checks.push("upgrade purchase persists");
await page.getByRole("button", { name: "Close panel" }).click();
await page.getByRole("button", { name: "DEPLOY AGAIN" }).click();
await page.waitForFunction(() => window.__gateRunner.sim.tick > 2);
assert.equal(await page.evaluate(() => window.__gateRunner.sim.army), 26);
assert.equal(await page.evaluate(() => window.__gateRunner.sim.kills), 0);
checks.push("restart resets entities and applies upgrades");
await page.keyboard.press("`");
await page.evaluate(() => {
  const s = window.__gateRunner.sim;
  s.distance = 2000;
  s.hitSquad(100000, "Debug test");
});
await page.getByRole("button", { name: "DEPLOY AGAIN" }).waitFor();
profile = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("gate-runner-profile")),
);
assert.equal(profile.currency, 99);
assert.equal(profile.runs, 1);
checks.push("debug cannot earn progression");
await page.reload();
await page.getByLabel("MISSION PROTOCOL").selectOption("Mirror");
await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
await page.evaluate(() => {
  window.__gateRunner.freeze();
  const s = window.__gateRunner.sim;
  s.gates = [];
  s.enemies = [];
  s.drops = [];
  s.hazards = [];
  s.spawnGate();
  s.gates[0].z = 14;
});
await page.locator(".gate-number").first().waitFor({ timeout: 60000 });
await page.screenshot({ path: "artifacts/animation-mirror.png", timeout: 60000 });
assert.equal(await page.locator(".gate-number").count(), 4);
checks.push("Mirror has four linked gate panels");
await page.setViewportSize({ width: 700, height: 800 });
assert.equal(await page.locator(".desktop-only").isVisible(), true);
checks.push("desktop-only message");
fs.writeFileSync(
  "artifacts/animation-browser-tests.json",
  JSON.stringify({ checks, errors }, null, 2),
);
console.log(JSON.stringify({ checks, errors }));
await browser.close();
if (errors.length) process.exitCode = 1;
