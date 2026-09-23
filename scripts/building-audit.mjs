import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { BufferGeometry, BufferAttribute, Matrix4 } from "three";
import { auditGeometry } from "./building-geometry.mjs";
import { catalog, hashFile } from "./building-quality.mjs";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const rows = [];
const output = process.argv[2] || "artifacts/buildings/final";
fs.mkdirSync(output, { recursive: true });
for (const id of catalog.assets)
  for (const stage of ["processed", "high", "performance"]) {
    const file =
      stage === "processed"
        ? `assets/biomes/processed/${id}.glb`
        : `public/assets/biomes/${id}${stage === "performance" ? "-lod" : ""}.glb`;
    const doc = await io.read(file);
    const total = {};
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      for (const primitive of mesh.listPrimitives()) {
        const g = new BufferGeometry();
        for (const semantic of primitive.listSemantics()) {
          const attribute = primitive.getAttribute(semantic),
            name =
              { POSITION: "position", NORMAL: "normal", TEXCOORD_0: "uv" }[
                semantic
              ] ?? semantic.toLowerCase();
          g.setAttribute(
            name,
            new BufferAttribute(
              attribute.getArray(),
              attribute.getElementSize(),
            ),
          );
        }
        if (primitive.getIndices())
          g.setIndex(new BufferAttribute(primitive.getIndices().getArray(), 1));
        g.applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix()));
        for (const [key, value] of Object.entries(
          auditGeometry(g, {
            requireUV: Boolean(
              primitive.getMaterial()?.getBaseColorTexture() ||
              primitive.getMaterial()?.getNormalTexture() ||
              primitive.getMaterial()?.getMetallicRoughnessTexture(),
            ),
          }),
        ))
          total[key] = (total[key] ?? 0) + value;
        g.dispose();
      }
    }
    rows.push({ id, stage, file, hash: hashFile(file), ...total });
  }
const checks = [
  "degenerate",
  "windingConflicts",
  "inwardComponents",
  "normalDisagreements",
  "missingUV",
  "collapsedUV",
  "boundaryEdges",
  "nonManifoldEdges",
];
const failures = rows.flatMap((row) =>
  checks
    .filter((k) => row[k] !== 0)
    .map((k) => `${row.id}/${row.stage}: ${k}=${row[k]}`),
);
for (const id of catalog.assets) {
  const variants = rows.filter((r) => r.id === id);
  if (new Set(variants.map((r) => r.triangles)).size !== 1)
    failures.push(`${id}: geometry changed during export/optimization`);
}
const report = { passed: !failures.length, rows, failures };
fs.writeFileSync(`${output}/geometry.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ passed: report.passed, meshes: rows.length, failures }),
);
if (failures.length) process.exitCode = 1;
