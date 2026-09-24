import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, replayRun } from "../src/game/simulation";
import { weaponStats, BULLET_CAPACITY, boostLevels } from "../src/game/weapons";
import { MODES } from "../src/game/types";
import { bot } from "../src/game/bot";
import type { Boost } from "../src/game/types";

function permutations(items: Boost[]): Boost[][] {
  return items.length === 0
    ? [[]]
    : items.flatMap((item, i) =>
        permutations(items.filter((_, j) => i !== j)).map((rest) => [
          item,
          ...rest,
        ]),
      );
}

test("every pickup order composes with the existing weapon through actual drop collection", () => {
  for (const mode of MODES) {
    for (const order of permutations(["spread", "damage", "rate", "hero"])) {
      const s = new Simulation("combination", mode);
      s.nextBoss = s.nextEncounter = 1e9;
      let previous = weaponStats(s.boosts);
      for (const kind of order) {
        s.drops.push({
          id: s.id++,
          x: mode === "Mirror" ? -2.45 : 0,
          z: s.crowd.push + 0.2,
          kind,
        });
        s.update({ x: 0 });
        assert.equal(s.boosts[kind], 1);
        const stats = weaponStats(s.boosts);
        assert.ok(stats.offsets.length >= previous.offsets.length);
        assert.ok(stats.damage >= previous.damage);
        assert.ok(stats.rate >= previous.rate);
        s.bullets.forEach((b) => (b.active = false));
        s.fireClock = 0;
        s.update({ x: 0 });
        const volley = s.bullets.filter((b) => b.active);
        const formations = mode === "Mirror" ? 2 : 1;
        assert.equal(volley.length, stats.offsets.length * formations);
        for (const b of volley) {
          const base = 1.4 + Math.sqrt(s.army) * 0.28;
          // Fewer projectiles carry the cadence reduction as per-shot damage.
          assert.ok(
            Math.abs(
              b.damage - (base * stats.damage * stats.shotScale) / formations,
            ) < 1e-9,
          );
        }
        previous = stats;
      }
      assert.deepEqual(s.boosts, {
        ...boostLevels(),
        damage: 1,
        rate: 1,
        spread: 1,
        hero: 1,
      });
    }
  }
});

test("plasma and nova combine visually on every split projectile without changing shots already in flight", () => {
  const s = new Simulation("visual-combination");
  s.pickup("spread");
  s.update({ x: 0 });
  const oldShots = s.bullets.filter((b) => b.active);
  const appearances = oldShots.map(
    ({ coreColor, haloColor, width, length }) => ({
      coreColor,
      haloColor,
      width,
      length,
    }),
  );
  s.pickup("damage");
  s.pickup("hero");
  s.fireClock = 0;
  s.update({ x: 0 });
  assert.deepEqual(
    oldShots.map(({ coreColor, haloColor, width, length }) => ({
      coreColor,
      haloColor,
      width,
      length,
    })),
    appearances,
  );
  const newShots = s.bullets.filter((b) => b.active && !oldShots.includes(b));
  assert.equal(newShots.length, 3);
  for (const b of newShots) {
    assert.equal(b.coreColor, "#ff9855");
    assert.equal(b.haloColor, "#c7a0ff");
    assert.ok(b.width > appearances[0].width);
    assert.ok(b.length > appearances[0].length);
  }
});

test("all four weapon upgrades still fire at full power minutes after collection in every mode", () => {
  for (const mode of MODES) {
    const s = new Simulation("permanent", mode);
    s.nextBoss = s.nextEncounter = 1e9;
    for (const kind of ["damage", "rate", "spread", "hero"] as const)
      s.pickup(kind);
    const levels = { ...s.boosts };
    for (let i = 0; i < 60 * 180; i++) s.update({ x: 0 }, false);
    assert.deepEqual(s.boosts, levels);
    s.bullets.forEach((b) => (b.active = false));
    s.fireClock = 0;
    s.update({ x: 0 });
    const bullets = s.bullets.filter((b) => b.active);
    assert.equal(bullets.length, mode === "Mirror" ? 6 : 3);
    const base = 1.4 + Math.min(12, Math.sqrt(s.army) * 0.28);
    const stats = weaponStats(s.boosts);
    assert.ok(Math.abs(stats.damage - 1.74) < 1e-9);
    assert.ok(
      Math.abs(
        bullets[0].damage -
          (base * stats.damage * stats.shotScale) / (mode === "Mirror" ? 2 : 1),
      ) < 1e-9,
    );
    // Overclock still shortens the interval, just less than its damage bonus.
    assert.ok(stats.cadence > 1.2 && stats.cadence < stats.rate);
    assert.ok(
      s.fireClock < 1 / ((3 + Math.sqrt(s.army) * 0.09) * stats.cadence) + 1e-9,
    );
    assert.deepEqual(new Simulation("new-run", mode).boosts, boostLevels());
  }
});
test("duplicate pickups continually strengthen weapons and widest Mirror volleys fit the pool", () => {
  const s = new Simulation("stack", "Mirror");
  s.nextBoss = s.nextEncounter = 1e9;
  s.army = 10000;
  let prior = weaponStats(s.boosts);
  for (let level = 1; level <= 50; level++) {
    for (const kind of ["damage", "rate", "spread", "hero"] as const)
      s.pickup(kind);
    const next = weaponStats(s.boosts);
    assert.ok(next.damage > prior.damage);
    assert.ok(next.rate > prior.rate);
    assert.equal(next.offsets.length, 1 + 2 * Math.min(2, level));
    assert.equal(next.volley, 1 + 2 * Math.min(3, level));
    prior = next;
  }
  assert.ok(s.lastReward.includes("PERMANENT"));
  for (let i = 0; i < 600; i++) s.update({ x: 0 }, false);
  assert.ok(s.bullets.filter((b) => b.active).length < BULLET_CAPACITY - 14);
  s.bullets.forEach((b) => (b.active = false));
  s.fireClock = 0;
  s.update({ x: 0 });
  assert.equal(s.bullets.filter((b) => b.active).length, 10);
  assert.equal(s.boosts.hero, 50);
});
test("pickups collected through simulation survive deterministic replay", () => {
  const a = new Simulation("upgrade-replay", "Classic");
  for (let i = 0; i < 12000 && !a.over; i++)
    a.update({
      x: a.drops.length ? a.drops[0].x : bot(a),
    });
  assert.ok(
    Object.values(a.boosts).some((level) => level > 0),
    "replay fixture must actually collect a weapon",
  );
  const b = replayRun(JSON.parse(JSON.stringify(a.replay())));
  assert.deepEqual(b.boosts, a.boosts);
  assert.deepEqual(b.bullets, a.bullets);
  assert.equal(b.kills, a.kills);
});
