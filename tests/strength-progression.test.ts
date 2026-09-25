import test from "node:test";
import assert from "node:assert/strict";
import {
  attackScale,
  encounterScale,
  strengthDistance,
} from "../src/game/escalation";
import { Simulation } from "../src/game/simulation";
import { MODES } from "../src/game/types";
import { earnings, fresh, purchase, settle } from "../src/game/persistence";

const boosts = { damage: 3, rate: 3, spread: 3, hero: 3 };

test("strength preserves the opening and ramps 25 percent faster afterward", () => {
  for (const distance of [0, 20, 45, 60])
    assert.equal(strengthDistance(distance), distance);
  assert.equal(strengthDistance(150), 172.5);
  assert.equal(strengthDistance(300), 360);
  assert.equal(strengthDistance(750), 922.5);
  let previous = 0;
  for (let distance = 1; distance <= 3000; distance++) {
    const current = strengthDistance(distance);
    assert.ok(current > previous);
    assert.ok(current - previous <= 1.25, `strength spike at ${distance} m`);
    previous = current;
  }
});

test("durability ramps fully by the second boss while encounter pacing stays consistent", () => {
  // Snapshots of the pre-rebalance density, speed, and spacing for this loadout.
  for (const [distance, count, speed, spacing] of [
    [0, 0, 1, 11],
    [60, 0, 1, 10.142857142857142],
    [192, 4, 1.2092761864938857, 6.818369074997393],
    [384, 7, 1.3329393876039088, 5.211041710223126],
    [768, 7, 1.3329393876039088, 5.211041710223126],
  ]) {
    const scale = encounterScale(distance, 300, boosts);
    assert.equal(scale.extraEnemies, count);
    assert.equal(scale.speed, speed);
    assert.equal(scale.spacing, spacing);
  }
  const first = encounterScale(250, 300, boosts);
  const second = encounterScale(500, 300, boosts);
  const third = encounterScale(750, 300, boosts);
  assert.ok(first.health > 6.3 && first.health < 6.5);
  assert.ok(first.armor > 3.7 && first.armor < 3.8);
  assert.ok(second.health > 6.9 && second.armor > 4);
  assert.equal(third.health, second.health);
  assert.equal(third.armor, second.armor);
});

test("all modes escalate enemy HP, armor, contact damage, and boss attack strength", () => {
  for (const mode of MODES) {
    const samples = [250, 500, 750].map((distance) => {
      const s = new Simulation("strength-progression", mode);
      s.distance = distance;
      s.army = 100;
      s.bossIndex = 1;
      Object.assign(s.boosts, boosts);
      const guard = s.spawnEnemy("Riot Guard", 0)!;
      const boss = s.spawnEnemy("Bulwark", 0, 38, true)!;
      return {
        hp: guard.hp,
        armor: guard.armor,
        contact: s.contactDamage(guard),
        bossHp: boss.hp,
        attack: s.threatDamage(10, true),
      };
    });
    const [first, second, third] = samples;
    for (const stat of [
      "hp",
      "armor",
      "contact",
      "bossHp",
      "attack",
    ] as const) {
      assert.ok(first[stat] < second[stat], `${mode}: ${stat} should grow`);
      assert.ok(
        second[stat] < third[stat],
        `${mode}: ${stat} should peak last`,
      );
    }
    assert.ok(third.hp > second.hp * 1.25);
    assert.ok(third.armor > second.armor * 1.25);
    assert.ok(third.bossHp > second.bossHp * 1.25);
    assert.ok(first.attack > 50 && first.attack < 52);
  }
});

test("attack damage is unchanged in the opening and triples by the second boss", () => {
  for (const d of [0, 30, 60]) assert.equal(attackScale(d), 1);
  assert.equal(attackScale(150), 1.75);
  assert.equal(attackScale(300), 3);
  assert.equal(attackScale(1200), 3);
  const s = new Simulation("committed-damage");
  s.distance = 150;
  const h = s.warn(1, [0], "slam", s.threatDamage(32, true));
  const committed = h.damage;
  s.distance = 300;
  assert.ok(s.threatDamage(32, true) > committed * 2);
  assert.equal(h.damage, committed, "committed warnings keep their damage");
});

test("permanent upgrades improve survivability and firepower without raising enemy stats", () => {
  const base = new Simulation("upgrade-value");
  const upgraded = new Simulation("upgrade-value", "Classic", [5, 5, 5]);
  assert.equal(base.army, 24);
  assert.equal(upgraded.army, 72);
  for (const s of [base, upgraded]) {
    s.army = 100;
    s.distance = 300;
    s.nextBoss = s.nextEncounter = s.nextSupply = 1e9;
  }
  const a = base.spawnEnemy("Riot Guard", 0)!;
  const b = upgraded.spawnEnemy("Riot Guard", 0)!;
  assert.equal(a.hp, b.hp);
  assert.equal(a.armor, b.armor);
  assert.equal(base.threatDamage(10), upgraded.threatDamage(10));
  base.enemies = upgraded.enemies = [];
  base.update({ x: 0 });
  upgraded.update({ x: 0 });
  assert.ok(
    Math.abs(upgraded.bullets[0].damage / base.bullets[0].damage - 2.2) < 1e-9,
  );
  for (let i = 0; i < 120; i++) {
    base.update({ x: 0 });
    upgraded.update({ x: 0 });
  }
  assert.ok(upgraded.shots >= base.shots * 1.7);
});

test("four early defeats can fund a permanent upgrade; practice earns nothing", () => {
  const s = new Simulation("early-rewards");
  s.distance = 250;
  s.bossKills = 1;
  s.over = true;
  s.outcome = "defeat";
  assert.equal(earnings(s), 162);
  let profile = fresh();
  for (let run = 0; run < 4; run++) profile = settle(profile, s);
  profile = purchase(profile, 1);
  assert.equal(profile.upgrades[1], 1);
  assert.equal(profile.currency, 598);
  s.debug = true;
  assert.equal(earnings(s), 0);
});
