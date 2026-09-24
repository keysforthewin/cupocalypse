import test from "node:test";
import assert from "node:assert/strict";
import {
  Simulation,
  gateResult,
  improveGate,
  replayRun,
  LANES,
  MOVE_SPEED,
} from "../src/game/simulation";
import { MODES, BOSSES, ENEMIES } from "../src/game/types";
import {
  fresh,
  purchase,
  settle,
  PRICES,
  claimEarnings,
  earnings,
  purchaseSuper,
} from "../src/game/persistence";
const clean = () => {
  const s = new Simulation("test");
  s.nextEncounter = 1e9;
  s.nextBoss = 1e9;
  return s;
};
test("gate operations, floor division, and Sudden Death precedence", () => {
  assert.equal(gateResult(11, "÷", 2, "Classic"), 5);
  assert.equal(gateResult(10, "×", 1.5, "Classic"), 15);
  assert.equal(gateResult(10, "−", 15, "Classic"), 0);
  assert.equal(gateResult(10, "+", 50, "Sudden Death"), 10);
  assert.equal(gateResult(10, "×", 4, "Sudden Death"), 10);
});
test("gates absorb fire, reveal, improve, and only apply once", () => {
  const s = clean();
  s.mode = "Reverse";
  s.spawnGate();
  const g = s.gates[0];
  g.z = 4;
  g.left = "+";
  g.a = 10;
  improveGate(g, "a", 4, s.mode);
  assert.equal(g.a, 14);
  assert.equal(g.revealed, true);
  s.x = -2;
  for (let i = 0; i < 35; i++) s.update({ x: -2 });
  const army = s.army;
  assert.equal(g.passed, true);
  assert.equal(g.passage?.side, "a");
  for (let i = 0; i < 50; i++) s.update({ x: -2 });
  assert.equal(s.gates.length, 0);
  assert.equal(s.army, army);
  assert.ok(army >= 38);
});
test("armor absorbs fire, breaks permanently; contact excludes armor", () => {
  const s = clean(),
    e = s.spawnEnemy("Riot Guard", 0, 1)!;
  s.damageEnemy(e, 10);
  assert.equal(e.hp, e.maxHp);
  assert.equal(e.armor, 25);
  s.damageEnemy(e, 26);
  assert.equal(e.armor, 0);
  assert.equal(e.hp, e.maxHp - 1);
  const a = clean();
  a.army = 100;
  a.shield = 0;
  const other = a.spawnEnemy("Riot Guard", 0, 0.4)!;
  a.fireClock = 100;
  a.update({ x: 0 });
  assert.equal(a.army, 100 - other.hp);
});
test("permanent weapon levels stack while shields remain finite", () => {
  const s = clean();
  s.pickup("rate");
  s.tick = 300;
  s.pickup("rate");
  s.pickup("damage");
  assert.equal(s.boosts.rate, 2);
  assert.equal(s.boosts.damage, 1);
  s.shield = 15;
  s.hitSquad(20, "test");
  assert.equal(s.shield, 0);
  assert.equal(s.army, 19);
});
test("committed warnings remain escapable and do not change under scream buffs", () => {
  const s = clean();
  const a = s.warn(1, [0, 1], "slam", 10, 1.6);
  const deadline = a.strikeAt;
  s.x = 3;
  s.spawnEnemy("Screamer", 0, 20)!.cooldown = 0;
  for (let i = 0; i < 30; i++) s.update({ x: 3 });
  assert.deepEqual(a.lanes, [0, 1]);
  assert.equal(a.strikeAt, deadline);
  assert.ok((a.strikeAt - a.warnAt) / 60 >= 6 / MOVE_SPEED);
});
test("hazard combinations preserve reachable safe lanes", () => {
  for (const mode of MODES) {
    const s = clean();
    s.mode = mode;
    for (let n = 0; n < 20; n++)
      s.warn(n, [n % 3, (n + 1) % 3], "pool", 10, 1.7, 2);
    for (let n = 1; n < s.hazards.length; n++) {
      const h = s.hazards[n],
        previous = s.hazards[n - 1];
      assert.ok(h.warnAt > previous.endAt);
      assert.ok(h.lanes.length < 3);
      assert.ok((h.strikeAt - h.warnAt) / 60 >= 6 / MOVE_SPEED);
    }
  }
});
test("Bloater chains and Carrier cancellation", () => {
  const s = clean();
  const b = s.spawnEnemy("Bloater", 0, 15)!,
    b2 = s.spawnEnemy("Bloater", 0, 16)!,
    w = s.spawnEnemy("Walker", 0, 17)!;
  s.kill(b);
  assert.ok(b2.dead && w.dead);
  const carrier = s.spawnEnemy("Carrier", 0, 20)!;
  s.kill(carrier);
  for (let i = 0; i < 500; i++) s.update({ x: 3 });
  assert.equal(s.enemies.filter((e) => e.kind === "Crawler").length, 0);
});
test("each boss transitions, clears arena on kill, and holds its mandatory arena", () => {
  for (const kind of BOSSES) {
    const s = clean();
    s.bossActive = true;
    const e = s.spawnEnemy(kind, 0, 20, true)!;
    s.damageEnemy(e, e.armor + e.hp * 0.6);
    s.update({ x: 0 });
    assert.equal(e.phase, 2);
    for (let phase = 0; phase < 3 && !e.dead; phase++) {
      s.tick = Math.max(s.tick, e.phaseUntil ?? 0);
      s.damageEnemy(e, 1e9);
      if (!e.dead) s.update({ x: 0 });
    }
    assert.equal(s.bossKills, 1);
    assert.equal(s.bossActive, false);
    const c = clean();
    c.army = 600;
    c.shield = 20;
    const boss = c.spawnEnemy(kind, 0, 0.5, true)!;
    c.fireClock = 100;
    c.update({ x: 0 });
    assert.equal(c.army, 600);
    assert.equal(boss.dead, false);
    assert.equal(c.bossIndex, 0);
    assert.equal(c.bossKills, 0);
  }
});
test("Fortress applies same scrolling speed to all regular movement classes", () => {
  const s = clean();
  s.mode = "Fortress";
  for (const kind of ENEMIES) s.spawnEnemy(kind, 0, 40);
  s.update({ x: 3 });
  assert.equal(new Set(s.enemies.map((e) => e.z)).size, 1);
});
test("identical tick inputs reproduce all six modes", () => {
  for (const mode of MODES) {
    const s = new Simulation("replay", mode);
    for (let i = 0; i < 12000 && !s.over; i++)
      s.update({ x: Math.round(Math.sin(i / 400) * 3 * 1000) / 1000 });
    const r = replayRun(s.replay());
    assert.equal(r.army, s.army);
    assert.equal(r.distance, s.distance);
    assert.equal(r.kills, s.kills);
    assert.equal(r.rng.state, s.rng.state);
    assert.deepEqual(r.enemies, s.enemies);
    assert.deepEqual(r.hazards, s.hazards);
  }
});
test("effects bounded, restart is clean, debug cannot progress", () => {
  const s = clean();
  for (let i = 0; i < 1000; i++) s.effect(0, 10, "blood");
  assert.equal(s.effects.filter((e) => e.active).length, 180);
  for (let i = 0; i < 150; i++) s.update({ x: 0 });
  assert.equal(s.effects.filter((e) => e.active).length, 0);
  const n = clean();
  assert.equal(n.kills, 0);
  assert.equal(n.effects.filter((e) => e.active).length, 0);
  s.debug = true;
  s.distance = 1000;
  assert.deepEqual(settle(fresh(), s), fresh());
});
test("purchases have five levels, require currency and do not mutate profile", () => {
  const p = fresh();
  p.currency = 50000;
  let q = p;
  for (let i = 0; i < 5; i++) q = purchase(q, 0);
  assert.equal(q.upgrades[0], 5);
  assert.equal(p.upgrades[0], 0);
  assert.equal(q.currency, 50000 - PRICES.reduce((a, b) => a + b, 0));
  assert.equal(purchase(q, 0), q);
  assert.equal(purchase(fresh(), 0).upgrades[0], 0);
});

test("Armory credits can be spent mid-run and are not paid twice on reopening or settlement", () => {
  const s = clean();
  s.distance = 200;
  let p = claimEarnings(fresh(), s);
  let claimed = earnings(s);
  assert.equal(p.currency, 50);
  p = purchaseSuper(p, "doc");
  assert.equal(p.currency, 0);
  assert.deepEqual(p.ownedSuperWeapons, ["doc"]);
  p = claimEarnings(p, s, claimed);
  assert.equal(p.currency, 0);
  s.distance = 400;
  s.bossKills = 1;
  p = claimEarnings(p, s, claimed);
  claimed = earnings(s);
  assert.equal(p.currency, 150);
  s.distance = 600;
  p = settle(p, s, claimed);
  assert.equal(p.currency, 200);
  assert.equal(p.runs, 1);
  assert.equal(p.records.Classic, 600);
  s.debug = true;
  assert.equal(claimEarnings(p, s).currency, 200);
});

test("operation seeds reach encounter generation and reproduce the same map", () => {
  const map = (seed: string) => {
    const s = new Simulation(seed);
    for (let i = 0; i < 8; i++) {
      s.distance = i * 20;
      s.generate();
    }
    return {
      enemies: s.enemies.map(({ kind, x, z, cooldown }) => ({
        kind,
        x,
        z,
        cooldown,
      })),
      gates: s.gates,
    };
  };
  assert.deepEqual(map("seed-check-a"), map("seed-check-a"));
  assert.notDeepEqual(map("seed-check-a"), map("seed-check-b"));
});
