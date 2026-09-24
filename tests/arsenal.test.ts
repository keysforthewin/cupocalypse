import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, DT, replayRun } from "../src/game/simulation";
import {
  ARSENAL,
  GUNS,
  moveProjectile,
  type Gun,
} from "../src/game/projectiles";
import { BOOSTS, MODES, type Bullet } from "../src/game/types";
import {
  boostLevels,
  weaponStats,
  PICKUPS,
  BULLET_CAPACITY,
} from "../src/game/weapons";
import { ICON_SHAPES } from "../src/game/icons";
import { LootDeck } from "../src/game/loot";
const fresh = () => {
  const s = new Simulation("arsenal-test");
  s.nextBoss = s.nextEncounter = s.nextSupply = 1e9;
  s.fireClock = 1e9;
  return s;
};
function shot(s: Simulation, kind: Gun | "pulse" = "pulse") {
  s.launch(kind, 0, 0, 10);
  return s.bullets.find((b) => b.active && b.kind === kind)!;
}
function enemy(s: Simulation, x = 0, z = 10) {
  const e = s.spawnEnemy("Walker", x, z)!;
  e.hp = e.maxHp = 10000;
  e.armor = 0;
  return e;
}
test("catalog has exactly ten extra weapons and ten extra modifiers, each with original icon", () => {
  assert.equal(GUNS.length, 15);
  assert.equal(BOOSTS.length, 14);
  const keys = [...GUNS.slice(5), ...BOOSTS.slice(4)];
  assert.equal(
    new Set(keys.map((k) => JSON.stringify(ICON_SHAPES[k]))).size,
    20,
  );
  for (const k of keys) {
    assert.ok(PICKUPS[k].detail);
    assert.ok(ICON_SHAPES[k]?.length);
  }
});
test("all modifier combinations are order independent and persist in every weapon snapshot", () => {
  for (const kind of ["pulse", ...GUNS] as const) {
    const a = fresh(),
      b = fresh();
    for (const k of BOOSTS) a.pickup(k);
    for (const k of [...BOOSTS].reverse()) b.pickup(k);
    const x = shot(a, kind),
      y = shot(b, kind);
    assert.deepEqual(x, y);
    assert.ok(
      x.payload!.pierce >= 1 &&
        x.payload!.chain >= 1 &&
        x.payload!.burn > 0 &&
        x.payload!.size > 1,
    );
    assert.ok(x.payload!.radius > 0 && x.payload!.breach > 1);
    const snapshot = structuredClone(x);
    BOOSTS.forEach((k) => a.pickup(k));
    assert.deepEqual(x, snapshot);
    assert.equal(a.pendingShots.length, 1);
  }
});
test("damage, rate, size, crit and overflow upgrades keep improving with duplicates", () => {
  const levels = boostLevels();
  let previous = weaponStats(levels);
  for (let i = 1; i <= 50; i++) {
    BOOSTS.forEach((k) => levels[k]++);
    const next = weaponStats(levels);
    assert.ok(
      next.damage > previous.damage &&
        next.rate > previous.rate &&
        next.gunRate > previous.gunRate &&
        next.size > previous.size,
    );
    assert.ok(
      next.critChance <= 0.6 &&
        next.echoCount <= 3 &&
        next.chain <= 4 &&
        next.pierce <= 6,
    );
    if (i > 8)
      assert.ok(
        next.critDamage > previous.critDamage &&
          next.chainDamage > previous.chainDamage &&
          next.echoDamage > previous.echoDamage,
      );
    previous = next;
  }
});
test("Longspike pierces exactly three enemies; Phase Awl adds penetration", () => {
  for (const extra of [0, 2]) {
    const s = fresh();
    for (let i = 0; i < extra; i++) s.pickup("phase");
    const targets = Array.from({ length: 6 }, (_, i) => enemy(s, 0, 4 + i * 2));
    shot(s, "rail");
    for (let i = 0; i < 45; i++) s.update({ x: 0 }, false);
    assert.equal(targets.filter((e) => e.hp < 10000).length, 3 + extra);
  }
});
test("Titan Bore enlarges authoritative hit coverage", () => {
  const a = fresh(),
    b = fresh();
  b.pickup("titan");
  b.pickup("titan");
  const ea = enemy(a, 0.76, 1.8),
    eb = enemy(b, 0.76, 1.8);
  shot(a, "gravity");
  shot(b, "gravity");
  // Use a non-explosive payload to isolate contact width.
  for (const s of [a, b]) {
    const p = s.bullets.find((p) => p.active)!;
    p.kind = "saw";
    p.payload!.radius = 0;
    p.ricochets = 0;
  }
  for (let i = 0; i < 8; i++) {
    a.update({ x: 0 }, false);
    b.update({ x: 0 }, false);
  }
  assert.equal(ea.hp, 10000);
  assert.ok(eb.hp < 10000);
});
test("chain arcs visit distinct targets, stop at gates, and never recurse", () => {
  const s = fresh();
  s.pickup("fork");
  const targets = [
    enemy(s, 0, 10),
    enemy(s, 1, 10),
    enemy(s, 2, 10),
    enemy(s, 3, 10),
    enemy(s, 4, 10),
  ];
  const b = shot(s, "storm");
  s.projectileImpact(b, 10, true, targets[0]);
  assert.equal(targets.filter((e) => e.hp < 10000).length, 4);
  assert.equal(s.arcEffects.length, 3);
  assert.equal(s.pendingShots.length, 0);
  const blocked = fresh();
  const first = enemy(blocked, -2, 10),
    beyond = enemy(blocked, -2, 12);
  blocked.spawnGate();
  blocked.gates[0].z = 11;
  blocked.projectileImpact(shot(blocked, "storm"), 10, true, first);
  assert.equal(beyond.hp, 10000);
});
test("burn hits add damage over time; armor bonuses and unarmored bonuses are distinct", () => {
  const s = fresh();
  s.pickup("ember");
  const e = enemy(s);
  const b = shot(s);
  b.active = false;
  s.projectileImpact(b, 10, true, e);
  s.projectileImpact(b, 10, true, e);
  const immediate = e.hp;
  for (let i = 0; i < 60; i++) s.update({ x: 0 }, false);
  assert.ok(e.hp < immediate - 0.7);
  assert.ok(e.burns!.length <= 120);
  const q = fresh();
  q.pickup("breach");
  const armor = enemy(q);
  armor.armor = 100;
  q.damagePayload(armor, 10, shot(q).payload);
  assert.equal(armor.armor, 86.5);
  assert.equal(armor.hp, 10000);
  armor.armor = 0;
  q.damagePayload(armor, 10, shot(q).payload);
  assert.equal(armor.hp, 9989.5);
});
test("native fields, freeze and stagger respect boss and committed-attack constraints", () => {
  for (const kind of ["cryo", "sonic"] as const) {
    const s = fresh(),
      e = enemy(s);
    e.prepareUntil = 100;
    s.projectileImpact(shot(s, kind), 10, true, e);
    assert.ok((kind === "cryo" ? e.slowUntil! : e.staggerUntil!) > s.tick);
    assert.equal(e.prepareUntil, 100);
  }
  const s = fresh(),
    e = enemy(s, 1),
    boss = s.spawnEnemy("Bulwark", 1, 10, true)!;
  s.projectileImpact(shot(s, "gravity"), 10, true);
  s.updatePayloads(0);
  assert.ok(e.x < 1);
  assert.equal(boss.x, 1);
  const hp = e.hp;
  for (let i = 0; i < 12; i++) {
    s.tick++;
    s.updatePayloads(0);
  }
  assert.ok(e.hp < hp);
  assert.ok(s.fields.some((f) => f.active));
});
test("cluster fragments do not split again; returning blades reset target history only on reversal", () => {
  const s = fresh(),
    b = shot(s, "cluster");
  s.splitCluster(b);
  const fragments = s.bullets.filter((p) => p.active);
  assert.equal(fragments.length, 5);
  s.splitCluster(fragments[0]);
  assert.equal(s.bullets.filter((p) => p.active).length, 5);
  const c = shot(fresh(), "crescent");
  c.hitIds = [7];
  c.age = 0.94;
  moveProjectile(c, [], 0, DT);
  assert.equal(c.returning, true);
  assert.deepEqual(c.hitIds, []);
  c.hitIds = [7];
  moveProjectile(c, [], 0, DT);
  assert.deepEqual(c.hitIds, [7]);
  assert.ok(c.z < c.previous);
});
test("echoes repeat the snapshot once per level without recursively scheduling", () => {
  const s = fresh();
  s.pickup("echo");
  const b = shot(s);
  const original = b.damage;
  b.active = false;
  s.pickup("warhead");
  for (let i = 0; i < 12; i++) s.update({ x: 0 }, false);
  const echo = s.bullets.find((p) => p.active)!;
  assert.equal(echo.damage, original * weaponStats({ echo: 1 }).echoDamage);
  assert.equal(echo.payload!.echoCount, 0);
  assert.equal(s.pendingShots.length, 0);
});
test("scheduled supplies have twice the spacing in each phase", () => {
  const s = fresh();
  for (const [distance, bossIndex, spacing] of [
    [50, 0, 72],
    [160, 0, 56],
    [500, 1, 32],
  ]) {
    s.distance = distance;
    s.bossIndex = bossIndex;
    s.supply(0);
    assert.equal(s.nextSupply - s.distance, spacing);
  }
});
test("ordinary enemy loot uses a six percent eligible drop chance", () => {
  for (const roll of [0.059, 0.061]) {
    const s = fresh();
    s.bossIndex = 1;
    s.loot.rng.next = () => roll;
    s.kill(enemy(s));
    assert.equal(s.drops.length, roll < 0.06 ? 1 : 0);
  }
});
test("post-boss supplies are independent of waves; enemy pity and cooldown start only afterward", () => {
  const s = fresh();
  s.nextSupply = 0;
  s.update({ x: 0 }, false);
  assert.equal(s.drops.length, 0);
  s.bossIndex = 1;
  s.update({ x: 0 }, false);
  assert.equal(s.drops.length, 1);
  assert.ok(Math.abs(s.nextSupply - s.distance - 32) < 1e-6);
  s.drops = [];
  s.loot.rng.next = () => 0.8;
  for (let i = 0; i < 19; i++) s.kill(enemy(s));
  assert.equal(s.drops.length, 0);
  s.kill(enemy(s));
  assert.equal(s.drops.length, 1);
  for (let i = 0; i < 20; i++) s.kill(enemy(s));
  assert.equal(s.drops.length, 1);
  s.tick += 599;
  s.kill(enemy(s));
  assert.equal(s.lootEligibleMisses, 0);
  s.tick++;
  s.kill(enemy(s));
  assert.equal(s.lootEligibleMisses, 1);
});
test("boss victories award one pickup and alternate gear categories; contact escape awards none", () => {
  const s = fresh();
  const boss = s.spawnEnemy("Bulwark", 0, 20, true)!;
  s.kill(boss);
  assert.equal(s.bossKills, 1);
  assert.equal(s.bossIndex, 1);
  assert.equal(s.drops.length, 1);
  assert.ok(GUNS.includes(s.drops[0].kind as Gun));
  assert.equal(s.nextSupply, s.distance + 10);
  s.kill(s.spawnEnemy("Broodmass", 0, 20, true)!);
  assert.equal(s.drops.length, 2);
  assert.ok(BOOSTS.includes(s.drops[1].kind as any));
  const escaped = fresh();
  escaped.endBoss();
  assert.equal(escaped.bossKills, 0);
  assert.equal(escaped.drops.length, 0);
});
test("loot bags cover complete categories and leave encounter RNG untouched", () => {
  const a = new LootDeck("test"),
    b = new LootDeck("test");
  const weapons = Array.from({ length: 15 }, () => a.draw("weapon", {}));
  assert.equal(new Set(weapons).size, 15);
  assert.deepEqual(
    weapons,
    Array.from({ length: 15 }, () => b.draw("weapon", {})),
  );
  assert.equal(
    new Set(Array.from({ length: 14 }, () => a.draw("modifier", {}))).size,
    14,
  );
  const s = fresh(),
    before = s.rng.state;
  s.supply(0);
  s.supply(0);
  assert.equal(s.rng.state, before);
});
test("fully stacked Mirror arsenal has bounded storage and fires every family", () => {
  const s = new Simulation("stress", "Mirror", [5, 5, 5]);
  s.nextBoss = s.nextEncounter = s.nextSupply = 1e9;
  s.army = 10000;
  for (let n = 0; n < 50; n++) {
    GUNS.forEach((k) => s.pickup(k));
    BOOSTS.forEach((k) => s.pickup(k));
  }
  const kinds = new Set<string>();
  let peak = 0;
  for (let i = 0; i < 240; i++) {
    s.update({ x: 0 }, false);
    for (const b of s.bullets) if (b.active) kinds.add(b.kind);
    peak = Math.max(peak, s.bullets.filter((b) => b.active).length);
  }
  assert.equal(s.droppedShots, 0);
  assert.equal(s.droppedSchedules, 0);
  assert.equal(kinds.size, 16);
  assert.ok(peak < BULLET_CAPACITY - 100, `${peak}`);
  assert.ok(s.pendingShots.length < 4096);
  assert.ok(
    s.fields.length <= 48 &&
      s.arcEffects.length <= 64 &&
      s.weaponEvents.length <= 64,
  );
});

test("boss loot is placed ahead of a collecting formation in all six modes", () => {
  for (const mode of MODES) {
    const s = new Simulation("boss-loot", mode);
    s.kill(s.spawnEnemy("Bulwark", 0, 20, true)!);
    s.nextBoss = s.nextEncounter = s.nextSupply = 1e9;
    for (let i = 0; i < 180; i++) s.update({ x: 0 }, false);
    assert.equal(s.pickupsCollected, 1, mode);
  }
});
test("Ripsaw redirects into moving off-lane targets and Stitcher spaces three needles", () => {
  const s = fresh();
  const targets = [enemy(s, 0, 3), enemy(s, 2, 7), enemy(s, -1, 12)];
  shot(s, "saw");
  for (let i = 0; i < 45; i++) s.update({ x: 0 }, false);
  assert.equal(targets.filter((e) => e.hp < 10000).length, 3);
  const q = fresh();
  q.pickup("needle");
  q.update({ x: 0 }, false);
  assert.equal(
    q.bullets.filter((b) => b.active && b.kind === "needle").length,
    1,
  );
  assert.equal(q.pendingShots.length, 2);
  for (let i = 0; i < 12; i++) q.update({ x: 0 }, false);
  assert.equal(
    q.bullets.filter((b) => b.active && b.kind === "needle").length,
    3,
  );
  assert.equal(q.pendingShots.length, 0);
});
