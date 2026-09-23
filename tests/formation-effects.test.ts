import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, gateResult, replayRun } from "../src/game/simulation";
import {
  formationExposure,
  formationShape,
  crowdEnvelope,
  ROAD_EDGE,
  edgeExposure,
  soldierPosition,
  ARMY_RENDER_BUDGET,
} from "../src/game/formation";
import { deathStyle, effectRandom } from "../src/game/deaths";
import { debrisRecipe, debrisPose } from "../src/render/debris";
const clean = () => {
  const s = new Simulation("pyramid");
  s.nextBoss = s.nextEncounter = 1e9;
  s.fireClock = 1e9;
  s.shield = 0;
  return s;
};
test("100 soldiers fill one column; growing ranks widen continuously past 600", () => {
  assert.ok(formationShape(100).halfWidth <= 1.5);
  assert.equal(formationExposure(100, "Classic", -3, -4.5, -1.5), 100);
  assert.ok(formationExposure(200, "Classic", -3, -1.5, 1.5) > 0);
  assert.ok(formationShape(1600).halfWidth > formationShape(600).halfWidth);
  assert.ok(formationShape(1600).halfWidth > 5.05);
  for (const army of [24, 100, 600, 2400, 100000]) {
    const count = Math.min(army, ARMY_RENDER_BUDGET);
    const points = Array.from({ length: count }, (_, i) =>
      soldierPosition(i, count, army),
    );
    assert.equal(points[0].x, 0);
    assert.equal(points[0].z, crowdEnvelope(army, "Classic", 0).front);
    assert.ok(
      Math.max(...points.map((p) => p.x)) >
        Math.min(ROAD_EDGE, formationShape(army).halfWidth) * 0.85,
    );
  }
});
test("all recruitment paths preserve growth above the removed cap", () => {
  assert.equal(gateResult(600, "+", 300, "Classic"), 900);
  assert.equal(gateResult(600, "×", 3, "Classic"), 1800);
  const s = clean();
  s.army = 700;
  s.pickup("recruit");
  assert.equal(s.army, 720);
  const b = s.spawnEnemy("Bulwark", 0, 20, true)!;
  s.kill(b);
  assert.equal(s.army, 750);
  s.mode = "Sudden Death";
  s.kill(s.spawnEnemy("Walker", 0, 20)!);
  assert.equal(s.army, 758);
});
test("curb losses are spatial, ignore shields, shrink to a stable fit and stop", () => {
  for (const mode of ["Classic", "Mirror"] as const) {
    const s = clean();
    s.mode = mode;
    s.army = 2400;
    s.shield = 999;
    for (let i = 0; i < 4800; i++) s.update({ x: 0 });
    assert.ok(s.army > 100 && s.army < 2400);
    assert.equal(s.edgeLosses, 2400 - s.army);
    assert.equal(s.shield, 999);
    assert.ok(edgeExposure(s.army, mode, s.x) <= 0.01);
    const stable = s.army;
    for (let i = 0; i < 180; i++) s.update({ x: 0 });
    assert.equal(s.army, stable);
  }
  const s = clean();
  s.army = 100;
  for (let i = 0; i < 600; i++) s.update({ x: -3 });
  assert.equal(s.army, 100);
});
test("moving the firing tip away reduces the opposite flank exposed to a hazard", () => {
  const hit = (x: number) => {
    const s = clean();
    s.army = 600;
    s.x = x;
    const h = s.warn(1, [2], "pool", 80);
    h.strikeAt = 1;
    h.endAt = 2;
    s.update({ x });
    return 600 - s.army;
  };
  assert.ok(hit(0) > hit(-3));
  assert.ok(hit(3) > hit(-3));
  const s = clean();
  s.army = 100;
  s.x = 0;
  const h = s.warn(1, [2], "pool", 100);
  h.strikeAt = 1;
  h.endAt = 2;
  s.update({ x: 0 });
  assert.equal(s.army, 100);
});
test("an enemy that misses the tip can hit rear ranks; a compact pyramid clears it", () => {
  for (const army of [100, 600]) {
    const s = clean();
    s.army = army;
    const enemy = s.spawnEnemy("Walker", 2.5, 0.4)!;
    const loss = Math.ceil(s.contactDamage(enemy));
    for (let i = 0; i < 65; i++) s.update({ x: 0 });
    assert.ok(
      army === 100 ? s.army === 100 : s.army < army && s.army >= army - loss,
    );
    assert.equal(s.enemies.length, 0);
  }
});
test("a barricade clips a wide flank even when the firing tip takes no gate", () => {
  for (const army of [100, 900]) {
    const s = clean();
    s.army = army;
    s.spawnGate(1);
    s.gates[0].z = s.crowd.push + 0.1;
    for (let i = 0; i < 65; i++) s.update({ x: 0 });
    assert.ok(army === 100 ? s.army === 100 : s.army < army);
    assert.equal(s.gates.length, 0);
  }
});
test("mirror exposure conserves troop count and respects mirrored flanks", () => {
  assert.equal(formationExposure(800, "Mirror", -3, -Infinity, Infinity), 800);
  const left = formationExposure(800, "Mirror", -3, -10, 0);
  const right = formationExposure(800, "Mirror", -3, 0, 10);
  assert.equal(left, right);
  assert.equal(left + right, 800);
});
test("visual randomness varies deaths without consuming encounter RNG", () => {
  const s = clean();
  const state = s.rng.state;
  for (let i = 0; i < 40; i++) s.effect(0, 10, "corpse", 1);
  assert.equal(s.rng.state, state);
  const events = s.effects.filter((e) => e.active);
  assert.equal(new Set(events.map((e) => e.seed)).size, 40);
  assert.notDeepEqual(debrisRecipe(events[0]), debrisRecipe(events[1]));
  const w = s.spawnEnemy("Walker", 0, 20)!;
  const kinds = new Set(
    Array.from({ length: 100 }, (_, i) => deathStyle(w, i)),
  );
  assert.deepEqual([...kinds].sort(), ["collapse", "shred", "tumble"]);
  assert.equal(deathStyle(s.spawnEnemy("Bloater", 0, 20)!, 1), "rupture");
  assert.equal(deathStyle(s.spawnEnemy("Spitter", 0, 20)!, 1), "acid");
  assert.equal(effectRandom(400, 2), effectRandom(400, 2));
});
test("gibs stay above ground, settle, and replay/pause reproduce poses", () => {
  const s = clean();
  s.effect(0, 10, "corpse", 1, { style: "rupture" });
  const e = s.effects[0];
  const recipe = debrisRecipe(e);
  for (const p of recipe) {
    for (const age of [0, 0.1, 0.4, 0.8, 1.4, 2, 4]) {
      e.age = age;
      const pose = debrisPose(e, p);
      assert.ok(pose.y >= 0);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.deepEqual(pose, debrisPose(e, p));
    }
    e.age = 3;
    const settled = debrisPose(e, p);
    e.age = 4;
    assert.equal(settled.y, debrisPose(e, p).y);
  }
});
test("death effects survive hit-pool pressure and complete replay stays identical", () => {
  const s = clean();
  for (let i = 0; i < 180; i++) s.effect(0, 1, "blood");
  s.kill(s.spawnEnemy("Bloater", 0, 20)!);
  assert.ok(
    s.effects.some(
      (e) => e.active && e.kind === "corpse" && e.style === "rupture",
    ),
  );
  assert.equal(s.effects.length, 180);
  const a = new Simulation("effects-replay");
  for (let i = 0; i < 5000 && !a.over; i++)
    a.update({ x: Math.sin(i / 240) * 3 });
  const b = replayRun(a.replay());
  assert.deepEqual(a.effects, b.effects);
  assert.equal(a.army, b.army);
});
