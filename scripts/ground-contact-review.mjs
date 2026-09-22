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
const p = await browser.newPage({ viewport: { width: 960, height: 720 } });
await p.goto("http://localhost:5173");
await p.waitForFunction(() => window.__gateRunner);
await p.evaluate(() => {
  window.__gateRunner.freeze();
  window.__gateRunner.scenario("Bulwark");
});
await p.waitForFunction(() => window.__sceneReview);
await p.waitForTimeout(500);
await p.evaluate(() => {
  const q = window.__gateRunner,
    s = q.sim,
    e = s.boss;
  e.cooldown = 0;
  s.fireClock = 1e9;
  s.update({ x: 0 }, false);
  s.tick = e.motions[0].strike;
  q.advance(0);
});
await p.waitForTimeout(500);
const contact = await p.evaluate(() => {
  const { scene } = window.__sceneReview;
  const e = window.__gateRunner.sim.boss;
  const root = scene.getObjectByName(`animated-${e.kind}-${e.id}`);
  const out = {};
  root.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const idx = mesh.geometry.getAttribute("skinIndex"),
      weight = mesh.geometry.getAttribute("skinWeight");
    for (const name of ["handL", "handR", "footL", "footR"]) {
      let min = Infinity,
        max = -Infinity,
        n = 0;
      for (let i = 0; i < idx.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++)
          if (mesh.skeleton.bones[idx.getComponent(i, k)].name === name)
            w += weight.getComponent(i, k);
        if (w < 0.5) continue;
        const pos = mesh.position.clone();
        mesh.getVertexPosition(i, pos);
        mesh.localToWorld(pos);
        min = Math.min(min, pos.y);
        max = Math.max(max, pos.y);
        n++;
      }
      out[name] = { min, max, n };
    }
  });
  return out;
});
for (const name of ["handL", "handR", "footL", "footR"]) {
  assert.ok(contact[name].n > 100, name + " has skinned geometry");
  assert.ok(
    contact[name].min > -0.05 && contact[name].min < 0.08,
    name + " lands on the road: " + contact[name].min,
  );
}
await p.evaluate(() => {
  const c = window.__sceneReview.camera;
  c.position.set(8, 7, -10);
  c.lookAt(0, 2, -22);
  c.updateProjectionMatrix();
});
await p.waitForTimeout(200);
await p.screenshot({
  path: "artifacts/motion-closeup/bulwark-ground-contact.png",
});
fs.writeFileSync(
  "artifacts/ground-contact.json",
  JSON.stringify(contact, null, 2),
);
console.log(contact);
await browser.close();
