import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, replayRun } from "../src/game/simulation";
import {
  crowdEnvelope,
  confineToRoad,
  roundedWidth,
  formationExposure,
  soldierPosition,
  ROAD_EDGE,
} from "../src/game/formation";
import { encounterScale } from "../src/game/escalation";
import { weaponStats } from "../src/game/weapons";
const upgrades = (n: number) => ({ damage: n, rate: n, spread: n, hero: n });
const clean = () => {
  const s = new Simulation("blob");
  s.nextBoss = s.nextEncounter = 1e9;
  s.fireClock = 1e9;
  return s;
};
test("rounded shoulders, flat rear, and confinement retain a dense mass on the road", () => {
  assert.ok(roundedWidth(0.5) > 0.65);
  for (const x of [-3.8, 0, 3.8]) {
    const e = crowdEnvelope(600, "Classic", x);
    const points = Array.from({ length: 600 }, (_, i) =>
      soldierPosition(i, 600, 600, x),
    );
    assert.ok(points.every((p) => Math.abs(p.x) <= ROAD_EDGE));
    const last = points.filter((p) => p.row === points.at(-1)!.row);
    assert.ok(last.length > 10);
    assert.ok(last.every((p) => p.z === e.back));
    if (x < 0) {
      assert.ok(points.filter((p) => p.x < 0).length > 540);
      assert.ok(points.filter((p) => p.x < -4.35).length > 60);
    }
  }
  assert.ok(confineToRoad(12) < ROAD_EDGE);
  assert.ok(confineToRoad(12) > ROAD_EDGE - 0.1);
});
test("tip leads the trailing body, and sideways compression pushes the shot origin forward", () => {
  const s = clean();
  s.army = 600;
  for (let i = 0; i < 20; i++) s.update({ x: -3.8 }, false);
  assert.ok(s.x < s.crowdX - 0.5);
  for (let i = 0; i < 150; i++) s.update({ x: -3.8 }, false);
  const compressed = s.crowd;
  assert.ok(compressed.front < -0.5);
  assert.ok(s.edgeLosses > 0);
  assert.ok(s.army > 450);
  s.fireClock = 0;
  const muzzleBefore = 0.7 + s.crowd.push;
  s.update({ x: -3.8 }, false);
  const b = s.bullets.find((b) => b.active)!;
  assert.ok(b.previous > 0.7);
  assert.ok(Math.abs(b.previous - muzzleBefore) < 0.02);
  const previousRear = s.crowdX;
  s.update({ x: 3.8 }, false);
  assert.ok(s.x > previousRear);
  assert.ok(s.crowdX < s.x);
});
test("compressed collisions count the flank mass and agree with visible occupancy", () => {
  const army = 900,
    x = -3.8;
  const points = Array.from({ length: army }, (_, i) =>
    soldierPosition(i, army, army, x),
  );
  for (const [left, right] of [
    [-5.05, -4.35],
    [-4.35, -2],
    [-1.5, 1.5],
  ]) {
    const visible = points.filter((p) => p.x >= left && p.x <= right).length;
    const physical = formationExposure(army, "Classic", x, left, right);
    assert.ok(
      Math.abs(visible - physical) < army * 0.08,
      `${visible} vs ${physical}`,
    );
  }
  assert.equal(
    formationExposure(army, "Classic", x, -Infinity, Infinity),
    army,
  );
});
test("crowd lag and compression replay exactly, including casualties and bullets", () => {
  const s = new Simulation("blob-replay");
  for (let i = 0; i < 8000 && !s.over; i++)
    s.update({ x: Math.sin(i / 170) * 3.8 });
  const r = replayRun(s.replay());
  assert.equal(r.crowdX, s.crowdX);
  assert.deepEqual(r.crowd, s.crowd);
  assert.equal(r.army, s.army);
  assert.deepEqual(r.bullets, s.bullets);
});
test("the opening is slow even with debug-sized weapon levels; earned power scales later threats", () => {
  const early = encounterScale(20, 100, upgrades(10));
  assert.equal(early.health, 1);
  assert.equal(early.extraEnemies, 0);
  assert.ok(early.spacing > 10);
  let prior = encounterScale(500, 300, upgrades(0));
  for (const level of [1, 3, 8]) {
    const next = encounterScale(500, 300, upgrades(level));
    assert.ok(next.health > prior.health);
    assert.ok(next.armor > prior.armor);
    assert.ok(next.extraEnemies >= prior.extraEnemies);
    assert.ok(next.spacing <= prior.spacing);
    prior = next;
  }
  assert.ok(prior.extraEnemies >= 6);
  assert.ok(prior.speed > 1.2);
});
test("new enemies are tougher and more numerous; existing enemies and damage bonuses are retained", () => {
  const normal = clean(),
    strong = clean();
  for (const s of [normal, strong]) {
    s.distance = 500;
    s.army = 300;
    s.introduced = 10;
  }
  const old = strong.spawnEnemy("Walker", 0, 20)!;
  const hp = old.hp;
  for (let i = 0; i < 3; i++)
    for (const kind of ["damage", "rate", "spread", "hero"] as const)
      strong.pickup(kind);
  assert.equal(old.hp, hp);
  assert.ok(
    weaponStats(strong.boosts).damage > weaponStats(normal.boosts).damage,
  );
  const a = normal.spawnEnemy("Riot Guard", 0, 20)!,
    b = strong.spawnEnemy("Riot Guard", 0, 20)!;
  assert.ok(b.hp > a.hp);
  assert.ok(b.armor > a.armor);
  assert.ok(b.speed > a.speed);
  normal.enemies = [];
  strong.enemies = [];
  normal.generate();
  strong.generate();
  assert.ok(strong.enemies.length > normal.enemies.length);
  assert.ok(strong.enemies.some((e) => e.armor > 0));
  assert.ok(new Set(strong.enemies.map((e) => Math.sign(e.x))).size >= 2);
});
test("multiplier gates are absent during the opening and rare afterward", () => {
  for (const distance of [0, 70, 150, 500]) {
    const s = clean();
    s.distance = distance;
    let times = 0;
    for (let i = 0; i < 2000; i++) {
      s.spawnGate();
      const g = s.gates.pop()!;
      times += Number(g.left === "×") + Number(g.right === "×");
    }
    const rate = times / 4000;
    if (distance < 100) assert.equal(times, 0);
    else if (distance < 250) assert.ok(rate > 0.01 && rate < 0.045, `${rate}`);
    else assert.ok(rate > 0.035 && rate < 0.085, `${rate}`);
  }
});
