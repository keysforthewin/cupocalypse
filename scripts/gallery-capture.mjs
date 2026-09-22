import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1500 } });
await page.goto("http://game:5173/artifacts/asset-review.html");
await page.waitForFunction(() =>
  Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
);
await page.screenshot({ path: "artifacts/asset-review.png", fullPage: true });
await browser.close();
