import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const saved = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("gate-runner-profile")));
const inspect = (name) =>
  page
    .locator(".super-card")
    .filter({
      has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }),
    })
    .click();
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.evaluate(() =>
    localStorage.setItem(
      "gate-runner-profile",
      JSON.stringify({
        currency: 0,
        upgrades: [0, 0, 0],
        muted: true,
        quality: "performance",
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: /DEPLOY SQUAD/ }).click();
  await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
  await page.evaluate(() => {
    window.__gateRunner.freeze();
    window.__gateRunner.sim.distance = 200;
  });
  await page.getByRole("button", { name: "ARMORY", exact: true }).click();
  assert.equal((await saved()).currency, 50);
  const pausedTick = await page.evaluate(() => window.__gateRunner.sim.tick);
  await page.evaluate(() => window.__gateRunner.freeze(false));
  console.log("Checking live purchase and equip");
  await inspect("Doc");
  await page.getByRole("button", { name: /^UNLOCK/ }).click();
  await page.getByRole("button", { name: /^EQUIP IN SLOT/ }).click();
  assert.deepEqual(
    await page.evaluate(() => window.__gateRunner.sim.supers.loadout),
    ["doc"],
  );
  assert.equal((await saved()).currency, 0);
  assert.equal(
    await page.evaluate(() => window.__gateRunner.sim.tick),
    pausedTick,
  );
  await page.keyboard.press("Escape");
  assert.ok(
    await page.getByRole("button", { name: /RESUME OPERATION/ }).isVisible(),
  );
  await page.getByRole("button", { name: "ARMORY", exact: true }).click();
  assert.equal(
    (await saved()).currency,
    0,
    "reopening must not duplicate credits",
  );
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    for (let i = 0; i < s.supers.slot.quota; i++)
      s.kill(s.spawnEnemy("Walker", 0, 30));
  });
  await page.getByRole("button", { name: /RESUME OPERATION/ }).click();
  console.log("Checking live activation");
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => !!window.__gateRunner.sim.supers.active("doc"),
  );
  await page.evaluate(() => {
    const s = window.__gateRunner.sim;
    s.distance = 400;
    s.over = true;
    s.reason = "Armory regression check";
  });
  await page.getByRole("button", { name: /DEPLOY AGAIN/ }).waitFor();
  assert.equal(
    (await saved()).currency,
    50,
    "settlement only pays unclaimed earnings",
  );
  await page.getByRole("button", { name: "ARMORY", exact: true }).click();
  console.log("Checking death-screen purchase and redeploy");
  await inspect("Nitro");
  await page.getByRole("button", { name: /^UNLOCK/ }).click();
  await page.getByRole("button", { name: /^EQUIP IN SLOT/ }).click();
  assert.deepEqual((await saved()).superLoadout, ["nitro"]);
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: /DEPLOY AGAIN/ }).click();
  await page.waitForFunction(
    () =>
      window.__gateRunner.sim.supers.loadout.join(",") === "nitro" &&
      window.__gateRunner.sim.tick > 0,
  );
  assert.equal((await saved()).currency, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: live credits, purchase, equip, pause, activation, no duplicate payout, death-screen purchase, and redeploy",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  console.error((await page.locator("body").innerText()).slice(-4000));
  throw error;
} finally {
  await browser.close();
}
