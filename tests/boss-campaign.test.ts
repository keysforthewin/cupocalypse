import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, VERSION } from "../src/game/simulation";
import { BOSSES, MODES } from "../src/game/types";
import {
  bossDefinition,
  NEW_BOSSES,
  scheduleBossAttack,
  bossProjectilePosition,
} from "../src/game/bosses";
import { reachableRoute } from "../src/game/fairness";

function arena(
  kind: (typeof BOSSES)[number],
  mode: (typeof MODES)[number] = "Classic",
) {
  const s = new Simulation("boss-contract", mode);
  s.nextBoss = s.nextEncounter = s.nextSupply = 1e9;
  s.fireClock = 1e9;
  s.bossActive = true;
  const e = s.spawnEnemy(kind, 0, 24, true)!;
  e.cooldown = 1e9;
  return { s, e };
}
test("all eight bosses hold distance and cannot be escaped by contact", () => {
  for (const kind of BOSSES) {
    const { s, e } = arena(kind);
    e.z = 0.1;
    s.distance = 150;
    s.army = 60;
    for (let n = 0; n < 180; n++) s.update({ x: 0 });
    assert.equal(s.distance, 150);
    assert.equal(s.bossIndex, 0);
    assert.equal(e.dead, false);
    assert.equal(s.army, 60);
    assert.ok(e.z >= bossDefinition(kind).arenaZ);
    s.endBoss();
    assert.equal(s.bossIndex, 0);
  }
});
test("eight sequential victories end combat once; updates and incoming damage cannot change victory", () => {
  const s = new Simulation("campaign");
  s.nextEncounter = s.nextSupply = 1e9;
  for (let i = 0; i < BOSSES.length; i++) {
    s.bossActive = true;
    s.distance = (i + 1) * 150;
    const e = s.spawnEnemy(BOSSES[i], 0, 24, true)!;
    s.kill(e);
    s.kill(e);
    assert.equal(s.bossKills, i + 1);
    assert.equal(s.bossIndex, i + 1);
    assert.equal(s.over, i === 7);
  }
  assert.equal(s.outcome, "victory");
  assert.equal(s.distance, 1200);
  assert.equal(s.hazards.length, 0);
  const army = s.army,
    tick = s.tick;
  s.update({ x: 3 });
  s.hitSquad(1e9, "late impact");
  assert.equal(s.tick, tick);
  assert.equal(s.army, army);
  assert.equal(s.outcome, "victory");
  assert.equal(VERSION, "containment-2.3.0");
});
test("final boss has three health phases; each other boss has two", () => {
  for (const kind of BOSSES) {
    const { s, e } = arena(kind);
    e.hp = e.maxHp * 0.4;
    s.update({ x: 0 });
    assert.equal(e.phase, 2);
    e.hp = e.maxHp * 0.2;
    s.update({ x: 0 });
    assert.equal(e.phase, kind === "The Last Witness" ? 3 : 2);
  }
});
test("every new attack, phase and mode has a reachable route from both road edges", () => {
  for (const mode of MODES)
    for (const kind of NEW_BOSSES)
      for (
        let phase = 1;
        phase <= bossDefinition(kind).phases.length + 1;
        phase++
      )
        for (let cycle = 0; cycle < 3; cycle++)
          for (const x of [-3.8, 3.8]) {
            const { s, e } = arena(kind, mode);
            s.x = x;
            e.phase = phase;
            e.attacks = cycle + 1;
            scheduleBossAttack(s, e, x < 0 ? 0 : 2);
            assert.ok(s.hazards.length, `${kind} missing attacks`);
            const horizon =
              (Math.max(...s.hazards.map((h) => h.endAt)) - s.tick) / 60 + 0.5;
            assert.ok(
              reachableRoute(s, horizon, false),
              `${mode}/${kind}/${phase}/${cycle}/${x}`,
            );
            assert.equal(s.hazards.length, e.motions.length);
            for (const [i, h] of s.hazards.entries()) {
              assert.equal(e.motions[i].strike, h.strikeAt);
              assert.equal(e.motions[i].clip, h.attack);
              if (h.trajectory)
                for (const lane of h.lanes) {
                  const end = bossProjectilePosition(h, lane, h.strikeAt);
                  assert.ok(Math.abs(end[0] - (lane - 1) * 3) < 1e-8);
                  assert.equal(end[2], 0);
                  assert.ok((h.releaseAt ?? 0) > h.warnAt);
                }
            }
          }
});
test("larger bosses increase physical dimensions and preserve unique attack vocabularies", () => {
  let h = 6.48,
    w = 6;
  const vocabularies = new Set<string>();
  for (const kind of NEW_BOSSES) {
    const d = bossDefinition(kind);
    assert.ok(d.height > h && d.span > w);
    h = d.height;
    w = d.span;
    const { s, e } = arena(kind);
    for (let n = 1; n <= 3; n++) {
      e.attacks = n;
      scheduleBossAttack(s, e, 1);
    }
    vocabularies.add(
      [...new Set(s.hazards.map((h) => h.attack))].sort().join(","),
    );
  }
  assert.equal(vocabularies.size, 5);
});

test("burst damage cannot skip a new boss transformation or the final third phase", () => {
  const { s, e } = arena("The Last Witness");
  for (const [phase, fraction] of [
    [2, 0.65],
    [3, 0.3],
  ]) {
    s.damageEnemy(e, 1e9);
    assert.ok(Math.abs(e.hp - e.maxHp * fraction) < 1e-6);
    assert.equal(e.dead, false);
    s.update({ x: 0 });
    assert.equal(e.phase, phase);
    const hp = e.hp;
    s.damageEnemy(e, 1e9);
    assert.equal(e.hp, hp);
    s.tick = e.phaseUntil!;
  }
  s.damageEnemy(e, 1e9);
  assert.equal(e.dead, true);
});

test("phase changes cancel unreleased attacks but preserve projectiles already in flight", () => {
  const { s, e } = arena("Widow of the Salvo");
  e.attacks = 1;
  scheduleBossAttack(s, e, 1);
  const released = s.hazards[0],
    unreleased = s.hazards[1];
  s.tick = released.releaseAt! + 1;
  e.hp = e.maxHp * 0.49;
  s.update({ x: 0 });
  assert.ok(s.hazards.some((h) => h.id === released.id));
  assert.ok(!s.hazards.some((h) => h.id === unreleased.id));
  assert.ok(e.phaseUntil! > s.tick);
});

test("identical arena inputs replay phases, hazards, projectiles and damage deterministically", () => {
  const a = arena("Seraph of the Wound"),
    b = arena("Seraph of the Wound");
  for (const { s, e } of [a, b]) {
    s.army = 200;
    s.shield = 1e6;
    e.cooldown = 0;
    s.fireClock = 0;
  }
  for (let n = 0; n < 900; n++) {
    const x = Math.sin(n / 120) * 3;
    for (const { s } of [a, b]) s.update({ x });
  }
  assert.deepEqual(a.s.replay(), b.s.replay());
  assert.deepEqual(a.s.hazards, b.s.hazards);
  assert.equal(a.e.hp, b.e.hp);
  assert.equal(a.e.phase, b.e.phase);
});
