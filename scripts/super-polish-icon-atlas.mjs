import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = `artifacts/super-polish/${process.env.PHASE || "iteration-5"}`;
fs.mkdirSync(out, { recursive: true });
const base = process.env.GAME_URL || "http://localhost:5179";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1100, height: 2100 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.route("**/icon-atlas-review", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><title>Super icon optical-size review</title></head><body><main id="atlas"></main></body></html>',
    }),
  );
  await page.goto(`${base}/icon-atlas-review`);
  const data = await page.evaluate(async () => {
    const RefreshRuntime = (await import("/@react-refresh")).default;
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (
      await import("/node_modules/.vite/deps/react-dom_client.js")
    ).default;
    const { SUPER_IDS, SUPERS } = await import("/src/game/superWeapons.ts");
    const { SuperGlyph } = await import("/src/ui/SuperWeapons.tsx");
    const style = document.createElement("style");
    style.textContent =
      "*{box-sizing:border-box}body{margin:0;background:#10211b;color:#e6efde;font:13px monospace}main{width:1100px;padding:24px}.row{display:grid;grid-template-columns:190px repeat(3,1fr);align-items:center;height:72px;border-bottom:1px solid #ffffff16}.sample{display:flex;gap:14px;align-items:center}.size{font-size:10px;color:#92aa9f}.glyph{display:block;flex:none;background:#10211b}.row:nth-child(2n){background:#13281f}.row:nth-child(2n) .glyph{background:#13281f}";
    document.head.append(style);
    createRoot(document.getElementById("atlas")).render(
      React.createElement(
        "section",
        null,
        ...SUPER_IDS.map((id) =>
          React.createElement(
            "div",
            { className: "row", key: id, "data-id": id },
            React.createElement("span", null, SUPERS[id].name),
            ...[22, 34, 48].map((size) =>
              React.createElement(
                "div",
                { className: "sample", key: size },
                React.createElement(
                  "span",
                  {
                    className: "glyph",
                    "data-size": size,
                    style: { width: size, height: size },
                  },
                  React.createElement(SuperGlyph, { id }),
                ),
                React.createElement(
                  "span",
                  { className: "size" },
                  `${size} px`,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    return SUPER_IDS;
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".glyph svg").length === 81,
  );
  const bounds = await page.locator(".glyph").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return {
        id: n.closest(".row").dataset.id,
        size: +n.dataset.size,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      };
    }),
  );
  await page.screenshot({
    path: `${out}/icons-optical-sizes.png`,
    fullPage: true,
  });
  for (let i = 0; i < 3; i++)
    await page.screenshot({
      path: `${out}/icons-optical-${i + 1}.png`,
      clip: { x: 0, y: 24 + i * 9 * 72, width: 1100, height: 9 * 72 },
    });
  assert.equal(bounds.length, 81);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/icons-optical-report.json`,
    JSON.stringify({ ids: data, bounds, errors }, null, 2),
  );
} finally {
  await browser.close();
}
