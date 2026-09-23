import test from "node:test";
import assert from "node:assert/strict";
import {
  BIOME_IDS,
  biomeBag,
  biomeAtVisit,
  routeBiome,
  atmosphereAt,
  sampleBiome,
} from "../src/render/biomes";
import { Simulation } from "../src/game/simulation";
import { roadChunkZ, ROAD_CHUNK_COUNT } from "../src/render/roadMath";
import { terrainHeight } from "../src/render/biomeModels";
test("biome bags cover all five, start in city and never repeat at bag boundaries", () => {
  for (let seed = 0; seed < 80; seed++) {
    let last = "";
    for (let bag = 0; bag < 60; bag++) {
      const ids = biomeBag(String(seed), bag);
      assert.deepEqual([...ids].sort(), [...BIOME_IDS].sort());
      assert.notEqual(ids[0], last);
      last = ids[4];
      if (!bag) assert.equal(ids[0], "city");
    }
  }
});
test("biomes are reproducible and do not consume combat randomness", () => {
  const sim = new Simulation("biome-determinism"),
    before = sim.rng.state;
  const a = Array.from({ length: 100 }, (_, i) => biomeAtVisit(sim.seed, i));
  assert.deepEqual(
    a,
    Array.from({ length: 100 }, (_, i) => biomeAtVisit(sim.seed, i)),
  );
  assert.equal(before, sim.rng.state);
  assert.notDeepEqual(
    a,
    Array.from({ length: 100 }, (_, i) => biomeAtVisit("different", i)),
  );
  assert.equal(biomeAtVisit(sim.seed, 1e8), biomeAtVisit(sim.seed, 1e8));
});
test("minute cadence, twenty second atmosphere blend, and traveling forty-unit boundaries", () => {
  const seed = "cadence";
  assert.deepEqual(atmosphereAt(seed, 59.99), {
    from: "city",
    to: "city",
    blend: 0,
  });
  assert.equal(atmosphereAt(seed, 60).blend, 0);
  assert.equal(atmosphereAt(seed, 70).blend, 0.5);
  assert.equal(atmosphereAt(seed, 80).blend, 1);
  assert.equal(atmosphereAt(seed, 120).blend, 0);
  assert.equal(routeBiome(seed, 600).blend, 0);
  assert.equal(routeBiome(seed, 620).blend, 0.5);
  assert.equal(routeBiome(seed, 640).blend, 1);
  for (let i = 0; i < 20; i++)
    assert.deepEqual(atmosphereAt(seed, 70), atmosphereAt(seed, 70));
});
test("absolute route identities survive recycling and sample shared terrain boundaries identically", () => {
  for (const d of [0, 479.99, 480, 480.01, 639.99, 640, 9999.5]) {
    const routes = Array.from(
      { length: ROAD_CHUNK_COUNT },
      (_, i) => Math.round((d - roadChunkZ(i, d)) / 20) * 20,
    ).sort((a, b) => a - b);
    assert.equal(new Set(routes).size, ROAD_CHUNK_COUNT);
    for (let i = 1; i < routes.length; i++) {
      assert.equal(routes[i] - routes[i - 1], 20);
      const edge = routes[i] - 10;
      assert.deepEqual(
        routeBiome("edge", edge),
        routeBiome("edge", routes[i - 1] + 10),
      );
      for (const x of [-80, -20, 0, 20, 80])
        assert.equal(
          terrainHeight(x, edge),
          terrainHeight(x, routes[i - 1] + 10),
        );
    }
  }
});
test("every directed pair blends continuously and review overrides leave the route unchanged", () => {
  for (const from of BIOME_IDS)
    for (const to of BIOME_IDS)
      if (from !== to) {
        const samples = [600, 610, 620, 630, 640].map((p) =>
          sampleBiome("review", p, { from, to }),
        );
        assert.deepEqual(
          samples.map((s) => s.blend),
          [0, 0.15625, 0.5, 0.84375, 1],
        );
        assert.ok(samples.every((s) => s.from === from && s.to === to));
      }
  for (const biome of BIOME_IDS)
    assert.deepEqual(sampleBiome("s", 100, { biome }), {
      from: biome,
      to: biome,
      blend: 0,
    });
});

import * as T from "three";
import {
  beginSceneryChunk,
  createSceneryChunk,
  type SceneryLibrary,
} from "../src/render/biomeModels";
test("incremental preparation preserves the synchronous deterministic geometry", () => {
  const material = new T.MeshStandardMaterial();
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
        "ground",
        "paint",
        "glow",
        "needles",
        "broadleaf",
        "straw",
      ].map((k) => [k, material]),
    ),
    dispose() {
      material.dispose();
    },
  };
  for (const biome of BIOME_IDS) {
    const direct = createSceneryChunk(
      library,
      "incremental",
      620,
      "performance",
      { biome },
    );
    const task = beginSceneryChunk(library, "incremental", 620, "performance", {
      biome,
    });
    let step = task.next(),
      stages = 0;
    while (!step.done) {
      stages++;
      step = task.next();
    }
    assert.equal(stages, 6);
    const counts = (root: T.Group) => {
      const result: number[] = [];
      root.traverse((o) => {
        if (o instanceof T.Mesh)
          result.push(o.geometry.getAttribute("position").count);
      });
      return result;
    };
    assert.deepEqual(counts(direct.root), counts(step.value.root));
    direct.dispose();
    step.value.dispose();
  }
  library.dispose();
});

test("foliage preserves the playable road corridor across representative layouts", () => {
  const names = [
    "stone",
    "brick",
    "road",
    "paving",
    "wood",
    "metal",
    "glass",
    "leaf",
    "ground",
    "paint",
    "glow",
    "needles",
    "broadleaf",
    "straw",
  ];
  const materials = Object.fromEntries(
    names.map((name) => {
      const m = new T.MeshStandardMaterial();
      m.name = name;
      return [name, m];
    }),
  );
  const library: SceneryLibrary = {
    materials,
    dispose() {
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
  for (const biome of ["suburb", "forest"] as const)
    for (let seed = 0; seed < 8; seed++) {
      const chunk = createSceneryChunk(
        library,
        "clearance-" + seed,
        620,
        "high",
        { biome },
      );
      chunk.root.updateMatrixWorld(true);
      chunk.root.traverse((o) => {
        if (
          !(o instanceof T.Mesh) ||
          Array.isArray(o.material) ||
          !["needles", "broadleaf"].includes(o.material.name)
        )
          return;
        const p = o.geometry.getAttribute("position");
        const matrix = new T.Matrix4(),
          vertex = new T.Vector3();
        for (
          let instance = 0;
          instance < (o instanceof T.InstancedMesh ? o.count : 1);
          instance++
        ) {
          if (o instanceof T.InstancedMesh) {
            o.getMatrixAt(instance, matrix);
            matrix.premultiply(o.matrixWorld);
          } else matrix.copy(o.matrixWorld);
          for (let i = 0; i < p.count; i++) {
            vertex.fromBufferAttribute(p, i).applyMatrix4(matrix);
            assert.ok(
              Math.abs(vertex.x) >= 5.05,
              `${biome}/${seed}: foliage intrudes at ${vertex.x}`,
            );
          }
        }
      });
      chunk.dispose();
    }
  library.dispose();
});
