import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  auditGeometry,
  planeDeviation,
} from "../scripts/building-geometry.mjs";
import { evaluateBuildings, catalog } from "../scripts/building-quality.mjs";
import {
  createBuildingFixture,
  type BuildingKind,
  type SceneryLibrary,
} from "../src/render/biomeModels";

test("building audit detects a reversed face and a wholly inverted closed shell", () => {
  const cube = new T.BoxGeometry();
  assert.equal(auditGeometry(cube).windingConflicts, 0);
  const ix = cube.index!;
  [ix.array[0], ix.array[1]] = [ix.array[1], ix.array[0]];
  assert.ok(auditGeometry(cube).windingConflicts > 0);
  assert.ok(auditGeometry(cube).normalDisagreements > 0);
  const inverted = new T.BoxGeometry();
  const a = inverted.index!.array;
  for (let i = 0; i < a.length; i += 3) [a[i], a[i + 1]] = [a[i + 1], a[i]];
  assert.equal(auditGeometry(inverted).inwardComponents, 1);
  cube.dispose();
  inverted.dispose();
});
test("audit distinguishes holes and missing/collapsed UVs", () => {
  const g = new T.BoxGeometry();
  g.setIndex(Array.from(g.index!.array).slice(3));
  assert.ok(auditGeometry(g).boundaryEdges > 0);
  g.deleteAttribute("uv");
  assert.equal(auditGeometry(g).missingUV, 1);
  assert.equal(auditGeometry(g, { requireUV: false }).missingUV, 0);
  const h = new T.BoxGeometry();
  h.getAttribute("uv").array.fill(0);
  assert.equal(auditGeometry(h).collapsedUV, 12);
  g.dispose();
  h.dispose();
});
test("upright UV diagnostic detects a vertical texture reversal", () => {
  const g = new T.PlaneGeometry(2, 2);
  assert.equal(auditGeometry(g, { uvUp: true }).reversedUV, 0);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  assert.equal(auditGeometry(g, { uvUp: true }).reversedUV, 2);
  g.dispose();
});
test("planarity checks a complete patch rather than its triangles", () => {
  assert.equal(
    planeDeviation([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ]),
    0,
  );
  assert.ok(
    planeDeviation([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0.1],
    ]) > 0.09,
  );
  // A legitimate curved surface is not subjected to the planar-patch gate.
  const g = new T.CylinderGeometry(1, 1, 2, 32);
  const result = auditGeometry(g);
  assert.equal(result.inwardComponents, 0);
  assert.equal(result.windingConflicts, 0);
  g.dispose();
});
for (const kind of ["city", "house", "barn", "ruin"] as BuildingKind[])
  test(`all procedural ${kind} variants have consistent solids and normals`, () => {
    const mat = new T.MeshStandardMaterial();
    const library: SceneryLibrary = {
      materials: Object.fromEntries(
        [
          "stone",
          "brick",
          "road",
          "paving",
          "wood",
          "metal",
          "glass",
          "leaf",
          "straw",
          "ground",
          "paint",
          "glow",
        ].map((k) => [k, mat]),
      ),
      dispose() {
        mat.dispose();
      },
    };
    for (const seed of catalog.seeds)
      for (const variant of catalog.variants) {
        const root = createBuildingFixture(library, kind, variant, seed);
        root.traverse((o) => {
          if (o instanceof T.Mesh) {
            const r = auditGeometry(o.geometry);
            for (const key of [
              "degenerate",
              "windingConflicts",
              "inwardComponents",
              "normalDisagreements",
              "boundaryEdges",
              "nonManifoldEdges",
              "missingUV",
            ])
              assert.equal(r[key], 0, `${kind}/${variant}/${seed}: ${key}`);
            o.geometry.dispose();
          }
        });
      }
    library.dispose();
  });
function complete() {
  const id = "example",
    seed = "BIOME-A",
    quality = "high",
    file = "case.png",
    hash = "current";
  const capture = {
    id,
    seed,
    quality,
    file,
    hash: "asset",
    orientations: [0, 90, 180, 270],
    audit: {
      degenerate: 0,
      windingConflicts: 0,
      inwardComponents: 0,
      normalDisagreements: 0,
      missingUV: 0,
    },
  };
  const report = {
    sourceHash: hash,
    biomeSourceHash: "biome",
    assetHashes: { "example/high": "asset" },
    errors: [],
    runtime: { passed: true, sourceHash: "biome" },
    captures: [capture],
  };
  const assessment = {
    sourceHash: hash,
    rows: [
      {
        id,
        seed,
        quality,
        scores: Object.fromEntries(
          Object.keys(catalog.weights).map((k) => [k, 95]),
        ),
        observations: "Inspected all four orientations at the gameplay camera.",
        evidence: [file],
        blockers: [],
      },
    ],
  };
  const options = {
    currentHash: hash,
    exists: () => true,
    ids: [id],
    seeds: [seed],
    qualities: [quality],
  };
  return { report, assessment, options };
}
test("95 passes, while incomplete, stale, failed, or unreviewed evidence fails", () => {
  let { report, assessment, options } = complete();
  assert.equal(evaluateBuildings(report, assessment, options).accepted, true);
  for (const mutate of [
    (r: any, a: any) => (a.rows[0].scores.structure = 94),
    (r: any, a: any) => (a.rows[0].scores.uv = 89),
    (r: any, a: any) => (a.rows[0].scores.integrity = null),
    (r: any, a: any) => (a.rows[0].blockers = ["inverted polygon"]),
    (r: any, a: any) => (a.rows = []),
    (r: any, a: any) => (a.rows[0].observations = ""),
    (r: any, a: any) => (r.sourceHash = "old"),
    (r: any, a: any) => (r.captures[0].hash = "old-asset"),
    (r: any, a: any) => (r.captures[0].orientations = [0, 90]),
    (r: any, a: any) => (r.captures[0].audit.windingConflicts = 1),
    (r: any, a: any) => (r.runtime.passed = false),
    (r: any, a: any) => (r.runtime.sourceHash = "old-biome"),
  ]) {
    ({ report, assessment, options } = complete());
    mutate(report, assessment);
    assert.equal(
      evaluateBuildings(report, assessment, options).accepted,
      false,
    );
  }
  ({ report, assessment, options } = complete());
  options.exists = () => false;
  assert.equal(evaluateBuildings(report, assessment, options).accepted, false);
});
