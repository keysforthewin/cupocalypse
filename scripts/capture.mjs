import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(r.status() + " " + r.url());
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://game:5173");
await page.waitForTimeout(6000);
await page.screenshot({ path: "artifacts/menu.png" });
await page.getByRole("button", { name: "DEPLOY SQUAD" }).click();
await page.waitForTimeout(5000);
await page.screenshot({ path: "artifacts/gameplay.png" });
await page.keyboard.press("d");
await page.waitForTimeout(400);
await page.keyboard.up("d");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.screenshot({ path: "artifacts/pause.png" });
const hardware = await page.evaluate(() => {
  const c = document.createElement("canvas"),
    gl = c.getContext("webgl2"),
    ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown",
    userAgent: navigator.userAgent,
  };
});
fs.writeFileSync(
  "artifacts/browser-smoke.json",
  JSON.stringify({ errors, hardware }, null, 2),
);
console.log(JSON.stringify({ errors, hardware }));
await browser.close();
if (errors.length) process.exitCode = 1;
