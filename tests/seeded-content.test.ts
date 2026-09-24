import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, LANES, replayRun } from "../src/game/simulation";
import { MODES, ENEMIES, type Mode } from "../src/game/types";

function content(seed: string, mode: Mode) {
  const s = new Simulation(seed, mode);
  const waves = [];
  const supplies = [];
  for (let i = 0; i < 24; i++) {
    s.distance = i * 22;
    s.generate();
    waves.push({
      // Compare visible content, not IDs or attack cooldowns.
      enemies: s.enemies.map(({ kind, x, z }) => ({ kind, x, z })),
      gates: s.gates.map(({ left, right, a, b, z, wall }) => ({
        left,
        right,
        a,
        b,
        z,
        wall,
      })),
      introduction: s.template,
    });
    s.enemies = [];
    s.gates = [];
    s.drops = [];
  }
  for (let i = 0; i < 12; i++) {
    s.distance = s.nextSupply;
    s.supply(0);
    const { kind, z } = s.drops.pop()!;
    supplies.push({ kind, z, distance: s.distance });
  }
  return { waves, supplies };
}

test("visible enemies, gates, and supplies vary by seed and repeat exactly in every mode", () => {
  for (const mode of MODES) {
    const a = content("content-a", mode);
    const b = content("content-b", mode);
    assert.deepEqual(a, content("content-a", mode), mode);
    assert.notDeepEqual(a.waves[0].enemies, b.waves[0].enemies, mode);
    assert.notDeepEqual(a.waves[0].gates, b.waves[0].gates, mode);
    assert.notDeepEqual(a.supplies, b.supplies, mode);
    assert.notDeepEqual(
      a.waves.map((w) => w.introduction),
      b.waves.map((w) => w.introduction),
      mode,
    );
  }
});

test("opening pickup types and enemy compositions are no longer scripted", () => {
  const firstPickups = new Set<string>();
  const openings = new Set<string>();
  const openingEnemies = new Set<string>();
  for (let i = 0; i < 80; i++) {
    const s = new Simulation(`opening-${i}`);
    s.generate();
    assert.ok(s.enemies.length >= 2 && s.enemies.length <= 3);
    for (const e of s.enemies) {
      assert.ok(ENEMIES.slice(0, 3).some((kind) => kind === e.kind));
      openingEnemies.add(e.kind);
    }
    openings.add(s.enemies.map((e) => e.kind).join(","));
    s.supply(0);
    firstPickups.add(s.drops[0].kind);
  }
  assert.deepEqual(openingEnemies, new Set(ENEMIES.slice(0, 3)));
  assert.ok(openings.size > 10);
  assert.ok(firstPickups.size > 15);
});

test("seeded formations keep a clear lane and small lateral offsets in every mode", () => {
  for (const mode of MODES) {
    for (let i = 0; i < 60; i++) {
      const s = new Simulation(`lanes-${i}`, mode);
      s.distance = i * 20;
      s.generate();
      assert.ok(
        LANES.some((x) => s.enemies.every((e) => Math.abs(e.x - x) > 1)),
      );
      assert.ok(s.enemies.every((e) => Math.abs(e.x) <= 3.4));
      assert.ok(s.enemies.every((e) => e.z >= 27));
    }
  }
});

test("later supplies sample every safe lane instead of always preferring the left", () => {
  const lanes = new Set<number>();
  for (let i = 0; i < 40; i++) {
    const s = new Simulation(`supply-lane-${i}`);
    s.bossIndex = 1;
    s.nextSupply = 0;
    s.nextEncounter = s.nextBoss = 1e9;
    s.update({ x: 0 });
    lanes.add(s.drops[0].x);

    const blocked = new Simulation(`supply-lane-${i}`);
    blocked.bossIndex = 1;
    blocked.nextSupply = 0;
    blocked.nextEncounter = blocked.nextBoss = 1e9;
    blocked.warn(0, [0, 1], "pool", 1);
    blocked.update({ x: 0 });
    assert.equal(blocked.drops[0].x, 3);
  }
  assert.deepEqual(lanes, new Set(LANES));
});

test("randomized encounters and pickups reconstruct exactly from replay inputs", () => {
  for (const mode of MODES) {
    const s = new Simulation("random-content-replay", mode, [10, 10, 10]);
    for (let i = 0; i < 2400 && !s.over; i++) {
      s.update({ x: i % 360 < 180 ? -3 : 3 });
    }
    const restored = replayRun(s.replay());
    assert.deepEqual(restored.enemies, s.enemies, mode);
    assert.deepEqual(restored.gates, s.gates, mode);
    assert.deepEqual(restored.drops, s.drops, mode);
    assert.deepEqual(restored.loot, s.loot, mode);
    assert.equal(restored.rng.state, s.rng.state, mode);
    assert.equal(restored.nextSupply, s.nextSupply, mode);
    assert.equal(restored.nextEncounter, s.nextEncounter, mode);
  }
});
