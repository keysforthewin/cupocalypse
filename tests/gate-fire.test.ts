import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, improveGate } from "../src/game/simulation";
import { MODES } from "../src/game/types";
import { GATE_PASS_TICKS } from "../src/game/gateLayout";

test("each hit changes signs immediately, including crossing from minus to plus", () => {
  const s = new Simulation("signs", "Reverse");
  s.spawnGate();
  const g = s.gates[0];
  Object.assign(g, { left: "−", a: 2, right: "×", b: 1.6 });
  for (const expected of [1, 0, 1, 2]) {
    improveGate(g, "a", 1, s.mode);
    assert.equal(g.a, expected);
    assert.equal(g.revealed, true);
  }
  assert.equal(g.left, "+");
  improveGate(g, "b", 1, s.mode);
  assert.equal(g.b, 1.61, "multipliers keep improving beyond the old ceiling");
  Object.assign(g, { right: "÷", b: 1.2 });
  for (const expected of [1.1, 1, 1]) {
    improveGate(g, "b", 1, s.mode);
    assert.equal(g.b, expected);
  }
});

test("live spread volleys count every projectile at impact in all modes", () => {
  for (const mode of MODES) {
    const s = new Simulation("rapid-sign", mode);
    s.nextBoss = s.nextEncounter = 1e9;
    s.x = -3;
    s.pickup("spread");
    s.pickup("damage");
    s.pickup("rate");
    s.spawnGate();
    const g = s.gates[0];
    Object.assign(g, { z: 25, left: "+", a: 0, right: "+", b: 0 });
    let impacts = 0;
    let previousHitTick = 0;
    for (let tick = 0; tick < 120; tick++) {
      const before = g.hitsA;
      s.update({ x: -3 });
      if (g.hitsA > before) {
        impacts++;
        // Three plasma projectiles, or six for the two half-width formations,
        // each charging the sign by its (quartered, capped) gate power.
        const power = s.bullets.find((b) => b.kind === "pulse")!.gatePower;
        assert.ok(power > 0 && power <= 2);
        assert.ok(
          Math.abs(g.hitsA - before - (mode === "Mirror" ? 6 : 3) * power) <
            1e-9,
        );
        assert.ok(
          Math.abs(g.a - (mode === "Sudden Death" ? 0 : g.hitsA)) < 1e-6,
        );
        if (previousHitTick) assert.ok(s.tick - previousHitTick <= 12);
        previousHitTick = s.tick;
      }
      assert.equal(g.hitsB, 0);
    }
    assert.ok(
      impacts >= 7,
      `${mode}: sustained fire should tick up several times per second`,
    );
  }
});

test("shots charge each gate once and retain full damage and piercing behind them", () => {
  for (const kind of ["pulse", "rail"] as const) {
    const s = new Simulation("shoot-through");
    s.nextBoss = s.nextEncounter = 1e9;
    s.fireClock = 999;
    s.x = -3;
    s.launch(kind, -3, 0, 10);
    const bullet = s.bullets.find((b) => b.active)!;
    const pierce = bullet.payload!.pierce;
    for (const z of [6, 8]) {
      s.spawnGate();
      Object.assign(s.gates.at(-1)!, { z, left: "+", a: 10 });
    }
    const enemy = s.spawnEnemy("Walker", -3, 14)!;
    enemy.hp = enemy.maxHp = 100;
    enemy.armor = 0;
    while (s.gates[1].hitsA === 0 && s.tick < 60) s.update({ x: -3 });
    assert.equal(bullet.active, true, kind);
    assert.equal(bullet.payload!.pierce, pierce, kind);
    assert.equal(enemy.hp, 100, kind);
    while (enemy.hp === 100 && s.tick < 120) s.update({ x: -3 });
    assert.equal(enemy.hp, 90, kind);
    assert.equal(bullet.active, kind === "rail", kind);
    for (const gate of s.gates) {
      assert.equal(gate.hitsA, bullet.gatePower, kind);
      assert.equal(gate.a, 10 + bullet.gatePower, kind);
      assert.equal(gate.hitsB, 0, kind);
    }
  }
});

test("crossed gates retain feedback for one pulse and apply their result only once", () => {
  for (const mode of MODES) {
    for (const x of [-3, 0, 3]) {
      const s = new Simulation("gate-passage", mode);
      s.nextBoss = s.nextEncounter = s.nextSupply = s.fireClock = 1e9;
      s.x = x;
      s.spawnGate();
      const g = s.gates[0];
      Object.assign(g, { z: s.crowd.push, left: "+", a: 10, right: "−", b: 3 });
      const old = s.army;
      s.update({ x });
      assert.equal(g.passed, true);
      if (x === 0) {
        assert.equal(g.passage, undefined);
        assert.equal(s.army, old);
        assert.equal(s.gates.length, 0);
        continue;
      }
      const delta = x > 0 ? -3 : mode === "Sudden Death" ? 0 : 10;
      assert.deepEqual(g.passage, {
        tick: s.tick,
        side: x < 0 ? "a" : "b",
        delta,
      });
      assert.equal(s.army, old + delta);
      for (let i = 1; i < GATE_PASS_TICKS; i++) {
        s.update({ x });
        assert.ok(s.gates.includes(g));
        assert.equal(s.army, old + delta);
      }
      s.update({ x });
      assert.equal(s.gates.length, 0);
    }
  }
});

test("bullets blocked by an enemy do not also improve the gate", () => {
  const s = new Simulation("blocked");
  s.nextBoss = s.nextEncounter = 1e9;
  s.x = -3;
  s.spawnGate();
  Object.assign(s.gates[0], { z: 10, left: "+", a: 10 });
  const enemy = s.spawnEnemy("Riot Guard", -3, 5)!;
  enemy.hp = enemy.armor = 10000;
  for (let i = 0; i < 30; i++) s.update({ x: -3 });
  assert.equal(s.gates[0].a, 10);
  assert.ok(enemy.armor < 10000);
});
