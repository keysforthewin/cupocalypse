import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, improveGate } from "../src/game/simulation";
import { MODES } from "../src/game/types";

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
        // Three plasma projectiles, or six for the two half-width formations.
        assert.equal(g.hitsA - before, mode === "Mirror" ? 12 : 6);
        assert.equal(g.a, mode === "Sudden Death" ? 0 : g.hitsA);
        if (previousHitTick) assert.ok(s.tick - previousHitTick <= 6);
        previousHitTick = s.tick;
      }
      assert.equal(g.hitsB, 0);
    }
    assert.ok(
      impacts >= 15,
      `${mode}: sustained fire should tick up many times per second`,
    );
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
