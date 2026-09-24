import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { staticHandler } from "../server/static";
import { ASSET_MANIFEST, type AssetManifest } from "../server/assetManifest";

const manifest: AssetManifest = JSON.parse(
  readFileSync(`dist/${ASSET_MANIFEST}`, "utf8"),
);
const paths = [
  "/assets/runtime/walker.glb",
  "/assets/audio/pickup-breach.wav",
  "/assets/cupocalypse-keyart.webp",
  "/assets/BarlowCondensed-Bold.woff",
  "/favicon.svg",
].map((path) => {
  assert.ok(manifest.versions[path], path);
  return `${path}?v=${manifest.versions[path]}`;
});
for (const file of readdirSync("dist/assets"))
  if (/^index-.*\.(js|css)$/.test(file)) paths.push(`/assets/${file}`);
const requests = new Map<string, number>();
const assets = staticHandler("dist");
const server = createServer((req, res) => {
  if (req.url === "/cache-check") {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    });
    res.end("<!doctype html><title>Browser cache check</title>");
  } else {
    const path = req.url || "/";
    requests.set(path, (requests.get(path) || 0) + 1);
    assets(req, res);
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext();
  const visit = async () => {
    const page = await context.newPage();
    await page.goto(`${base}/cache-check`);
    const results = await page.evaluate(async (paths) => {
      const results = [];
      for (const path of paths) {
        const response = await fetch(path);
        if (!response.ok) throw Error(`${path}: ${response.status}`);
        await response.arrayBuffer();
        const entry = performance
          .getEntriesByName(new URL(path, location.href).href)
          .at(-1) as PerformanceResourceTiming;
        results.push({
          path,
          transferSize: entry.transferSize,
          bytes: entry.decodedBodySize,
        });
      }
      return results;
    }, paths);
    await page.close();
    return results;
  };
  const first = await visit();
  const counts = new Map(requests);
  const returning = await visit();
  for (const entry of first)
    assert.ok(entry.transferSize > 0, `first download: ${entry.path}`);
  for (const entry of returning) {
    assert.equal(entry.transferSize, 0, `cached download: ${entry.path}`);
    assert.ok(entry.bytes > 0);
    assert.equal(
      requests.get(entry.path),
      counts.get(entry.path),
      `no origin revalidation: ${entry.path}`,
    );
  }
  console.log(
    `PASS: ${returning.length} assets reused in a new tab; ${first.reduce((sum, entry) => sum + entry.transferSize, 0)} first-visit bytes, zero returning-visit bytes or asset requests.`,
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
