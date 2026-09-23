import assert from "node:assert/strict";
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const designs = JSON.parse(fs.readFileSync("assets/bosses/designs.json"));
const report = [];
for (const d of designs)
  for (const suffix of ["", "-lod"]) {
    const path = `public/assets/bosses/${d.id}${suffix}.glb`;
    const root = (await io.read(path)).getRoot();
    const clips = root.listAnimations();
    assert.equal(clips.length, 8, `${path}: eight animations required`);
    assert.equal(new Set(clips.map((a) => a.getName())).size, 8);
    for (const name of ["idle", "entrance", "transform", "stagger", "death"])
      assert.ok(clips.some((a) => a.getName() === name));
    const skins = root.listSkins();
    assert.ok(skins.length > 0);
    let triangles = 0;
    for (const mesh of root.listMeshes())
      for (const p of mesh.listPrimitives()) {
        triangles +=
          (p.getIndices()?.getCount() ??
            p.getAttribute("POSITION").getCount()) / 3;
        assert.ok(p.getAttribute("JOINTS_0"));
        assert.ok(p.getAttribute("WEIGHTS_0"));
        const weights = p.getAttribute("WEIGHTS_0");
        for (let i = 0; i < weights.getCount(); i++) {
          const sum = weights.getElement(i, []).reduce((a, b) => a + b, 0);
          assert.ok(Math.abs(sum - 1) < 0.002, `${path}: unnormalized skin`);
        }
      }
    const animations = clips.map((a) => {
      let changing = 0,
        seconds = 0;
      for (const sampler of a.listSamplers()) {
        const input = sampler.getInput().getArray(),
          values = sampler.getOutput().getArray();
        seconds = Math.max(seconds, input.at(-1));
        if (
          values.some(
            (v, i) =>
              i > 3 &&
              Math.abs(v - values[i % sampler.getOutput().getElementSize()]) >
                0.001,
          )
        )
          changing++;
      }
      assert.ok(changing > 0, `${path}/${a.getName()}: frozen animation`);
      return { name: a.getName(), seconds, animatedChannels: changing };
    });
    // Higher detail is reserved for High; the runtime Performance tier stays bounded.
    assert.ok(
      triangles <
        (suffix ? 42000 : d.id === "the-last-witness" ? 300000 : 220000),
    );
    report.push({
      path,
      bytes: fs.statSync(path).size,
      triangles,
      joints: Math.max(...skins.map((s) => s.listJoints().length)),
      animations,
    });
  }
fs.mkdirSync("artifacts/boss-review", { recursive: true });
fs.writeFileSync(
  "artifacts/boss-review/assets.json",
  JSON.stringify(report, null, 2),
);
console.log(
  `Validated ${report.length} GLBs: skins, normalized weights, moving clips, geometry budgets.`,
);
