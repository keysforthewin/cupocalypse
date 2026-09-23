import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, gateResult } from "../src/game/simulation";
import { BOSSES, ENEMIES, MODES } from "../src/game/types";
import { activeMotion, motionReleaseTick } from "../src/game/attacks";
import { characterPose } from "../src/render/motion";
import { weaponStats } from "../src/game/weapons";

function arena(
  kind: (typeof BOSSES)[number] | (typeof ENEMIES)[number],
  phase = 1,
) {
  const s = new Simulation("motion");
  s.nextBoss = s.nextEncounter = 1e9;
  s.fireClock = 1e9;
  const e = s.spawnEnemy(
    kind,
    0,
    22,
    BOSSES.includes(kind as (typeof BOSSES)[number]),
  )!;
  s.bossActive = e.boss;
  e.cooldown = 0;
  e.phase = phase;
  s.update({ x: 3 });
  return { s, e };
}
test("every boss attack and phase has an authored impact synchronized to its damage deadline", () => {
  for (const name of BOSSES.slice(0, 3))
    for (const phase of [1, 2]) {
      const { s, e } = arena(name, phase);
      assert.equal(e.motions.length, s.hazards.length);
      for (const [i, h] of s.hazards.entries()) {
        const m = e.motions[i];
        assert.equal(m.strike, h.strikeAt);
        assert.equal(m.start, h.warnAt);
        assert.equal(activeMotion(e, h.strikeAt), m);
        const release = motionReleaseTick(m);
        const wind = characterPose(e, release - 14),
          impact = characterPose(e, release);
        assert.notDeepEqual(wind.joints, impact.joints);
        assert.ok(
          Math.abs(wind.joints.spine[0] - impact.joints.spine[0]) > 0.4,
        );
        for (let tick = m.start; tick < m.strike + 60; tick++) {
          const p = characterPose(e, tick);
          for (const angles of Object.values(p.joints))
            assert.ok(angles.every(Number.isFinite));
        }
      }
    }
});
test("Broodmass and Carrier release offspring on the animated release tick, and death cancels a summon", () => {
  for (const kind of ["Broodmass", "Carrier"] as const) {
    const s = new Simulation("release");
    s.nextBoss = s.nextEncounter = 1e9;
    s.fireClock = 1e9;
    const e = s.spawnEnemy(kind, 0, 24, kind === "Broodmass")!;
    e.attacks = kind === "Broodmass" ? 1 : 0;
    e.cooldown = 0;
    s.update({ x: 3 });
    const motion = e.motions[0];
    assert.equal(motion.kind, "summon");
    s.tick = motion.strike - 2;
    s.update({ x: 3 });
    assert.equal(s.enemies.length, 1);
    s.update({ x: 3 });
    assert.equal(
      s.enemies.filter((e) => e.kind === "Crawler").length,
      kind === "Broodmass" ? 4 : 2,
    );
    const next = arena("Carrier");
    next.s.kill(next.e);
    for (let i = 0; i < 100; i++) next.s.update({ x: 3 });
    assert.equal(next.s.enemies.length, 0);
  }
});
test("interrupted casts cancel future damage while released pools persist", () => {
  const { s, e } = arena("Spitter");
  s.kill(e);
  assert.equal(s.hazards.length, 0);
  const next = arena("Spitter");
  next.s.tick = next.s.hazards[0].strikeAt;
  next.s.kill(next.e);
  assert.equal(next.s.hazards.length, 1);
});
test("burst animation recoils on all three individual shots", () => {
  const { e } = arena("Gunner");
  assert.equal(e.motions.length, 3);
  for (const m of e.motions) assert.equal(activeMotion(e, m.strike), m);
});
test("locomotion varies by character, remains deterministic, and returns after attack recovery", () => {
  for (const kind of [...ENEMIES, ...BOSSES]) {
    const { e } = arena(kind);
    const tick = (e.motions.at(-1)?.strike ?? 0) + 100;
    const p = characterPose(e, tick);
    assert.deepEqual(characterPose(e, tick), p);
    assert.notDeepEqual(characterPose(e, tick + 20).joints, p.joints);
    const clean = { ...e, motions: [] };
    assert.deepEqual(characterPose(clean, tick), p);
  }
});
test("opening combat is paced gently with reliable supplies in every mode", () => {
  for (const mode of MODES) {
    const s = new Simulation("cadence", mode);
    s.nextBoss = 1e9;
    s.shield = 1e9;
    const arrivals: number[] = [],
      supplies: number[] = [];
    let previous = s.encounterIndex,
      lastSupply = 0;
    for (let i = 0; i < 60 * 30; i++) {
      s.update({ x: 0 }, false);
      if (s.encounterIndex !== previous) {
        arrivals.push(s.time);
        previous = s.encounterIndex;
      }
      for (const d of s.drops)
        if (d.id > lastSupply) {
          supplies.push(s.time);
          lastSupply = d.id;
        }
    }
    assert.ok(arrivals[0] < 0.1);
    assert.ok(arrivals.length >= 9);
    assert.ok(arrivals[1] - arrivals[0] > 3);
    for (let i = 1; i < arrivals.length; i++)
      assert.ok(arrivals[i] - arrivals[i - 1] < 3.5);
    assert.ok(supplies[0] < 6);
    assert.equal(supplies.length, 2);
    assert.ok(supplies[1] - supplies[0] >= 22.5);
    assert.ok(supplies[1] - supplies[0] <= 26);
  }
});
test("formation growth is uncapped and missed attacks still matter to large armies", () => {
  assert.equal(gateResult(500, "×", 50, "Classic"), 25000);
  const s = new Simulation();
  s.army = 600;
  const small = s.threatDamage(32, true);
  s.distance = 700;
  assert.ok(s.threatDamage(32, true) > small);
  assert.ok(small >= 118);
  s.pickup("recruit");
  assert.equal(s.army, 620);
  const early = weaponStats({ damage: 1, hero: 1, spread: 1, rate: 1 });
  const late = weaponStats({ damage: 25, hero: 25, spread: 25, rate: 25 });
  assert.ok(late.damage > early.damage);
  assert.ok(late.damage < 6);
});

test("supply rotation exposes every pickup and opens Swarm with crowd-clearing firepower", () => {
  for (const mode of MODES) {
    const s = new Simulation("supplies", mode);
    const seen = new Set<string>();
    let first = "";
    for (let i = 0; i < 300; i++) {
      s.distance = s.nextSupply;
      s.generate();
      for (const d of s.drops) {
        seen.add(d.kind);
        first ||= d.kind;
      }
      s.drops = [];
      s.enemies = [];
    }
    assert.equal(seen.size, 31);
    assert.equal(first, mode === "Swarm" ? "helix" : "seeker");
  }
});

test("sidestep velocity follows actual movement, holds on pause and resets immediately on restart", async () => {
  const { advanceSquadMotion } = await import("../src/render/squadMotion");
  const s = new Simulation("stride");
  s.nextBoss = s.nextEncounter = 1e9;
  const state = { simulation: s, tick: s.tick, x: s.x, velocity: 0 };
  for (let i = 0; i < 12; i++) {
    s.update({ x: 3 });
    advanceSquadMotion(state, s);
  }
  assert.ok(state.velocity > 0.9);
  const held = state.velocity;
  advanceSquadMotion(state, s);
  assert.equal(state.velocity, held);
  for (let i = 0; i < 20; i++) {
    s.update({ x: -3 });
    advanceSquadMotion(state, s);
  }
  assert.ok(state.velocity < -0.9);
  const fresh = new Simulation("restart");
  advanceSquadMotion(state, fresh);
  assert.equal(state.velocity, 0);
  for (let i = 0; i < 12; i++) {
    fresh.update({ x: 3 });
    advanceSquadMotion(state, fresh);
  }
  assert.ok(state.velocity > 0.9);
});

test("combat gates retain alternating barricade encounters after the safe opening", () => {
  const s = new Simulation("barricades");
  for (let i = 0; i < 11; i++) {
    s.distance = i * 7.5;
    s.generate();
  }
  assert.equal(s.gates.length, 3);
  assert.equal(s.gates[0].wall, -1);
  assert.ok(s.gates[1].wall >= 0);
  assert.equal(s.gates[2].wall, -1);
});
