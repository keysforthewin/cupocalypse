import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
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
page.setDefaultTimeout(90000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const meter = page.getByRole("progressbar", {
  name: "Shared super charge",
  exact: true,
});
async function kills(count) {
  await page.evaluate((count) => {
    const s = window.__gateRunner.sim;
    for (let i = 0; i < count; i++) s.kill(s.spawnEnemy("Walker", 0, 30));
    s.enemies.length = 0;
  }, count);
}
async function cycle(index) {
  await page.evaluate(() => window.__gateRunner.freeze(false));
  await page.keyboard.press("e");
  await page.waitForFunction(
    (index) => window.__gateRunner.sim.supers.selected === index,
    index,
  );
  await page.evaluate(() => window.__gateRunner.freeze());
}
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.evaluate(() =>
    localStorage.setItem(
      "gate-runner-profile",
      JSON.stringify({
        upgrades: [0, 0, 0],
        quality: "performance",
        muted: true,
        ownedSuperWeapons: ["doc", "nitro", "pauly", "meesh"],
        superLoadout: ["doc", "nitro", "pauly"],
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: /DEPLOY SQUAD/ }).click();
  await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
  await page.evaluate(() => {
    window.__gateRunner.freeze();
    const s = window.__gateRunner.sim;
    s.debug = true;
    s.enemies.length = s.gates.length = s.drops.length = s.hazards.length = 0;
    s.nextEncounter = s.nextBoss = s.nextSupply = s.fireClock = 1e9;
  });
  await kills(7);
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Shared super charge"]')
        .getAttribute("aria-valuenow") === "7",
  );
  await cycle(1);
  assert.equal(await meter.getAttribute("aria-valuenow"), "7");
  assert.match(await page.locator(".super-weapon-name").innerText(), /Nitro/);
  await kills(10);
  await cycle(2);
  assert.equal(await meter.getAttribute("aria-valuenow"), "17");
  assert.match(await page.locator(".super-weapon-name").innerText(), /Pauly/);
  assert.ok(await page.locator(".super-ready-prompt").isVisible());
  mkdirSync("artifacts/shared-charge", { recursive: true });
  await page.screenshot({
    path: "artifacts/shared-charge/ready-after-switch.png",
  });
  await page.evaluate(() => window.__gateRunner.freeze(false));
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => !!window.__gateRunner.sim.supers.active("pauly"),
  );
  await page.evaluate(() => window.__gateRunner.freeze());
  assert.equal(
    await page.evaluate(() => window.__gateRunner.sim.supers.charge),
    0,
  );
  await cycle(0);
  assert.equal(await meter.getAttribute("aria-valuenow"), "0");
  await page.evaluate(() => window.__gateRunner.freeze(false));
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__gateRunner.freeze());
  assert.equal(
    await page.evaluate(() => window.__gateRunner.sim.supers.serial),
    1,
  );
  console.log(
    "PASS: partial and full charge survive switching; chosen weapon fires; one activation empties all weapon choices",
  );
  await kills(5);
  await page.getByRole("button", { name: "ARMORY", exact: true }).click();
  await page
    .locator(".super-card")
    .filter({ has: page.locator("strong", { hasText: /^Meesh$/ }) })
    .click();
  await page.getByRole("button", { name: /^EQUIP IN SLOT/ }).click();
  assert.equal(
    await page.evaluate(() => window.__gateRunner.sim.supers.charge),
    5,
  );
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: /RESUME OPERATION/ }).click();
  assert.equal(await meter.getAttribute("aria-valuenow"), "5");
  assert.match(await page.locator(".super-weapon-name").innerText(), /Meesh/);
  assert.equal(await meter.count(), 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Armory replacements preserve shared charge and the HUD shows one universal meter; no browser errors",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
