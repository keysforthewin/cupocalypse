import test from "node:test";
import { createHash } from "node:crypto";
import * as T from "three";
import assert from "node:assert/strict";
import { Simulation, replayRun, gateResult } from "../src/game/simulation";
import {
  SUPERS,
  SUPER_IDS,
  sanitizeLoadout,
  validSuperReplay,
  type SuperId,
} from "../src/game/superWeapons";
import {
  fresh,
  loadProfile,
  purchaseSuper,
  setSuperLoadout,
} from "../src/game/persistence";
import { bot } from "../src/game/bot";
import { MODES } from "../src/game/types";
import { superModel, disposeSuperModel } from "../src/render/superModels";
const setup = (ids: SuperId[] = ["mortal"]) => {
  const s = new Simulation("super-unit", "Classic", [0, 0, 0], ids);
  s.nextEncounter = s.nextBoss = s.nextSupply = 1e9;
  s.fireClock = 1e6;
  s.shield = 0;
  return s;
};
const arm = (s: Simulation, i = 0) => {
  s.supers.selected = i;
  s.supers.charge = s.supers.quota;
  assert.equal(s.supers.activate(), true);
  return s.supers.casts.at(-1)!;
};
const ticks = (s: Simulation, n: number) => {
  for (let i = 0; i < n; i++) {
    s.tick++;
    s.supers.update();
  }
};
const foe = (s: Simulation, x = 0, z = 20, boss = false) =>
  s.spawnEnemy(boss ? "Bulwark" : "Walker", x, z, boss)!;

test("catalog contains all 27 exact names, unique glyphs and authored models", () => {
  assert.equal(SUPER_IDS.length, 27);
  assert.deepEqual(
    SUPER_IDS.map((id) => SUPERS[id].name),
    [
      "Mortal",
      "Keys",
      "Sybex",
      "Tuna",
      "Nitro",
      "Baezil",
      "Pauly",
      "MachineGunQueen",
      "Meesh",
      "Zunneh",
      "Rae",
      "Doc",
      "Kismet",
      "Mmiguel",
      "Strawberry",
      "Nemesis",
      "Bronze Leopard",
      "Five10",
      "Shannondoa",
      "Kuttula",
      "Gimmy",
      "Haut Carl",
      "Hondo",
      "Panda",
      "Pokey",
      "Platypus",
      "So1ician",
    ],
  );
  assert.equal(new Set(SUPER_IDS.map((id) => SUPERS[id].glyph)).size, 27);
  const signatures = [];
  for (const id of SUPER_IDS) {
    const model = superModel(id);
    assert.ok(model.children.length > 0);
    // Material batching bakes transforms into vertices. Compare the rendered
    // geometry, not the now-identical identity transforms of the batches.
    const hash = createHash("sha256");
    let vertices = 0,
      meshes = 0;
    model.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      meshes++;
      const positions = o.geometry.getAttribute("position");
      const normals = o.geometry.getAttribute("normal");
      assert.ok(positions && normals, `${id}: missing geometry attributes`);
      assert.ok(
        Array.from(positions.array).every(Number.isFinite),
        `${id}: invalid vertex`,
      );
      assert.ok(
        Array.from(normals.array).every(Number.isFinite),
        `${id}: invalid normal`,
      );
      vertices += positions.count;
      hash.update(Buffer.from(positions.array.buffer));
    });
    assert.ok(
      vertices > 100 && vertices < 200000,
      `${id}: bounded authored geometry`,
    );
    assert.ok(
      meshes <= (id === "panda" ? 8 : 6),
      `${id}: actual mesh draw budget`,
    );
    signatures.push(hash.digest("hex"));
    disposeSuperModel(model);
  }
  assert.equal(new Set(signatures).size, 27);
});
test("profile migration, permanent purchases and unique three-slot loadouts", () => {
  let p = fresh();
  assert.deepEqual(p.superLoadout, []);
  assert.deepEqual(p.ownedSuperWeapons, []);
  assert.equal(p.helpVisible, true);
  assert.equal(purchaseSuper(p, "mortal"), p);
  p = { ...p, currency: 5000 };
  for (const id of ["mortal", "doc", "panda", "keys"] as SuperId[])
    p = purchaseSuper(p, id);
  assert.equal(p.currency, 5000 - 1000 - 50 - 1000 - 500);
  assert.equal(purchaseSuper(p, "mortal"), p);
  p = setSuperLoadout(p, ["mortal", "doc", "mortal", "keys", "panda"]);
  assert.deepEqual(p.superLoadout, ["mortal", "doc", "keys"]);
  assert.deepEqual(setSuperLoadout(p, ["rae"]).superLoadout, []);
  const old = {
    currency: 999,
    upgrades: [1, 2, 3],
    records: { Classic: 500 },
    runs: 7,
  };
  const storage = { getItem: () => JSON.stringify(old) };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  const migrated = loadProfile();
  assert.equal(migrated.currency, 999);
  assert.deepEqual(migrated.upgrades, [1, 2, 3]);
  assert.deepEqual(migrated.superLoadout, []);
  storage.getItem = () =>
    JSON.stringify({
      ...old,
      ownedSuperWeapons: ["doc", "doc", "garbage"],
      superLoadout: ["doc", "mortal"],
      helpVisible: false,
    });
  const saved = loadProfile();
  assert.deepEqual(saved.ownedSuperWeapons, ["doc"]);
  assert.deepEqual(saved.superLoadout, ["doc"]);
  assert.equal(saved.helpVisible, false);
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
test("selection wraps and preserves one shared charge across every weapon", () => {
  const s = setup(["doc", "mortal", "nitro"]);
  for (let n = 0; n < 3; n++) s.kill(foe(s));
  assert.equal(s.supers.charge, 3);
  s.supers.select(-1);
  assert.equal(s.supers.selected, 2);
  s.kill(foe(s));
  s.supers.select(1);
  assert.equal(s.supers.selected, 0);
  assert.equal(s.supers.charge, 4);
  s.supers.charge = s.supers.quota;
  s.kill(foe(s));
  assert.equal(s.supers.charge, 17);
  const ids = ["doc"] as SuperId[];
  const locked = new Simulation("lock", "Classic", [0, 0, 0], ids);
  ids.push("mortal");
  assert.deepEqual(locked.supers.loadout, ["doc"]);
  assert.deepEqual(
    sanitizeLoadout(["doc", "fake", "doc", "mortal", "nitro", "rae"]),
    ["doc", "mortal", "nitro"],
  );
});
test("initial super charge needs roughly one third as many kills in every mode", () => {
  for (const mode of MODES) {
    const s = new Simulation("fast-charge", mode, [0, 0, 0], ["doc", "panda"]);
    const required = mode === "Swarm" ? 30 : 17;
    assert.equal(s.supers.quota, required);
    for (let i = 0; i < required - 1; i++) s.kill(foe(s));
    assert.equal(s.supers.activate(), false);
    assert.equal(s.supers.charge, required - 1);
    s.supers.select(1);
    s.kill(foe(s));
    assert.equal(s.supers.charge, required);
    assert.equal(s.supers.events.filter((e) => e.kind === "ready").length, 1);
    assert.equal(s.supers.activate(), true);
    assert.equal(s.supers.charge, 0);
  }
});
test("shared adaptive charge targets 25 seconds and changes only on firing, with no passive charge", () => {
  const s = setup(["doc", "panda"]);
  s.tick = 3600;
  for (let i = 0; i < 120; i++) {
    s.kill(foe(s));
    s.enemies.length = 0;
  }
  const c = arm(s);
  assert.equal(s.supers.quota, 50);
  assert.equal(s.supers.charge, 0);
  ticks(s, 30);
  assert.equal(s.supers.charge, 0);
  s.kill(foe(s));
  assert.equal(s.supers.charge, 1);
  assert.equal(s.supers.quota, 50);
  s.supers.charge = 50;
  assert.equal(s.supers.activate(), false);
  assert.equal(
    s.supers.charge,
    50,
    "a blocked activation preserves the full meter",
  );
  s.supers.select(1);
  assert.equal(s.supers.activate(), true);
  assert.equal(s.supers.charge, 0);
  assert.equal(s.supers.casts.length, 2);
  assert.ok(s.supers.active("doc"));
  assert.equal(c.end, 7200);
  assert.equal(
    new Simulation("swarm", "Swarm", [0, 0, 0], ["doc"]).supers.quota,
    30,
  );
});
test("Mortal executes a screen once, caps bosses, preserves ordinary rewards and refills charge", () => {
  const s = setup(["mortal", "doc"]);
  const a = foe(s),
    b = foe(s, 3, 24),
    boss = foe(s, 0, 30, true);
  const hp = boss.hp;
  arm(s);
  s.supers.select(1);
  ticks(s, 36);
  assert.ok(a.dead && b.dead);
  assert.ok(boss.hp >= hp * 0.65 - 1e-8);
  assert.equal(s.supers.charge, 2);
  assert.equal(s.kills, 2);
  const survivor = foe(s);
  ticks(s, 1763);
  assert.ok(s.supers.active("mortal"));
  assert.equal(survivor.hp, survivor.maxHp);
  ticks(s, 1);
  assert.equal(s.supers.active("mortal"), undefined);
});
test("kills refill during an active super and can chain into another weapon or the same weapon after expiry", () => {
  const s = setup(["keys", "doc"]);
  const c = arm(s);
  s.kill(foe(s));
  assert.equal(
    s.supers.charge,
    1,
    "ordinary kills count while a super is active",
  );
  for (let i = 1; i < s.supers.quota + 2; i++) {
    const e = foe(s);
    s.damagePayload(e, 1);
    assert.ok(e.dead, "Keys executes each target");
    s.damagePayload(e, 1);
  }
  assert.equal(
    s.supers.charge,
    s.supers.quota,
    "charge caps at one full meter",
  );
  assert.equal(s.supers.events.filter((e) => e.kind === "ready").length, 1);
  assert.deepEqual(
    s.supers.readySlots.map((slot) => slot.id),
    ["doc"],
  );
  assert.equal(
    s.supers.activate(),
    false,
    "the same weapon cannot overlap itself",
  );
  s.supers.select(1);
  assert.equal(
    s.supers.activate(),
    true,
    "another weapon can fire immediately",
  );
  assert.equal(s.supers.charge, 0);
  assert.equal(s.supers.active("keys"), c);
  s.supers.select(-1);
  for (let i = 0; i < s.supers.quota; i++) s.damagePayload(foe(s), 1);
  ticks(s, c.end - s.tick);
  assert.equal(
    s.supers.charge,
    s.supers.quota,
    "expiry preserves earned charge",
  );
  assert.equal(
    s.supers.activate(),
    true,
    "Keys can fire again when its timer ends",
  );
  assert.equal(s.supers.charge, 0);
});
test("lingering super damage refills charge after its activation ends", () => {
  const s = setup(["nitro"]);
  const c = arm(s);
  ticks(s, c.end - s.tick);
  const e = foe(s);
  s.supers.damage(c, e, e.hp + e.armor);
  assert.equal(s.supers.charge, 1);
  s.supers.damage(c, e, 1000);
  assert.equal(s.supers.charge, 1, "a defeated enemy only charges once");
});
test("Keys strips armor, executes on an arsenal hit, and adapts its first boss hit", () => {
  const s = setup(["keys"]);
  const e = s.spawnEnemy("Riot Guard", 0, 20)!;
  const boss = foe(s, 0, 30, true);
  const armor = boss.armor;
  arm(s);
  ticks(s, 1);
  assert.equal(e.armor, 0);
  assert.equal(boss.armor, armor * 0.5);
  s.damagePayload(e, 1);
  assert.ok(e.dead);
  assert.equal(s.supers.charge, 1);
  const hp = boss.hp;
  s.damagePayload(boss, 1);
  assert.ok(boss.hp <= hp - boss.maxHp * 0.25);
  assert.ok(boss.hp >= hp - boss.maxHp * 0.35 - 1);
});
test("Sybex freezes movement and warning clocks without erasing warning duration", () => {
  const s = setup(["sybex"]);
  const e = foe(s);
  e.cooldown = 1e9;
  const h = s.warn(e.id, [0], "pool", 10, 2);
  const strike = h.strikeAt,
    z = e.z;
  arm(s);
  for (let i = 0; i < 60; i++) s.update({ x: 0 }, false);
  assert.equal(e.z, z);
  assert.equal(h.strikeAt, strike + 60);
  const boss = foe(s, 0, 30, true);
  s.supers.beforeEnemy(boss);
  s.tick += 120;
  assert.equal(s.supers.beforeEnemy(boss), false);
});
test("Tuna sweeps, pushes, slows and clears hazards", () => {
  const s = setup(["tuna"]);
  const e = foe(s, 0, 10),
    hp = e.hp;
  s.warn(e.id, [0], "pool", 10);
  arm(s);
  ticks(s, 40);
  assert.ok(e.hp < hp);
  assert.equal(e.z, 22);
  assert.equal(e.slowFactor, 0.5);
  assert.equal(e.slowUntil, 38 + 15 * 60, "slow lasts 15s from impact");
  ticks(s, 140);
  assert.equal(s.hazards.length, 0);
});
test("Nitro snapshots source attribution through projectiles, echoes and burns", () => {
  const s = setup(["nitro", "doc"]);
  s.boosts.echo = 1;
  s.boosts.ember = 1;
  arm(s);
  s.launch("pulse", 0, 0, 10);
  const b = s.bullets.find((b) => b.active)!;
  assert.equal(b.damage, 15);
  assert.ok(b.payload?.superSource);
  assert.equal(
    s.pendingShots[0].shot.payload?.superSource,
    b.payload?.superSource,
  );
  const e = foe(s);
  e.hp = e.maxHp = 100;
  s.projectileImpact(b, e.z, true, e);
  assert.equal(e.burns?.[0].superSource, b.payload?.superSource);
  s.supers.select(1);
  s.damagePayload(e, 1000, b.payload);
  assert.equal(s.supers.charge, 1);
});
test("Baezil damages inside its three sigils but not outside", () => {
  const s = setup(["baezil"]);
  const inside = foe(s, -3, 12),
    outside = foe(s, 3, 12),
    hp = inside.hp;
  arm(s);
  ticks(s, 6);
  assert.ok(inside.hp < hp);
  assert.equal(outside.hp, outside.maxHp);
});
test("Pauly prevents damage and retaliates without spending ordinary shield", () => {
  const s = setup(["pauly"]);
  s.army = 100;
  s.shield = 10;
  const e = foe(s);
  const hp = e.hp;
  arm(s);
  s.hitSquad(40, "test", 0, 0, false, e.id);
  assert.equal(s.army, 100);
  assert.equal(s.shield, 0);
  assert.ok(e.hp < hp);
  assert.equal(s.supers.charge, 0);
});
test("MachineGunQueen prioritizes ordinary threats and fires repeatedly", () => {
  const s = setup(["machinegunqueen"]);
  const boss = foe(s, 0, 10, true),
    e = foe(s, 3, 20);
  arm(s);
  ticks(s, 1);
  assert.ok(e.hp < e.maxHp);
  assert.equal(boss.hp, boss.maxHp);
  ticks(s, 25);
  assert.ok(e.dead);
  ticks(s, 1744);
  const late = foe(s, 3, 20);
  ticks(s, 29);
  assert.ok(late.dead, "turret keeps firing through the final second");
  ticks(s, 1);
  const survivor = foe(s, 3, 20);
  ticks(s, 30);
  assert.equal(survivor.hp, survivor.maxHp);
});
test("Meesh prevents combat and curb losses without granting kills", () => {
  const s = setup(["meesh"]);
  arm(s);
  s.hitSquad(100, "contact");
  s.hitSquad(100, "curb", 0, 0, true);
  assert.equal(s.army, 24);
  assert.equal(s.kills, 0);
  ticks(s, 360);
  s.hitSquad(1, "contact");
  assert.equal(
    s.army,
    24,
    "Meesh remains active beyond its old six-second timer",
  );
  ticks(s, 3240);
  s.hitSquad(1, "contact");
  assert.equal(s.army, 23);
});
test("Zunneh strikes at most five unique enemies per pulse", () => {
  const s = setup(["zunneh"]);
  const list = Array.from({ length: 6 }, (_, i) => foe(s, 0, 10 + i));
  arm(s);
  ticks(s, 1);
  assert.equal(list.filter((e) => e.hp < e.maxHp).length, 5);
});
test("Rae follows aim and ignores other lanes", () => {
  const s = setup(["rae"]);
  s.aim = 3;
  const hit = foe(s, 3, 20),
    miss = foe(s, -3, 20);
  arm(s);
  ticks(s, 6);
  assert.ok(hit.hp < hit.maxHp);
  assert.equal(miss.hp, miss.maxHp);
  ticks(s, 1782);
  s.aim = -3;
  ticks(s, 6);
  assert.ok(miss.hp < miss.maxHp, "beam still follows aim near expiry");
  const hp = miss.hp;
  ticks(s, 12);
  assert.equal(miss.hp, hp, "beam stops at 30 seconds");
});
test("Doc recovers small casualties collectively, cannot restore the same casualties twice, and keeps shield separate", () => {
  const s = setup(["doc"]);
  for (let i = 0; i < 5; i++) s.hitSquad(1, "test");
  assert.equal(s.army, 19);
  arm(s);
  assert.equal(s.army, 22);
  assert.equal(s.supers.active("doc")?.shield, 30);
  s.shield = 12;
  s.hitSquad(20, "test");
  assert.equal(s.shield, 12);
  ticks(s, 3600);
  assert.equal(s.shield, 12);
  assert.equal(s.supers.active("doc"), undefined);
});
test("Kismet takes the better side, doubles gains, expires after three and respects Sudden Death", () => {
  const s = setup(["kismet"]);
  s.spawnGate();
  const g = s.gates[0];
  arm(s);
  assert.equal(s.supers.gate(g, 4, 34), 44);
  s.supers.gate(g, 4, 34);
  s.supers.gate(g, 4, 34);
  assert.equal(s.supers.gate(g, 4, 34), 4);
  const sd = new Simulation("fate", "Sudden Death", [0, 0, 0], ["kismet"]);
  arm(sd);
  const shield = sd.shield;
  assert.equal(sd.supers.gate(g, 24, 24), 24);
  assert.equal(sd.shield, shield + 40);
});
test("Mmiguel snapshots two ordinary arsenals without recursive echoes or Nitro amplification", () => {
  const s = setup(["mmiguel", "nitro"]);
  s.guns.helix = 1;
  s.boosts.echo = 2;
  const c = arm(s);
  const snapshot = c.snapshot!.map((v) => v.damage);
  arm(s, 1);
  ticks(s, 1);
  const shots = s.bullets.filter((b) => b.active);
  assert.equal(shots.length, 6);
  assert.ok(
    shots.every((b) => b.payload?.superOnly && b.payload.echoCount === 0),
  );
  assert.equal(s.pendingShots.length, 0);
  assert.deepEqual(
    c.snapshot!.map((v) => v.damage),
    snapshot,
  );
});
test("Strawberry has three bounded generations and restores at most 35 soldiers", () => {
  const s = setup(["strawberry"]);
  for (let i = 0; i < 40; i++) foe(s, (i % 5) - 2, 10 + Math.floor(i / 5) * 3);
  const c = arm(s);
  ticks(s, 240);
  assert.ok(c.hits.size <= 35);
  assert.ok(c.hits.size > 5);
  assert.ok(c.count <= 35);
  assert.ok(s.army > 24);
});
test("Nemesis marks a boss and supplies separately capped bonus damage", () => {
  const s = setup(["nemesis"]);
  foe(s, 0, 5);
  const boss = foe(s, 0, 20, true);
  boss.armor = 0;
  const c = arm(s);
  ticks(s, 1);
  assert.equal(c.target, boss.id);
  const hp = boss.hp;
  s.damagePayload(boss, 5);
  assert.equal(boss.hp, hp - 15);
  assert.equal(c.bossDamage.get(boss.id), 10);
  ticks(s, 1798);
  s.damagePayload(boss, 1);
  assert.equal(boss.hp, hp - 18, "bonus remains until 30 seconds");
  ticks(s, 1);
  s.damagePayload(boss, 1);
  assert.equal(boss.hp, hp - 19, "only ordinary damage applies after expiry");
});
test("Bronze Leopard executes six targets and no more", () => {
  const s = setup(["bronze-leopard"]);
  for (let i = 0; i < 8; i++) foe(s, 0, 10 + i);
  arm(s);
  ticks(s, 155);
  assert.equal(s.kills, 6);
});
test("Five10 repeats all ten columns for 30 seconds with one boss damage budget", () => {
  const s = setup(["five10"]);
  const boss = foe(s, 0, 30, true);
  boss.armor = 0;
  const c = arm(s);
  for (let cycle = 0; cycle < 6; cycle++) {
    const enemies = Array.from({ length: 10 }, (_, i) =>
      foe(s, -4.05 + i * 0.9, 20),
    );
    ticks(s, cycle === 5 ? 299 : 300);
    assert.equal(c.count, (cycle + 1) * 5);
    assert.ok(enemies.every((e) => e.dead));
    assert.ok(boss.hp >= boss.maxHp * 0.65 - 1e-8);
  }
  assert.equal(s.supers.active("five10"), c);
  ticks(s, 1);
  assert.equal(s.supers.active("five10"), undefined);
  const survivor = foe(s, -4.05, 20);
  ticks(s, 300);
  assert.equal(c.count, 30);
  assert.equal(survivor.hp, survivor.maxHp);
});
test("Shannondoa creates a center corridor and removes only center hazard coverage", () => {
  const s = setup(["shannondoa"]);
  const e = foe(s);
  const h = s.warn(e.id, [0, 1], "pool", 10);
  arm(s);
  ticks(s, 30);
  assert.ok(Math.abs(e.x) > 1);
  assert.deepEqual(h.lanes, [0]);
  assert.equal(s.supers.movement(e), 0.4);
});
test("Kuttula binds six ordinary foes and releases boss rooting after 2 seconds", () => {
  const s = setup(["kuttula"]);
  const list = Array.from({ length: 7 }, (_, i) => foe(s, 0, 10 + i));
  const c = arm(s);
  ticks(s, 1);
  assert.equal(c.targets.length, 6);
  assert.equal(s.supers.movement(list[0]), 0);
  assert.equal(s.supers.movement(list[6]), 1);
  const b = setup(["kuttula"]);
  const boss = foe(b, 0, 20, true);
  arm(b);
  ticks(b, 1);
  assert.equal(b.supers.movement(boss), 0);
  ticks(b, 120);
  assert.equal(b.supers.movement(boss), 1);
});
test("Gimmy collects each existing drop twice and limits recruitment grants", () => {
  const s = setup(["gimmy"]);
  s.drops.push(
    { id: 100, kind: "recruit", x: 3, z: 20 },
    { id: 101, kind: "damage", x: -3, z: 20 },
    { id: 102, kind: "damage", x: 0, z: 55 },
  );
  arm(s);
  assert.equal(s.army, 64);
  assert.equal(s.boosts.damage, 2);
  assert.deepEqual(
    s.drops.map((drop) => drop.id),
    [102],
    "Consumed salvage cannot produce a missed-pickup toast; out-of-range drops remain",
  );
  for (let i = 0; i < 18; i++) s.kill(foe(s));
  assert.equal(s.army, 89);
  ticks(s, 1);
  assert.equal(s.boosts.damage, 2);
});
test("Haut Carl launches six parcels and burns bounded patches", () => {
  const s = setup(["haut-carl"]);
  const boss = foe(s, 0, 20, true);
  const c = arm(s);
  ticks(s, 220);
  assert.equal(c.count, 6);
  assert.ok(c.points.length <= 6);
  assert.ok(boss.hp < boss.maxHp);
  assert.ok(boss.hp >= boss.maxHp * 0.65 - 1e-8);
});
test("Hondo blocks the front and a boss breaks through after two seconds", () => {
  const s = setup(["hondo"]);
  const e = foe(s, 0, 8);
  const c = arm(s);
  const front = s.crowd.push + 8;
  e.z = front - 0.1;
  s.supers.barrier(e, front + 0.1);
  assert.equal(e.z, front);
  assert.ok(c.walls[1] < 24);
  const b = foe(s, 0, front, true);
  s.supers.barrier(b, front);
  s.tick += 120;
  s.supers.barrier(b, front);
  assert.equal(c.walls[1], 0);
});
test("Panda stores only absorbed damage then releases one capped clap", () => {
  const s = setup(["panda"]);
  const e = foe(s);
  const c = arm(s);
  s.hitSquad(48, "test");
  assert.equal(s.army, 24);
  assert.equal(c.absorbed, 48);
  ticks(s, 1);
  assert.ok(e.hp < e.maxHp);
  assert.equal(s.supers.active("panda"), undefined);
  const hp = e.hp;
  ticks(s, 2);
  assert.equal(e.hp, hp);
});
test("Panda keeps unused absorption for 30 seconds and claps on expiry", () => {
  const s = setup(["panda"]);
  const e = foe(s);
  const c = arm(s);
  s.hitSquad(10, "test");
  ticks(s, 1799);
  assert.equal(e.hp, e.maxHp);
  s.hitSquad(10, "test");
  assert.equal(s.army, 24);
  assert.equal(c.absorbed, 20);
  ticks(s, 1);
  assert.equal(s.supers.active("panda"), undefined);
  assert.ok(e.hp < e.maxHp);
  s.hitSquad(1, "test");
  assert.equal(s.army, 23);
});
test("Pokey only launches at nearby threats and has 24 quills", () => {
  const s = setup(["pokey"]);
  const far = foe(s, 0, 30);
  const c = arm(s);
  ticks(s, 30);
  assert.equal(c.count, 0);
  assert.equal(far.hp, far.maxHp);
  const boss = foe(s, 0, 8, true);
  ticks(s, 300);
  assert.equal(c.count, 24);
  assert.ok(boss.hp >= boss.maxHp * 0.65 - 1e-8);
});
test("Platypus reverses strikes and persistent pools while blocking squad hazard damage", () => {
  const s = setup(["platypus"]);
  const e = foe(s, -3, 20);
  const h = s.warn(e.id, [0], "pool", 20, 0.01, 3);
  arm(s);
  s.tick = h.strikeAt;
  assert.equal(s.supers.hazard(h), true);
  const hp = e.hp;
  assert.ok(hp < e.maxHp);
  s.tick += 60;
  s.supers.hazard(h);
  assert.ok(e.hp < hp);
});
test("So1ician cancels pending summons and future attacks but preserves released hazards", () => {
  const s = setup(["so1ician"]);
  const e = s.spawnEnemy("Carrier", 0, 20)!;
  e.action = "summon";
  e.prepareUntil = 100;
  const pending = s.warn(e.id, [0], "pool", 1, 2);
  const released = s.warn(123, [2], "pool", 1);
  released.strikeAt = 0;
  arm(s);
  s.supers.beforeEnemy(e);
  assert.equal(e.action, "");
  assert.ok(!s.hazards.includes(pending));
  assert.ok(s.hazards.includes(released));
  assert.equal(s.supers.cancelAttack(e), true);
});
test("combined protection orders immunity, reduction, Panda, Doc and ordinary shields", () => {
  const s = setup(["pauly", "panda", "doc"]);
  arm(s, 0);
  const panda = arm(s, 1),
    doc = arm(s, 2);
  s.shield = 10;
  s.hitSquad(40, "test");
  assert.equal(panda.absorbed, 10);
  assert.equal(doc.shield, 30);
  assert.equal(s.shield, 10);
  const m = setup(["meesh", "panda"]);
  arm(m, 0);
  const p = arm(m, 1);
  m.hitSquad(40, "test");
  assert.equal(p.absorbed, 0);
});
test("super-triggered Bloater chains refill charge, spare the squad and respect boss budget", () => {
  const s = setup(["mortal", "doc"]);
  const a = s.spawnEnemy("Bloater", 0, 2)!,
    b = s.spawnEnemy("Bloater", 0, 3)!,
    boss = foe(s, 0, 4, true);
  const c = arm(s);
  s.supers.select(1);
  s.supers.damage(c, a, a.hp + a.armor);
  assert.ok(b.dead);
  assert.equal(s.army, 24);
  assert.equal(s.supers.charge, 2);
  assert.ok(boss.hp >= boss.maxHp * 0.65 - 1e-8);
});
test("selection is applied before firing on a tick, empty slots and early firing are safe", () => {
  const s = setup(["mortal", "doc"]);
  s.supers.charge = 50;
  s.update({ x: 0, superCycle: 1, superPressed: true });
  assert.ok(s.supers.active("doc"));
  assert.equal(s.supers.selected, 1);
  const empty = setup([]);
  empty.update({ x: 0, superCycle: -1, superPressed: true });
  assert.equal(empty.supers.casts.length, 0);
  assert.equal(setup().supers.activate(), false);
});
test("all 27 powers cleanly expire in every mode and preserve finite simulation state", () => {
  for (const mode of MODES)
    for (const id of SUPER_IDS) {
      const s = new Simulation(`smoke-${id}`, mode, [0, 0, 0], [id]);
      s.nextEncounter = s.nextBoss = s.nextSupply = 1e9;
      s.army = 300;
      s.shield = 1e6;
      for (let i = 0; i < 6; i++) foe(s, ((i % 3) - 1) * 3, 24 + i);
      arm(s);
      for (
        let i = 0;
        i < Math.ceil(SUPERS[id].duration * 60) + 60 && !s.over;
        i++
      )
        s.update({ x: 0 }, false);
      assert.ok(Number.isFinite(s.army), `${id} ${mode}`);
      assert.equal(s.supers.casts.length, 0, `${id} ${mode}`);
      assert.ok(s.supers.events.length <= 160);
    }
});
test("natural-play replay reproduces selection, activations, charge, enemies and RNG", () => {
  const s = new Simulation(
    "super-plan-1",
    "Classic",
    [5, 5, 5],
    ["doc", "mortal", "nitro"],
  );
  for (let i = 0; i < 12000 && !s.over; i++) {
    const ready =
      s.supers.charge >= s.supers.quota && !s.supers.active(s.supers.slot.id);
    s.update({
      x: bot(s),
      superPressed: ready,
      superCycle: s.supers.active(s.supers.slot.id) ? 1 : 0,
    });
  }
  assert.ok(s.supers.serial > 0, "natural play should activate a power");
  const replay = s.replay();
  assert.equal(validSuperReplay(replay), true);
  const r = replayRun(replay);
  assert.equal(r.army, s.army);
  assert.equal(r.kills, s.kills);
  assert.equal(r.rng.state, s.rng.state);
  assert.equal(r.supers.selected, s.supers.selected);
  assert.deepEqual(r.supers.slots, s.supers.slots);
  assert.equal(r.supers.charge, s.supers.charge);
  assert.equal(r.supers.quota, s.supers.quota);
  assert.deepEqual(r.enemies, s.enemies);
  assert.equal(r.supers.serial, s.supers.serial);
  assert.equal(validSuperReplay({ ...replay, superInputs: [6] }), false);
  assert.equal(
    validSuperReplay({ ...replay, superLoadout: ["doc", "doc"] }),
    false,
  );
});

test("Doc excludes curb casualties and replay validation rejects absent inputs", () => {
  const s = setup(["doc"]);
  s.hitSquad(10, "curb", 0, 0, true);
  arm(s);
  assert.equal(s.army, 14);
  assert.equal(
    validSuperReplay({
      inputs: undefined as unknown as unknown[],
      superLoadout: [],
      superInputs: [],
    }),
    false,
  );
});

test("Nitro preserves ordinary armor penetration after its boss bonus budget is spent", () => {
  const normal = setup([]),
    boosted = setup(["nitro"]);
  const a = foe(normal, 0, 20, true),
    b = foe(boosted, 0, 20, true);
  a.armor = b.armor = 40;
  const c = arm(boosted);
  c.bossDamage.set(b.id, b.maxHp * 0.35);
  normal.launch("pulse", 0, 0, 10);
  const payload = normal.bullets.find((b) => b.active)!.payload!;
  payload.breach = 10;
  normal.damagePayload(a, 10, payload);
  boosted.damagePayload(b, 15, { ...payload, superSource: c.serial });
  assert.equal(b.armor, a.armor);
  assert.equal(b.hp, a.hp);
});

test("live loadouts preserve shared charge, selection and active casts across removal and reordering", () => {
  const s = setup(["doc", "nitro"]);
  const cast = arm(s);
  s.supers.charge = 5;
  s.supers.quota = 40;
  s.setSuperLoadout(["nitro", "doc", "mortal"]);
  assert.equal(s.supers.selected, 1);
  assert.equal(s.supers.charge, 5);
  assert.equal(s.supers.quota, 40);
  s.setSuperLoadout(["mortal"]);
  assert.equal(s.supers.selected, 0);
  assert.equal(s.supers.active("doc"), cast);
  s.kill(foe(s));
  s.setSuperLoadout(["doc", "mortal"]);
  assert.equal(s.supers.selected, 1);
  assert.equal(s.supers.charge, 6);
  assert.equal(s.supers.quota, 40);
  s.setSuperLoadout([]);
  s.kill(foe(s));
  assert.equal(s.supers.charge, 7);
  assert.equal(s.supers.activate(), false);
  assert.equal(s.supers.charge, 7);
  ticks(s, 3600);
  assert.equal(s.supers.active("doc"), undefined);
  s.setSuperLoadout(["mortal"]);
  for (let i = 0; i < 33; i++) s.kill(foe(s));
  assert.equal(s.supers.activate(), true);
});

test("replays reproduce live loadout changes, including multiple edits at the same tick", () => {
  const s = new Simulation(
    "live-armory",
    "Classic",
    [5, 5, 5],
    ["doc", "nitro"],
  );
  for (let i = 0; i < 1800 && !s.over; i++) {
    if (i === 60) s.setSuperLoadout(["mortal", "doc"]);
    if (i === 120) {
      s.setSuperLoadout([]);
      s.setSuperLoadout(["nitro", "doc", "mortal"]);
    }
    if (i === 300) s.setSuperLoadout(["panda", "doc"]);
    s.update({
      x: bot(s),
      superPressed: true,
      superCycle: i % 200 === 0 ? 1 : 0,
    });
  }
  s.setSuperLoadout(["doc", "panda"]);
  const record = s.replay();
  assert.deepEqual(record.superLoadout, ["doc", "nitro"]);
  assert.equal(validSuperReplay(record), true);
  const r = replayRun(record);
  assert.deepEqual(r.supers.loadout, s.supers.loadout);
  assert.deepEqual(r.supers.slots, s.supers.slots);
  assert.equal(r.supers.charge, s.supers.charge);
  assert.equal(r.supers.quota, s.supers.quota);
  assert.equal(r.supers.selected, s.supers.selected);
  assert.deepEqual(r.supers.casts, s.supers.casts);
  assert.deepEqual(r.enemies, s.enemies);
  assert.equal(r.army, s.army);
  assert.equal(r.rng.state, s.rng.state);
  for (const changes of [
    null,
    [{}],
    [{ tick: -1, loadout: [] }],
    [{ tick: 1, loadout: ["fake"] }],
    [{ tick: 1, loadout: ["doc", "doc"] }],
    [{ tick: record.inputs.length + 1, loadout: [] }],
    [
      { tick: 2, loadout: [] },
      { tick: 1, loadout: [] },
    ],
  ])
    assert.equal(
      validSuperReplay({ ...record, superLoadoutChanges: changes }),
      false,
    );
});

test("requested super timers stay active until their exact new expiry tick", () => {
  const durations: Partial<Record<SuperId, number>> = {
    keys: 30,
    sybex: 30,
    hondo: 30,
    platypus: 30,
    so1ician: 30,
    zunneh: 15,
    mmiguel: 15,
    kuttula: 15,
    baezil: 15,
    gimmy: 60,
    doc: 60,
    meesh: 60,
    kismet: 60,
    pauly: 15,
    nitro: 15,
    pokey: 15,
    shannondoa: 30,
    "bronze-leopard": 30,
  };
  for (const [id, seconds] of Object.entries(durations) as [
    SuperId,
    number,
  ][]) {
    const s = setup([id]);
    s.tick = 120;
    const cast = arm(s);
    assert.equal(SUPERS[id].duration, seconds, id);
    assert.equal(cast.end, 120 + seconds * 60, id);
    ticks(s, seconds * 60 - 1);
    assert.equal(s.supers.active(id), cast, `${id} must last the full timer`);
    ticks(s, 1);
    assert.equal(s.supers.active(id), undefined, `${id} expires on time`);
    assert.equal(s.supers.casts.length, 0, id);
    assert.equal(
      s.supers.events.filter((event) => event.kind === "end").length,
      1,
      id,
    );
  }
});

test("one full shared meter can fire any equipped weapon exactly once", () => {
  for (let chosen = 0; chosen < 3; chosen++) {
    const s = setup(["doc", "nitro", "pauly"]);
    for (let i = 0; i < s.supers.quota; i++) {
      s.supers.select(1);
      s.kill(foe(s));
    }
    assert.equal(s.supers.readySlots.length, 3);
    s.supers.selected = chosen;
    assert.equal(s.supers.activate(), true);
    assert.equal(s.supers.charge, 0);
    assert.equal(s.supers.readySlots.length, 0);
    assert.equal(s.supers.casts[0].id, s.supers.slots[chosen].id);
    for (let i = 0; i < 3; i++) {
      s.supers.select(1);
      assert.equal(
        s.supers.activate(),
        false,
        "switching cannot spend the same charge twice",
      );
    }
  }
});

test("charge earned before equipping a weapon can fire a newly purchased loadout", () => {
  const s = setup([]);
  for (let i = 0; i < s.supers.quota; i++) s.kill(foe(s));
  assert.equal(s.supers.charge, s.supers.quota);
  assert.equal(s.supers.activate(), false);
  s.setSuperLoadout(["nitro"]);
  assert.equal(s.supers.activate(), true);
  assert.ok(s.supers.active("nitro"));
  assert.equal(s.supers.charge, 0);
  const freshRun = setup(["nitro"]);
  assert.equal(freshRun.supers.charge, 0);
  assert.equal(freshRun.supers.quota, freshRun.supers.minimum);
});
