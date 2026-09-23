import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, DT, replayRun } from "../src/game/simulation";
import {
  GUNS,
  ARSENAL,
  moveProjectile,
  type Gun,
} from "../src/game/projectiles";
import { BULLET_CAPACITY } from "../src/game/weapons";
import { MODES } from "../src/game/types";
import { bot } from "../src/game/bot";
function quiet(mode: (typeof MODES)[number] = "Classic") {
  const s = new Simulation("ordnance", mode);
  s.nextBoss = s.nextEncounter = 1e9;
  return s;
}
function shot(kind: Gun) {
  const s = quiet();
  s.pickup(kind);
  s.update({ x: 0, aim: 3 });
  return { s, b: s.bullets.find((b) => b.active && b.kind === kind)! };
}
function pickupOrders(a: Gun[]): Gun[][] {
  return a.flatMap((_, i) => {
    const order = [...a.slice(i), ...a.slice(0, i)];
    return [order, [...order].reverse()];
  });
}
test("every gun pickup order retains and fires the entire arsenal; duplicates level it and restart clears it", () => {
  for (const order of pickupOrders([...GUNS])) {
    const s = quiet();
    for (const kind of order) {
      s.drops.push({ id: s.id++, kind, x: 0, z: s.crowd.push + 0.1 });
      s.update({ x: 0 });
    }
    s.bullets.forEach((b) => (b.active = false));
    s.fireClock = 0;
    GUNS.forEach((k) => (s.gunClocks[k] = 0));
    s.update({ x: 0 });
    assert.deepEqual(
      new Set(s.bullets.filter((b) => b.active).map((b) => b.kind)),
      new Set(["pulse", ...GUNS]),
    );
    for (const kind of GUNS) {
      s.pickup(kind);
      assert.equal(s.guns[kind], 2);
      assert.equal(quiet().guns[kind], 0);
    }
  }
});
test("seeker curves toward an off-lane enemy and reacquires after target death", () => {
  const { s, b } = shot("seeker");
  s.spawnEnemy("Walker", 3, 24);
  const first = s.enemies[0];
  for (let i = 0; i < 40; i++) moveProjectile(b, s.enemies, 0, DT);
  assert.equal(b.target, first.id);
  assert.ok(b.x > 1.5);
  assert.ok(b.z < 15);
  first.dead = true;
  s.spawnEnemy("Walker", -2, 27);
  for (let i = 0; i < 35; i++) moveProjectile(b, s.enemies, 0, DT);
  assert.equal(b.target, s.enemies[1].id);
  assert.ok(b.vx < 0);
});
test("helix reverses laterally, shards change course reproducibly, and cursor steering is independent of movement", () => {
  const h = shot("helix").b;
  let positive = false,
    negative = false;
  for (let i = 0; i < 90; i++) {
    moveProjectile(h, [], 0, DT);
    positive ||= h.vx > 2;
    negative ||= h.vx < -2;
  }
  assert.ok(positive && negative);
  const a = shot("scatter").b,
    b = structuredClone(a);
  const velocities = [];
  for (let i = 0; i < 100; i++) {
    moveProjectile(a, [], 0, DT);
    moveProjectile(b, [], 0, DT);
    if (i % 15 === 0) velocities.push(a.vx);
  }
  assert.deepEqual(a, b);
  assert.ok(Math.max(...velocities) - Math.min(...velocities) > 3);
  const { s, b: c } = shot("cursor");
  for (let i = 0; i < 50; i++) moveProjectile(c, [], 3, DT);
  assert.ok(c.x > 2);
  for (let i = 0; i < 65; i++) moveProjectile(c, [], -3, DT);
  assert.ok(c.x < -1);
  assert.equal(s.x, 0);
});
test("shells have a visible arc, detonate after flight, and splash damages nearby targets with falloff", () => {
  const { s, b } = shot("mortar");
  const y = [];
  for (let i = 0; i < 89; i++) {
    moveProjectile(b, [], 0, DT);
    y.push(b.y);
  }
  assert.ok(Math.max(...y) > 3);
  assert.ok(y.at(-1)! < 0.8);
  s.spawnEnemy("Walker", b.x, b.z);
  s.spawnEnemy("Walker", b.x + 1, b.z);
  s.spawnEnemy("Walker", b.x + 4, b.z);
  s.enemies.forEach((e) => {
    e.hp = e.maxHp = 1000;
  });
  const [direct, near, far] = s.enemies;
  s.projectileImpact(b, b.z, true, direct);
  assert.ok(direct.hp < near.hp && near.hp < far.hp);
  assert.equal(far.hp, 1000);
  assert.ok(s.impacts.some((e) => e.active && e.kind === "mortar"));
  const real = shot("mortar");
  for (let i = 0; i < 95; i++) real.s.update({ x: 0 });
  assert.ok(real.s.impacts.some((e) => e.active && e.kind === "mortar"));
});
test("curved sweeps hit enemies and explosives travel through gates before detonating", () => {
  const { s, b } = shot("cursor");
  s.fireClock = 999;
  s.gunClocks.cursor = 999;
  s.bullets.forEach((p) => {
    if (p !== b) p.active = false;
  });
  b.x = 0;
  b.z = 5;
  b.vx = 10;
  s.spawnEnemy("Walker", 0.82, 5.6);
  s.enemies[0].hp = 100;
  s.update({ x: 0, aim: 4 });
  s.update({ x: 0, aim: 4 });
  assert.ok(s.enemies[0].hp < 100);
  const q = shot("seeker");
  q.s.fireClock = 999;
  q.s.gunClocks.seeker = 999;
  q.s.bullets.forEach((p) => {
    if (p !== q.b) p.active = false;
  });
  q.b.x = -2;
  q.b.z = 5;
  q.s.spawnGate();
  q.s.gates[0].z = 5.2;
  q.s.spawnEnemy("Walker", -2, 6);
  q.s.enemies[0].hp = 100;
  q.s.update({ x: 0 });
  assert.equal(q.b.active, true);
  assert.equal(q.s.enemies[0].hp, 100);
  assert.equal(q.s.gates[0].hitsA, q.b.gatePower);
  for (let i = 0; i < 5 && q.b.active; i++) q.s.update({ x: 0 });
  assert.equal(q.b.active, false);
  assert.ok(q.s.enemies[0].hp < 100);
  assert.equal(q.s.gates[0].hitsA, q.b.gatePower);
});
test("maximum simultaneous Mirror arsenal remains below the pool limit and preserves every firing cadence", () => {
  const s = quiet("Mirror");
  s.army = 10000;
  for (let i = 0; i < 50; i++) {
    GUNS.forEach((k) => s.pickup(k));
    for (const k of ["damage", "rate", "spread", "hero"] as const) s.pickup(k);
  }
  let peak = 0;
  const counts = new Map<string, number>();
  let last = 0;
  for (let i = 0; i < 1200; i++) {
    s.update({ x: 0, aim: Math.sin(i / 60) * 3 }, false);
    peak = Math.max(peak, s.bullets.filter((b) => b.active).length);
    for (const b of s.bullets)
      if (b.active && b.serial > last)
        counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
    last = s.shotSerial;
  }
  assert.ok(
    peak < BULLET_CAPACITY - 40,
    `${peak} projectiles leaves insufficient reserve`,
  );
  for (const k of ["pulse", ...GUNS]) assert.ok((counts.get(k) ?? 0) > 20, k);
  assert.ok(s.impacts.length === 96 && s.weaponEvents.length <= 64);
});
test("all modes replay acquired guns, curved flight, impacts, and separate quantized aim exactly", () => {
  for (const mode of MODES) {
    const a = new Simulation("arsenal-replay", mode);
    for (let i = 0; i < 10000 && !a.over; i++)
      a.update({
        x: a.drops.length
          ? mode === "Mirror"
            ? 2 * (2.45 - Math.abs(a.drops[0].x))
            : a.drops[0].x
          : bot(a),
        aim: Math.sin(i / 40) * 4.4,
      });
    assert.ok(Object.values(a.guns).some((v) => v > 0));
    const replay = JSON.parse(JSON.stringify(a.replay()));
    const b = replayRun(replay);
    assert.deepEqual(b.guns, a.guns);
    assert.deepEqual(b.bullets, a.bullets);
    assert.deepEqual(b.impacts, a.impacts);
    assert.deepEqual(b.pendingShots, a.pendingShots);
    assert.deepEqual(b.fields, a.fields);
    assert.deepEqual(b.arcEffects, a.arcEffects);
    assert.deepEqual(b.loot, a.loot);
    assert.equal(b.payloadSerial, a.payloadSerial);
    assert.equal(b.totalDamage, a.totalDamage);
    assert.deepEqual(b.enemies, a.enemies);
    assert.equal(b.rng.state, a.rng.state);
    assert.equal(b.kills, a.kills);
  }
});
