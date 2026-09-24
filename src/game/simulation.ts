import { SuperSystem } from "./superSystem";
import { validSuperReplay, type SuperId } from "./superWeapons";
import {
  ARSENAL,
  GUNS,
  gunLevels,
  moveProjectile,
  crossingX,
  shotNoise,
  type ProjectileKind,
  type Gun,
  type OrdnanceImpact,
  type WeaponEvent,
} from "./projectiles";
import { LootDeck } from "./loot";
import { attackScale, encounterScale, strengthDistance } from "./escalation";
import {
  formationPositions,
  crowdEnvelope,
  formationExposure,
  edgeExposure,
  ROAD_EDGE,
} from "./formation";
import { deathStyle, effectRandom } from "./deaths";
export { formationPositions } from "./formation";
import { commitMotion } from "./attacks";
import {
  BOSS_SPACING,
  CAMPAIGN_DISTANCE,
  bossDefinition,
  isNewBoss,
  scheduleBossAttack,
} from "./bosses";
import {
  selectedGate,
  bulletGate,
  GATE_CENTER,
  GATE_WIDTH,
  GATE_PASS_TICKS,
} from "./gateLayout";
import { RNG } from "./rng";
import {
  BOSSES,
  UPGRADE_PERCENT,
  ENEMIES,
  type Mode,
  type Upgrade,
  type Gate,
  type Enemy,
  type EnemyKind,
  type BossKind,
  type Bullet,
  type Hazard,
  type Drop,
  type Effect,
  type Input,
  type Replay,
  type Op,
  type Pickup,
  type Boost,
  type ShotPayload,
} from "./types";
import { BULLET_CAPACITY, PICKUPS, weaponStats, boostLevels } from "./weapons";
export const VERSION = "containment-2.8.0";
// Signs improve at a quarter of each projectile's strength, and a single hit
// can never charge a sign by more than GATE_POWER_CAP soldiers.
export const GATE_GAIN = 0.25,
  GATE_POWER_CAP = 2;
export const DT = 1 / 60,
  MOVE_SPEED = 6,
  ROAD_LIMIT = 3.8,
  LANES = [-3, 0, 3];
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export function gateResult(
  army: number,
  op: Op,
  value: number,
  mode: Mode,
): number {
  let next =
    op === "+"
      ? army + value
      : op === "−"
        ? army - value
        : op === "×"
          ? army * value
          : Math.floor(army / Math.max(1, value));
  if (mode === "Sudden Death") next = Math.min(army, next);
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(next)));
}
export function improveGate(
  g: Gate,
  side: "a" | "b",
  amount: number,
  mode: Mode,
) {
  const key = side === "a" ? "hitsA" : "hitsB";
  g[key] += amount;
  g.revealed = true;
  // Every projectile improves the sign immediately; there is no hit threshold.
  const op = side === "a" ? g.left : g.right;
  if (op === "+" || op === "−") {
    g[side] += op === "+" ? amount : -amount;
    if (op === "−" && g[side] <= 0) {
      g[side] = Math.abs(g[side]);
      if (side === "a") g.left = "+";
      else g.right = "+";
    }
  } else if (op === "×") g[side] += 0.01 * amount;
  else g[side] = Math.max(1, g[side] - 0.1 * amount);
  g[side] = Math.round(g[side] * 1000) / 1000;
  const current = side === "a" ? g.left : g.right;
  if (mode === "Sudden Death" && (current === "+" || current === "×"))
    g[side] = current === "+" ? 0 : 1;
}
const stats: Record<EnemyKind, [number, number, number]> = {
  Walker: [7, 0, 1],
  Runner: [6, 0, 4],
  Crawler: [2.5, 0, 2.4],
  "Riot Guard": [11, 35, 0.5],
  Charger: [19, 12, 0.9],
  Spitter: [11, 0, 0.6],
  Bloater: [18, 0, 0.5],
  Screamer: [12.5, 0, 0.6],
  Carrier: [24, 0, 0.4],
  Gunner: [12, 8, 0.6],
};
export class Simulation {
  supers: SuperSystem;
  private initialSuperLoadout: SuperId[];
  private superLoadoutChanges: NonNullable<Replay["superLoadoutChanges"]> = [];
  superInputs: number[] = [];
  damageSource?: number;
  seed: string;
  mode: Mode;
  upgrades: Upgrade;
  rng: RNG;
  tick = 0;
  distance = 0;
  x = 0;
  crowdX = 0;
  army: number;
  peak = 0;
  shield = 0;
  kills = 0;
  bossKills = 0;
  bossIndex = 0;
  nextBoss = BOSS_SPACING;
  bossPending = false;
  bossActive = false;
  nextEncounter = 0;
  encounterIndex = 0;
  private nextGateEncounter = 0;
  private enemyOrder: EnemyKind[];
  nextSupply = 9;
  supplyIndex = 0;
  loot: LootDeck;
  lootEligibleMisses = 0;
  nextKillLootTick = 0;
  pickupsCollected = 0;
  totalDamage = 0;
  // A bounded queue holds delayed burst shots and echoes, never callbacks.
  pendingShots: { tick: number; shot: Bullet }[] = [];
  fields: {
    active: boolean;
    kind: ProjectileKind;
    x: number;
    z: number;
    age: number;
    radius: number;
    damage: number;
    payload: NonNullable<Bullet["payload"]>;
  }[] = [];
  allocationCursor = 0;
  droppedShots = 0;
  droppedSchedules = 0;
  id = 1;
  fireClock = 0;
  guns = gunLevels();
  gunClocks = gunLevels();
  aim = 0;
  aims: number[] = [];
  shotSerial = 0;
  weaponEventSerial = 0;
  weaponEvents: WeaponEvent[] = [];
  impacts: OrdnanceImpact[] = Array.from({ length: 96 }, () => ({
    active: false,
    serial: 0,
    kind: "pulse",
    x: 0,
    z: 0,
    age: 0,
    radius: 1,
    seed: 0,
  }));
  over = false;
  outcome: "active" | "victory" | "defeat" = "active";
  bossRemains: Enemy[] = [];
  reason = "";
  debug = false;
  introduced = 3;
  template = "Insertion";
  lastReward = "";
  rewardUntil = 0;
  shots = 0;
  damageEvents = 0;
  gates: Gate[] = [];
  enemies: Enemy[] = [];
  hazards: Hazard[] = [];
  drops: Drop[] = [];
  bullets: Bullet[] = Array.from({ length: 512 }, () => ({
    kind: "pulse",
    serial: 0,
    age: 0,
    previousX: 0,
    y: 0.72,
    vx: 0,
    phase: 0,
    seed: 0,
    target: -1,
    aimX: 0,
    trail: [],
    active: false,
    x: 0,
    z: 0,
    damage: 0,
    previous: 0,
    gatePower: 1,
    coreColor: "#ffd69a",
    haloColor: "#ffd69a",
    width: 0.035,
    length: 0.7,
  }));
  effectSerial = 0;
  edgeLosses = 0;
  effects: Effect[] = Array.from({ length: 180 }, () => ({
    active: false,
    x: 0,
    z: 0,
    age: 0,
    life: 1,
    kind: "blood",
    seed: 0,
    style: "shred",
    direction: 0,
    energy: 1,
    value: 0,
  }));
  boosts = boostLevels();
  inputs: number[] = [];
  constructor(
    seed = "OUTBREAK-01",
    mode: Mode = "Classic",
    upgrades: Upgrade = [0, 0, 0],
    superLoadout: readonly SuperId[] = [],
  ) {
    this.seed = seed;
    this.mode = mode;
    this.upgrades = [...upgrades];
    this.rng = new RNG(seed);
    this.loot = new LootDeck(seed);
    // Basic enemies can mix immediately; introduce specialists in a seeded order.
    const specialists: EnemyKind[] = ENEMIES.slice(3);
    for (let i = specialists.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [specialists[i], specialists[j]] = [specialists[j], specialists[i]];
    }
    this.enemyOrder = [...ENEMIES.slice(0, 3), ...specialists];
    this.nextSupply = 6 + this.loot.rng.next() * 6;
    this.army = Math.round(24 * (1 + (upgrades[0] * UPGRADE_PERCENT[0]) / 100));
    this.peak = this.army;
    this.shield = 20;
    this.supers = new SuperSystem(this, superLoadout);
    this.initialSuperLoadout = [...this.supers.loadout];
  }
  setSuperLoadout(loadout: readonly SuperId[], record = true) {
    if (this.supers.loadout.join(",") === loadout.join(",")) return;
    this.supers.setLoadout(loadout);
    if (record)
      this.superLoadoutChanges.push({
        tick: this.tick,
        loadout: [...this.supers.loadout],
      });
  }
  private crowdCache?: {
    army: number;
    x: number;
    crowdX: number;
    mode: Mode;
    value: ReturnType<typeof crowdEnvelope>;
  };
  // The envelope is a pure function of four numbers and is read dozens of
  // times per tick; memoizing it removes most of the tick's small allocations.
  get crowd() {
    const c = this.crowdCache;
    if (
      c &&
      c.army === this.army &&
      c.x === this.x &&
      c.crowdX === this.crowdX &&
      c.mode === this.mode
    )
      return c.value;
    const value = crowdEnvelope(this.army, this.mode, this.x, this.crowdX);
    this.crowdCache = {
      army: this.army,
      x: this.x,
      crowdX: this.crowdX,
      mode: this.mode,
      value,
    };
    return value;
  }
  exposure(left: number, right: number, front = -Infinity, back = Infinity) {
    return formationExposure(
      this.army,
      this.mode,
      this.x,
      left,
      right,
      front,
      back,
      this.crowdX,
    );
  }
  get encounterScale() {
    return encounterScale(
      this.distance,
      this.army,
      this.boosts,
      this.guns,
      this.bossIndex > 0,
    );
  }
  get time() {
    return this.tick / 60;
  }
  get difficulty() {
    return 1 + strengthDistance(this.distance) / 350;
  }
  get boss() {
    return this.enemies.find((e) => e.boss && !e.dead);
  }
  effect(
    x: number,
    z: number,
    kind: Effect["kind"],
    value = 0,
    detail: Partial<Pick<Effect, "style" | "direction" | "energy">> = {},
  ) {
    const seed =
      (Math.imul(++this.effectSerial, 2654435761) ^ this.rng.state) >>> 0;
    // Reserve fresh death events by evicting an old hit puff before a corpse.
    const e =
      this.effects.find((e) => !e.active) ??
      (kind === "corpse" || kind === "blast"
        ? this.effects.reduce((old, item) =>
            (item.kind !== "corpse" && old.kind === "corpse") ||
            (item.kind === old.kind && item.age > old.age)
              ? item
              : old,
          )
        : undefined);
    if (e)
      Object.assign(e, {
        active: true,
        x,
        z,
        kind,
        value,
        age: 0,
        seed,
        style: "shred",
        direction: (effectRandom(seed, 2) - 0.5) * 0.8,
        energy: 0.8 + effectRandom(seed, 3) * 0.65,
        ...detail,
        life:
          kind === "corpse"
            ? 4.5 + effectRandom(seed, 4) * 2
            : kind === "reward"
              ? 1.4
              : kind === "blast"
                ? 0.7
                : 2,
      });
  }
  reward(text: string) {
    this.lastReward = text;
    this.rewardUntil = this.tick + 110;
  }
  threatDamage(base: number, boss = false) {
    // Large formations remain vulnerable; gate growth cannot make telegraphs irrelevant.
    // Snapshot at commitment, so moving warnings never secretly grow stronger.
    return (
      (base * Math.pow(this.difficulty, 1.1) +
        Math.max(0, this.army - 120) * (boss ? 0.18 : 0.075)) *
      attackScale(this.distance)
    );
  }
  contactDamage(e: Enemy) {
    return Math.max(
      e.hp,
      Math.max(0, this.army - 120) * (e.boss ? 0.6 : 0.13) * (e.hp / e.maxHp),
    );
  }
  hitSquad(
    amount: number,
    reason: string,
    x = this.x,
    z = 0,
    bypassShield = false,
    source?: number,
  ) {
    if (this.damageSource !== undefined || this.outcome === "victory") return;
    amount = this.supers.protect(Math.ceil(amount), bypassShield, source);
    const absorbed = bypassShield ? 0 : Math.min(this.shield, amount);
    this.shield -= absorbed;
    amount -= absorbed;
    amount = Math.min(this.army, amount);
    this.army = Math.max(0, this.army - amount);
    if (amount) {
      if (!bypassShield) this.supers.recordLoss(amount);
      this.damageEvents++;
      this.effect(x, z, "blood", amount);
      for (let i = 0; i < Math.min(5, Math.ceil(amount / 8)); i++)
        this.effect(
          x + (effectRandom(this.effectSerial, i) - 0.5) * 0.6,
          z,
          "corpse",
          0.38,
          { style: "soldier", direction: x < this.x ? -1.4 : 1.4, energy: 0.6 },
        );
      this.reward(`−${amount} SOLDIERS`);
    }
    if (!this.army) {
      this.over = true;
      this.outcome = "defeat";
      this.reason = reason;
    }
  }
  spawnEnemy(kind: EnemyKind | BossKind, x: number, z = 48, boss = false) {
    if (this.enemies.length >= 90) return;
    const st = boss
      ? [
          {
            Classic: 160,
            Reverse: 160,
            Swarm: 235,
            Fortress: 145,
            Mirror: 150,
            "Sudden Death": 115,
          }[this.mode] * Math.pow(this.difficulty, 2.2),
          kind === "Bulwark" ? 130 : 0,
          0.12,
        ]
      : stats[kind as EnemyKind];
    const escalation = this.encounterScale;
    const difficulty = boss ? 1 : Math.pow(this.difficulty, 1.65);
    const healthScale = boss
      ? 1 + (escalation.health - 1) * 0.7
      : escalation.health;
    const hp = Math.round(
      st[0] *
        difficulty *
        healthScale *
        (boss ? bossDefinition(kind).healthMultiplier : 1) *
        (this.mode === "Swarm" ? 0.55 : 1),
    );
    const e: Enemy = {
      id: this.id++,
      kind,
      x,
      z: boss && isNewBoss(kind) ? bossDefinition(kind).arenaZ : z,
      hp,
      maxHp: hp,
      armor: Math.round(st[1] * difficulty * escalation.armor),
      maxArmor: Math.round(st[1] * difficulty * escalation.armor),
      speed: st[2] * (boss ? 1 : escalation.speed),
      cooldown: this.tick + (boss ? 120 : 45) + this.rng.int(boss ? 60 : 30),
      buffUntil: 0,
      phase: 1,
      boss,
      age: 0,
      hit: 0,
      dead: false,
      attacks: 0,
      prepareUntil: 0,
      actionLane: 1,
      action: "",
      motions: [],
      phaseTick: -1000,
    };
    this.enemies.push(e);
    return e;
  }
  spawnGate(wall = -1) {
    const op = (): Op => {
      const roll = this.rng.next();
      if (roll < this.encounterScale.multiplierChance) return "×";
      if (roll < 0.1) return "÷";
      return roll < 0.72 ? "+" : "−";
    };
    const left = op(),
      right = op();
    const value = (op: Op) =>
      op === "+"
        ? 12 + this.rng.int(14)
        : op === "−"
          ? 8 + this.rng.int(14)
          : op === "×"
            ? 1.2 + this.rng.int(3) / 10
            : 2 + this.rng.int(2);
    const g: Gate = {
      id: this.id++,
      z: 48,
      left,
      right,
      a: value(left),
      b: value(right),
      hitsA: 0,
      hitsB: 0,
      revealed: this.mode !== "Reverse",
      wall,
      passed: false,
    };
    if (left === "−" && right === "÷") {
      g.left = "+";
      g.a = 16;
    }
    if (this.mode === "Sudden Death") {
      if (g.left === "+") g.a = 0;
      if (g.right === "+") g.b = 0;
      if (g.left === "×") g.a = 1;
      if (g.right === "×") g.b = 1;
    }
    if (this.distance < 150 && g.wall >= 0) {
      const side = g.wall === 0 ? "b" : "a";
      if (side === "a") {
        g.left = "+";
        g.a = this.mode === "Sudden Death" ? 0 : 12;
      } else {
        g.right = "+";
        g.b = this.mode === "Sudden Death" ? 0 : 12;
      }
    }
    this.gates.push(g);
  }
  generate() {
    const index = this.encounterIndex++;
    const safe = this.rng.int(3);
    const introduce =
      this.introduced < ENEMIES.length && this.distance >= this.introduced * 26;
    const specialist = introduce
      ? this.enemyOrder[this.introduced++]
      : this.enemyOrder[this.rng.int(this.introduced)];
    this.template = introduce
      ? "Introduction: " + specialist
      : "Advancing horde";
    // Seeded formations occupy at most two lanes, leaving a route around contact.
    const count =
      (this.distance < 45 ? 2 : this.mode === "Swarm" ? 7 : 4) +
      this.rng.int(this.distance < 45 ? 2 : 3) +
      Math.min(3, Math.floor(this.distance / 300)) +
      this.encounterScale.extraEnemies;
    const firstLane = this.rng.int(2);
    const front = 27 + this.rng.next() * 5;
    const rankSpacing =
      (this.encounterScale.pressure > 2 ? 1.4 : 1.8) + this.rng.next() * 1.2;
    const specialistIndex = this.rng.int(count);
    const guardIndex = (specialistIndex + 1 + this.rng.int(count - 1)) % count;
    for (let n = 0; n < count; n++) {
      const lane =
        this.mode === "Mirror"
          ? safe === 1
            ? n % 2
              ? 0
              : 2
            : 1
          : (safe + 1 + (n < 2 ? (firstLane + n) % 2 : this.rng.int(2))) % 3;
      // Limit ranged specialists per pack so warnings do not queue minutes into the future.
      const kind =
        n === specialistIndex || (n === 6 && this.encounterScale.pressure > 2)
          ? specialist
          : this.enemyOrder.slice(0, this.introduced).includes("Riot Guard") &&
              this.encounterScale.pressure > 1 &&
              n === guardIndex
            ? "Riot Guard"
            : ENEMIES[this.rng.int(3)];
      this.spawnEnemy(
        kind,
        LANES[lane] +
          (this.mode === "Mirror" ? 0 : (this.rng.next() - 0.5) * 0.8),
        front + Math.floor(n / 2) * rankSpacing + this.rng.next() * 0.6,
      );
    }
    // Gates are interleaved with combat; they no longer consume a whole empty encounter.
    if (index >= this.nextGateEncounter) {
      this.nextGateEncounter = index + 3 + this.rng.int(5);
      this.spawnGate(index > 0 && this.rng.next() < 0.5 ? this.rng.int(2) : -1);
      const gate = this.gates[this.gates.length - 1];
      gate.z = 36 + this.rng.next() * 8;
      if (index === 0 && this.mode !== "Sudden Death") {
        gate.left = gate.right = "+";
        gate.a = 12 + this.rng.int(13);
        gate.b = 12 + this.rng.int(13);
      }
    }
    if (this.bossIndex === 0 && this.distance >= this.nextSupply)
      this.supply(LANES[safe]);
  }
  supply(x: number) {
    this.supplyIndex++;
    const kind = this.loot.next({ ...this.guns, ...this.boosts });
    this.dropReward(kind, x, 21 + this.loot.rng.next() * 6);
    // Vary arrival distances around the existing supply budget, on the loot stream.
    this.nextSupply =
      this.distance +
      (this.bossIndex > 0 ? 32 : this.distance < 150 ? 72 : 56) *
        (0.8 + this.loot.rng.next() * 0.4);
  }
  dropReward(kind: Pickup, x: number, z: number) {
    if (this.drops.length >= 24) return;
    this.drops.push({
      id: this.id++,
      kind,
      x: clamp(x, -3, 3),
      z: Math.max(z, this.crowd.push + 12),
    });
  }

  // A shared reservation scheduler serializes offensive telegraphs. At least one lane stays free.
  warn(
    source: number,
    lanes: number[],
    kind: Hazard["kind"],
    damage: number,
    delay = 1.6,
    duration = 0.22,
    offset = 0,
  ) {
    const now = this.tick;
    const latest = this.hazards.reduce((n, h) => Math.max(n, h.endAt), now);
    const start = Math.max(now + Math.round(offset * 60), latest + 6);
    let unique = [...new Set(lanes)].slice(0, 2);
    if (this.mode === "Mirror") unique = unique.includes(1) ? [1] : [0, 2];
    const h: Hazard = {
      id: this.id++,
      lanes: unique,
      warnAt: start,
      strikeAt: start + Math.round(delay * 60),
      endAt: start + Math.round((delay + duration) * 60),
      damage,
      kind,
      source,
      hit: false,
    };
    this.hazards.push(h);
    return h;
  }
  damageEnemy(
    e: Enemy,
    damage: number,
    source: number | undefined = this.damageSource,
  ) {
    if (e.dead) return;
    const previousSource = this.damageSource;
    this.damageSource = source;
    try {
      const incoming = damage;
      const blocked = Math.min(e.armor, damage);
      e.armor -= blocked;
      damage -= blocked;
      if (blocked && e.armor === 0) {
        this.effect(e.x, e.z, "armor");
        this.reward("ARMOR BROKEN");
      }
      if (e.boss && isNewBoss(e.kind)) {
        const threshold = bossDefinition(e.kind).phases[e.phase - 1];
        const floor = threshold === undefined ? 0 : e.maxHp * threshold;
        damage =
          (e.phaseUntil ?? 0) > this.tick
            ? 0
            : Math.min(damage, Math.max(0, e.hp - floor));
      }
      this.totalDamage += Math.min(
        e.hp + blocked,
        blocked + Math.min(incoming - blocked, damage),
      );
      e.hp -= damage;
      e.hit = this.tick + 4;
      if (damage) this.effect(e.x, e.z, "blood");
      if (e.hp <= 0) this.kill(e);
    } finally {
      this.damageSource = previousSource;
    }
  }
  kill(e: Enemy) {
    if (e.dead) return;
    e.dead = true;
    if (e.boss) {
      e.deathTick = this.tick;
      this.bossRemains = [e];
    }
    this.hazards = this.hazards.filter(
      (h) => h.source !== e.id || h.strikeAt <= this.tick,
    );
    e.motions.length = 0;
    this.kills++;
    this.supers.killed(e, this.damageSource);
    const style = deathStyle(
      e,
      this.effectSerial + e.id * 71,
      this.boosts.hero > 0 || e.hp < -e.maxHp * 0.4,
    );
    const energy = e.boss
      ? 2
      : style === "rupture"
        ? 1.7
        : 0.8 + effectRandom(e.id + this.effectSerial) * 0.6;
    this.effect(e.x, e.z, "blast", e.boss ? 2 : 1, { style, energy });
    this.effect(
      e.x,
      e.z,
      "corpse",
      e.boss ? 1.8 : e.kind === "Crawler" ? 0.6 : 1,
      { style, energy },
    );
    if (this.mode === "Sudden Death") this.army += e.kind === "Crawler" ? 2 : 8;
    if (e.boss) {
      this.bossKills++;
      this.army += 30;
      this.shield += 20;
      this.reward(`TARGET ELIMINATED · +30 · ${100 * this.bossKills} CR`);
      this.endBoss();
      if (this.outcome === "victory") return;
      const owned = { ...this.guns, ...this.boosts };
      // One pickup per victory, alternating categories to retain both rewards.
      this.dropReward(
        this.loot.draw(this.bossKills % 2 === 1 ? "weapon" : "modifier", owned),
        formationPositions(this.mode, this.x)[0],
        this.crowd.push + 13,
      );
    } else if (this.bossIndex > 0 && this.tick >= this.nextKillLootTick) {
      this.lootEligibleMisses++;
      if (this.loot.rng.next() < 0.06 || this.lootEligibleMisses >= 20) {
        this.dropReward(
          this.loot.next({ ...this.guns, ...this.boosts }),
          e.x,
          e.z,
        );
        this.nextKillLootTick = this.tick + 600;
        this.lootEligibleMisses = 0;
      }
    }
    if (e.kind === "Bloater") {
      this.effect(e.x, e.z, "blast", 2);
      for (const other of this.enemies)
        if (
          !other.dead &&
          other.id !== e.id &&
          Math.hypot(other.x - e.x, other.z - e.z) < 5
        ) {
          const cast =
            this.damageSource === undefined
              ? undefined
              : this.supers.archive.get(this.damageSource);
          if (cast) this.supers.damage(cast, other, 45 * this.difficulty);
          else this.damageEnemy(other, 45 * this.difficulty);
        }
      if (this.exposure(e.x - 4, e.x + 4, -e.z - 4, -e.z + 4) > 0.5)
        this.hitSquad(18, "Bloater rupture", e.x, e.z);
    }
  }
  endBoss() {
    // Advancement is earned only by a kill, never by contact or expiry.
    if (this.bossKills <= this.bossIndex) return;
    this.bossActive = false;
    this.bossIndex++;
    this.nextBoss = (this.bossIndex + 1) * BOSS_SPACING;
    this.nextEncounter = this.distance + 1.5 + this.rng.next();
    this.nextSupply = this.distance + 8 + this.loot.rng.next() * 4;
    this.hazards.length = 0;
    this.fields.length = 0;
    for (const e of this.enemies) e.dead = true;
    if (this.bossIndex === BOSSES.length) {
      this.distance = CAMPAIGN_DISTANCE;
      this.outcome = "victory";
      this.over = true;
      this.reason = "The Last Witness has fallen. The world is quiet.";
      this.nextBoss = Infinity;
      for (const bullet of this.bullets) bullet.active = false;
      this.pendingShots.length = 0;
      this.arcEffects.length = 0;
    }
  }
  weaponSound(kind: ProjectileKind, x: number, impact: boolean) {
    this.weaponEvents.push({
      serial: ++this.weaponEventSerial,
      kind,
      x,
      impact,
    });
    if (this.weaponEvents.length > 64) this.weaponEvents.shift();
  }
  allocateShot(template: Bullet) {
    for (let n = 0; n < this.bullets.length; n++) {
      const b = this.bullets[this.allocationCursor];
      this.allocationCursor = (this.allocationCursor + 1) % this.bullets.length;
      if (b.active) continue;
      // Keep the slot's own arrays: a shot costs no new trail or hit lists.
      const trail = b.trail,
        hitIds = b.hitIds ?? [],
        hitGateIds = b.hitGateIds ?? [];
      trail.length = 0;
      hitIds.length = 0;
      hitGateIds.length = 0;
      Object.assign(b, template);
      b.active = true;
      b.serial = ++this.shotSerial;
      b.trail = trail;
      b.hitIds = hitIds;
      b.hitGateIds = hitGateIds;
      return b;
    }
    if (this.bullets.length < BULLET_CAPACITY) {
      const b = {
        ...template,
        active: true,
        serial: ++this.shotSerial,
        trail: [],
        hitIds: [],
        hitGateIds: [],
      };
      this.bullets.push(b);
      const grow = Math.min(127, BULLET_CAPACITY - this.bullets.length);
      for (let i = 0; i < grow; i++)
        this.bullets.push({
          ...template,
          active: false,
          serial: 0,
          trail: [],
          hitIds: [],
          hitGateIds: [],
          payload: undefined,
        });
      return b;
    }
    this.droppedShots++;
  }
  launch(
    kind: ProjectileKind,
    origin: number,
    dx: number,
    damage: number,
    phase = 0,
    delay = 0,
    superSource?: number,
    shotModifiers?: ReturnType<typeof weaponStats>,
  ) {
    const w = shotModifiers ?? weaponStats(this.boosts),
      def = ARSENAL[kind];
    const nitro =
      superSource === undefined ? this.supers.active("nitro") : undefined;
    const source = superSource ?? nitro?.serial;
    if (nitro) damage *= 1.5;
    const seed = ++this.payloadSerial;
    const critical = shotNoise(seed * 97) < w.critChance;
    const shot: Bullet = {
      active: true,
      kind,
      serial: 0,
      seed,
      age: 0,
      x: origin + dx,
      previousX: origin + dx,
      z: 0.7 + this.crowd.push,
      previous: 0.7 + this.crowd.push,
      y: 0.72,
      vx: kind === "scatter" ? dx * 18 : kind === "cryo" ? dx * 8 : 0,
      phase,
      target: -1,
      aimX: this.aim,
      damage: damage * (critical ? w.critDamage : 1),
      gatePower:
        Math.round(
          Math.min(
            GATE_POWER_CAP,
            w.damage *
              (kind === "pulse" ? w.shotScale : w.gunShotScale) *
              GATE_GAIN,
          ) * 1000,
        ) / 1000,
      coreColor: kind === "pulse" ? w.coreColor : def.core,
      haloColor: critical
        ? "#ffffff"
        : kind === "pulse"
          ? w.haloColor
          : def.color,
      width: (kind === "pulse" ? w.width : def.size) * w.size,
      length: kind === "pulse" ? w.length : def.size * 3,
      trail: [],
      hitIds: [],
      returning: false,
      fragment: false,
      ricochets: kind === "saw" ? 2 : 0,
      payload: {
        superSource: source,
        superOnly: superSource !== undefined,
        pierce:
          w.pierce +
          (kind === "rail"
            ? 2
            : kind === "sonic" || kind === "crescent"
              ? 90
              : 0),
        chain: w.chain + (kind === "storm" ? 2 : 0),
        chainDamage: w.chainDamage,
        burn: w.burn,
        breach: w.breach,
        unarmored: w.unarmored,
        radius: Math.max(def.radius * w.radiusScale, w.blastRadius),
        splash: Math.max(def.radius > 0 ? 0.65 : 0, w.splash),
        size: w.size,
        echoCount: superSource !== undefined ? 0 : w.echoCount,
        echoDamage: w.echoDamage,
      },
    };
    if (delay) this.queueShot(shot, delay);
    else this.allocateShot(shot);
    for (let i = 0; i < (superSource !== undefined ? 0 : w.echoCount); i++)
      this.queueShot(
        {
          ...shot,
          damage: shot.damage * w.echoDamage,
          payload: { ...shot.payload!, echoCount: 0 },
        },
        delay + (i + 1) * 12,
      );
  }
  queueShot(shot: Bullet, delay: number) {
    if (this.pendingShots.length < 4096)
      this.pendingShots.push({
        tick: this.tick + delay,
        shot: { ...shot, payload: { ...shot.payload! } },
      });
    else this.droppedSchedules++;
  }
  payloadSerial = 0;
  damagePayload(e: Enemy, amount: number, payload?: Bullet["payload"]) {
    if (e.dead) return;
    // Evaluate the ordinary and boosted payloads against the same armor snapshot.
    // Dividing the final damage loses ordinary armor penetration at the boss cap.
    const withArmor = (value: number) => {
      const armorDamage = Math.min(e.armor, value * (payload?.breach ?? 1));
      const remaining = Math.max(
        0,
        value - armorDamage / (payload?.breach ?? 1),
      );
      return armorDamage + remaining * (payload?.unarmored ?? 1);
    };
    const nitro =
      payload?.superSource !== undefined &&
      !payload.superOnly &&
      this.supers.archive.get(payload.superSource)?.id === "nitro";
    this.supers.arsenalDamage(
      e,
      withArmor(amount),
      payload,
      nitro ? withArmor(amount / 1.5) : undefined,
    );
  }

  unobstructed(x: number, z: number, tx: number, tz: number) {
    for (const g of this.gates) {
      if (g.passed || g.z < Math.min(z, tz) || g.z > Math.max(z, tz)) continue;
      const at = x + (tx - x) * ((g.z - z) / (tz - z || 1));
      if (bulletGate(at, this.mode) !== undefined) return false;
    }
    return true;
  }
  updatePayloads(scroll: number) {
    let write = 0;
    for (const pending of this.pendingShots) {
      if (pending.tick <= this.tick) {
        pending.shot.z = pending.shot.previous = 0.7 + this.crowd.push;
        this.allocateShot(pending.shot);
      } else this.pendingShots[write++] = pending;
    }
    this.pendingShots.length = write;
    for (const e of this.enemies) {
      if (e.dead || !e.burns?.length) continue;
      let keep = 0;
      for (const b of e.burns) if (b.until > this.tick) e.burns[keep++] = b;
      e.burns.length = keep;
      for (const b of e.burns)
        this.supers.arsenalDamage(e, b.perTick, {
          superSource: b.superSource,
          superOnly: b.superOnly,
        } as ShotPayload);
    }
    for (const field of this.fields) {
      if (!field.active) continue;
      field.age += DT;
      field.z -= scroll;
      if (field.age >= 2 || field.z < -2) {
        field.active = false;
        continue;
      }
      for (const e of this.enemies) {
        if (
          e.dead ||
          Math.hypot(e.x - field.x, e.z - field.z) > field.radius ||
          !this.unobstructed(field.x, field.z, e.x, e.z)
        )
          continue;
        if (field.kind === "gravity" && !e.boss && e.prepareUntil <= this.tick)
          e.x += clamp(field.x - e.x, -1.7 * DT, 1.7 * DT);
        if (this.tick % 6 === 0)
          this.damagePayload(e, field.damage * 0.065, field.payload);
      }
    }
  }
  splitCluster(b: Bullet) {
    if (b.fragment) return;
    for (let n = 0; n < 5; n++)
      this.allocateShot({
        ...b,
        age: 0,
        damage: b.damage * 0.34,
        fragment: true,
        x: b.x,
        previousX: b.x,
        previous: b.z,
        vx: (n - 2) * 3,
        width: b.width * 0.55,
        ricochets: 0,
        payload: { ...b.payload!, echoCount: 0 },
      });
    b.active = false;
  }
  projectileImpact(b: Bullet, z: number, damage: boolean, direct?: Enemy) {
    const def = ARSENAL[b.kind],
      x = crossingX(b, z);
    const effect =
      this.impacts.find((e) => !e.active) ??
      this.impacts.reduce((a, e) => (e.age > a.age ? e : a));
    Object.assign(effect, {
      active: true,
      serial: b.serial,
      kind: b.kind,
      x,
      z,
      age: 0,
      radius: Math.max(0.45, b.payload?.radius ?? def.radius),
      seed: b.seed,
    });
    this.weaponSound(b.kind, x, true);
    if (!damage) return;
    const payload = b.payload;
    if (direct) {
      this.damagePayload(direct, b.damage, payload);
      if (payload?.burn && !direct.dead) {
        direct.burns ??= [];
        // Aggregate by expiry tick: bounded at 120 entries even in a huge volley.
        const until = this.tick + 120;
        const same = direct.burns.find(
          (v) =>
            v.until === until &&
            v.superSource === payload.superSource &&
            v.superOnly === payload.superOnly,
        );
        if (same) same.perTick += (b.damage * payload.burn) / 120;
        else
          direct.burns.push({
            until,
            superSource: payload.superSource,
            superOnly: payload.superOnly,
            perTick: (b.damage * payload.burn) / 120,
          });
      }
      if (!direct.boss && b.kind === "cryo") {
        direct.slowUntil = this.tick + 120;
        direct.slowFactor = 0.55;
      }
      if (!direct.boss && b.kind === "sonic")
        direct.staggerUntil = this.tick + 24;
    }
    const radius = payload?.radius ?? def.radius;
    if (radius > 0)
      for (const enemy of this.enemies) {
        if (
          enemy === direct ||
          enemy.dead ||
          !this.unobstructed(x, z, enemy.x, enemy.z)
        )
          continue;
        const distance = Math.hypot(enemy.x - x, enemy.z - z);
        if (distance < radius)
          this.damagePayload(
            enemy,
            b.damage * (payload?.splash ?? 0.65) * (1 - distance / radius),
            payload,
          );
      }
    if (direct && payload?.chain) {
      const visited = new Set([direct.id]);
      let from = direct;
      for (let jump = 0; jump < payload.chain; jump++) {
        const next = this.enemies
          .filter(
            (e) =>
              !e.dead &&
              !visited.has(e.id) &&
              Math.hypot(e.x - from.x, e.z - from.z) < 4.5 &&
              this.unobstructed(from.x, from.z, e.x, e.z),
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - from.x, a.z - from.z) -
                Math.hypot(b.x - from.x, b.z - from.z) || a.id - b.id,
          )[0];
        if (!next) break;
        this.arcEffects.push({
          x: from.x,
          z: from.z,
          tx: next.x,
          tz: next.z,
          age: 0,
          color: ARSENAL[b.kind].color,
        });
        if (this.arcEffects.length > 64) this.arcEffects.shift();
        this.damagePayload(
          next,
          b.damage * payload.chainDamage * Math.pow(0.7, jump),
          payload,
        );
        visited.add(next.id);
        from = next;
      }
    }
    if (payload && (b.kind === "cinder" || b.kind === "gravity")) {
      const field = {
        active: true,
        kind: b.kind,
        x,
        z,
        age: 0,
        radius,
        damage: b.damage,
        payload,
      };
      const slot = this.fields.find((f) => !f.active);
      if (slot) Object.assign(slot, field);
      else if (this.fields.length < 48) this.fields.push(field);
    }
  }
  arcEffects: {
    x: number;
    z: number;
    tx: number;
    tz: number;
    age: number;
    color: string;
  }[] = [];
  // Scratch storage for one projectile's swept contacts, reused every tick.
  private contacts: { z: number; enemy?: Enemy; gate?: Gate }[] = [];
  private contactPool: { z: number; enemy?: Enemy; gate?: Gate }[] = [];
  private contact(z: number, enemy?: Enemy, gate?: Gate) {
    const n = this.contacts.length;
    let c = this.contactPool[n];
    if (!c)
      c = this.contactPool[n] = { z: 0, enemy: undefined, gate: undefined };
    c.z = z;
    c.enemy = enemy;
    c.gate = gate;
    this.contacts.push(c);
  }

  pickup(kind: Pickup) {
    this.pickupsCollected++;
    this.weaponEvents.push({
      serial: ++this.weaponEventSerial,
      kind,
      x: this.x,
      impact: false,
      pickup: true,
    });
    if (this.weaponEvents.length > 64) this.weaponEvents.shift();
    if (kind === "shield") this.shield += 35;
    else if (kind === "recruit") this.army += 20;
    else if (GUNS.includes(kind as Gun)) this.guns[kind as Gun] += 1;
    else this.boosts[kind as Boost] += 1;
    this.reward(
      kind === "recruit"
        ? "+20 REINFORCEMENTS"
        : kind === "shield"
          ? "+35 SHIELD"
          : `${PICKUPS[kind].name} · LEVEL ${GUNS.includes(kind as Gun) ? this.guns[kind as Gun] : this.boosts[kind as Boost]} · PERMANENT`,
    );
    this.effect(this.x, 0, "reward", 20);
  }
  update(input: Input, record = true) {
    if (this.over) return;
    const previousPush = this.crowd.push;
    const target =
      Math.round(
        clamp(Number.isFinite(input.x) ? input.x : 0, -ROAD_LIMIT, ROAD_LIMIT) *
          1000,
      ) / 1000;
    this.aim =
      Math.round(
        clamp(Number.isFinite(input.aim) ? input.aim! : target, -4.5, 4.5) *
          1000,
      ) / 1000;
    if (record) {
      this.inputs.push(target);
      this.aims.push(this.aim);
      this.superInputs.push(
        (input.superCycle === -1 ? 1 : input.superCycle === 1 ? 2 : 0) +
          (input.superPressed ? 3 : 0),
      );
    }
    for (const impact of this.impacts)
      if (impact.active) {
        impact.age += DT;
        impact.z -= 8 * DT;
        if (impact.age > 0.85) impact.active = false;
      }
    this.tick++;
    this.supers.select(input.superCycle ?? 0);
    if (input.superPressed) this.supers.activate();
    this.supers.update();
    this.x += clamp(target - this.x, -MOVE_SPEED * DT, MOVE_SPEED * DT);
    this.crowdX += (this.x - this.crowdX) * (1 - Math.exp(-DT * 4));
    if (!this.bossActive)
      this.distance = Math.min(this.nextBoss, this.distance + 3.2 * DT);
    if (this.bossRemains.length)
      this.bossRemains = this.bossRemains.filter(
        (e) => this.tick - (e.deathTick ?? 0) < 360,
      );
    const scroll = 8 * DT;
    if (
      !this.bossActive &&
      !this.bossPending &&
      this.distance >= this.nextBoss - 20
    )
      this.bossPending = true;
    if (
      this.bossPending &&
      this.distance >= this.nextBoss &&
      !this.gates.length &&
      !this.enemies.length &&
      !this.drops.length &&
      !this.hazards.length
    ) {
      this.bossPending = false;
      this.bossActive = true;
      this.template = "Boss containment";
      this.spawnEnemy(BOSSES[this.bossIndex], 0, 38, true);
      this.reward(`WARNING · ${BOSSES[this.bossIndex].toUpperCase()}`);
    }
    if (
      !this.bossActive &&
      !this.bossPending &&
      this.distance >= this.nextEncounter
    ) {
      this.generate();
      this.nextEncounter =
        this.distance +
        this.encounterScale.spacing *
          (this.mode === "Swarm" && this.distance > 45 ? 0.85 : 1) *
          (0.85 + this.rng.next() * 0.3);
    }
    if (
      this.bossIndex > 0 &&
      !this.bossActive &&
      !this.bossPending &&
      this.distance >= this.nextSupply
    ) {
      const safe = LANES.filter(
        (x) =>
          !this.hazards.some(
            (h) => h.endAt >= this.tick && h.lanes.includes(LANES.indexOf(x)),
          ) &&
          !this.enemies.some(
            (e) => !e.dead && Math.abs(e.x - x) < 1 && e.z < 26,
          ),
      );
      this.supply(safe.length ? safe[this.loot.rng.int(safe.length)] : this.x);
    }
    this.updatePayloads(scroll);
    this.fireClock -= DT;
    const weapon = weaponStats(this.boosts);
    const nitro = this.supers.active("nitro") ? 3 : 1;
    const rate =
      (3 + Math.min(3, Math.sqrt(this.army) * 0.09)) *
      (1 + (this.upgrades[2] * UPGRADE_PERCENT[2]) / 100) *
      weapon.cadence *
      nitro;
    while (this.fireClock <= 0) {
      this.fireClock += 1 / rate;
      this.shots++;
      this.weaponSound("pulse", this.x, false);
      const damage =
        (1.4 + Math.min(12, Math.sqrt(this.army) * 0.28)) *
        (1 + (this.upgrades[1] * UPGRADE_PERCENT[1]) / 100) *
        weapon.damage *
        weapon.shotScale;
      const origins = formationPositions(this.mode, this.x);
      for (const origin of origins)
        for (const dx of weapon.offsets)
          this.launch(
            "pulse",
            origin,
            dx * (this.mode === "Mirror" ? 0.5 : 1),
            damage / origins.length,
            0,
            0,
            undefined,
            weapon,
          );
    }
    for (const kind of GUNS) {
      if (!this.guns[kind]) continue;
      this.gunClocks[kind] -= DT;
      if (this.gunClocks[kind] > 0) continue;
      const def = ARSENAL[kind];
      this.gunClocks[kind] += def.interval / weapon.gunCadence / nitro;
      const origins = formationPositions(this.mode, this.x);
      const count =
        kind === "helix"
          ? 2
          : kind === "scatter" || kind === "cryo" || kind === "needle"
            ? 3
            : 1;
      for (const origin of origins)
        for (let n = 0; n < count; n++) {
          const damage =
            ((1.4 + Math.min(12, Math.sqrt(this.army) * 0.28)) *
              (1 + (this.upgrades[1] * UPGRADE_PERCENT[1]) / 100) *
              weapon.damage *
              weapon.gunShotScale *
              def.damage *
              (1 + 0.22 * Math.sqrt(this.guns[kind] - 1))) /
            origins.length;
          this.launch(
            kind,
            origin,
            kind === "needle"
              ? n % 2
                ? 0.06
                : -0.06
              : (n - (count - 1) / 2) * 0.28,
            damage,
            n * Math.PI,
            kind === "needle" ? n * 3 : 0,
            undefined,
            weapon,
          );
        }
      this.weaponSound(kind, this.x, false);
    }
    for (const arc of this.arcEffects) {
      arc.age += DT;
      arc.z -= scroll;
      arc.tz -= scroll;
    }
    let arcs = 0;
    for (const a of this.arcEffects)
      if (a.age < 0.18) this.arcEffects[arcs++] = a;
    this.arcEffects.length = arcs;
    for (const b of this.bullets) {
      if (!b.active) continue;
      moveProjectile(b, this.enemies, this.aim, DT);
      const low = Math.min(b.previous, b.z),
        high = Math.max(b.previous, b.z);
      const contacts = this.contacts;
      contacts.length = 0;
      const shotSize = b.payload?.size ?? 1;
      const extraWidth =
        Math.max(0, shotSize - 1) * ARSENAL[b.kind].size +
        (b.kind === "sonic" ? 1.4 * shotSize : 0);
      for (const e of this.enemies) {
        if (e.dead || e.z < low - 0.5 || e.z > high + 0.5) continue;
        const width =
          (isNewBoss(e.kind)
            ? 4.1
            : e.boss
              ? 2.4
              : e.kind === "Crawler"
                ? 0.4
                : 0.7) + extraWidth;
        if (
          !b.hitIds?.includes(e.id) &&
          Math.abs(e.x - crossingX(b, e.z)) < width
        )
          this.contact(e.z, e);
      }
      for (const g of this.gates)
        if (
          !g.passed &&
          !b.hitGateIds?.includes(g.id) &&
          g.z >= low &&
          g.z <= high + scroll &&
          bulletGate(crossingX(b, g.z), this.mode) !== undefined
        )
          this.contact(g.z, undefined, g);
      if (contacts.length > 1)
        contacts.sort((a, c) => (b.returning ? c.z - a.z : a.z - c.z));
      for (const contact of contacts) {
        if (!b.active) break;
        if (contact.gate) {
          // Gates charge once per projectile without consuming its enemy hits.
          (b.hitGateIds ??= []).push(contact.gate.id);
          improveGate(
            contact.gate,
            bulletGate(crossingX(b, contact.z), this.mode)!,
            b.gatePower,
            this.mode,
          );
          this.projectileImpact(b, contact.z, false);
        } else if (contact.enemy && !contact.enemy.dead) {
          const e = contact.enemy;
          (b.hitIds ??= []).push(e.id);
          this.projectileImpact(b, e.z, true, e);
          if (b.kind === "cluster" && !b.fragment) {
            this.splitCluster(b);
            break;
          }
          if (b.ricochets) {
            b.ricochets--;
            const next = this.enemies
              .filter(
                (t) =>
                  !t.dead &&
                  !b.hitIds!.includes(t.id) &&
                  t.z > b.z &&
                  t.z - b.z < 14,
              )
              .sort(
                (a, c) =>
                  Math.hypot(a.x - b.x, a.z - b.z) -
                    Math.hypot(c.x - b.x, c.z - b.z) || a.id - c.id,
              )[0];
            if (next) b.target = next.id;
            if (next)
              b.vx =
                (next.x - b.x) /
                Math.max(0.08, (next.z - b.z) / ARSENAL[b.kind].speed);
          } else if (b.payload?.pierce) {
            // Each live shot owns its payload; echoes and fragments copy it.
            if (b.kind !== "crescent" && b.kind !== "sonic") b.payload.pierce--;
          } else b.active = false;
        }
      }
      if (b.active && b.kind === "cluster" && !b.fragment && b.age >= 0.7)
        this.splitCluster(b);
      if (
        b.active &&
        ((b.kind === "mortar" && b.age >= 1.5) ||
          ((b.kind === "gravity" || b.kind === "cinder") && b.age >= 1.2))
      ) {
        this.projectileImpact(b, b.z, true);
        b.active = false;
      }
      if (b.z > 58 || b.z < 0 || b.age > 4.5) b.active = false;
    }
    for (const g of this.gates) {
      g.z -= scroll;
      if (g.z < 20) g.revealed = true;
      if (g.wall >= 0 && this.tick % 9 === 0) {
        const center = g.wall === 0 ? -GATE_CENTER : GATE_CENTER;
        const centers =
          this.mode === "Mirror"
            ? formationPositions(this.mode, center)
            : [center];
        for (const wallX of centers) {
          const half = GATE_WIDTH / (this.mode === "Mirror" ? 4 : 2);
          const exposed = this.exposure(
            wallX - half,
            wallX + half,
            -g.z - 0.45,
            -g.z + 0.45,
          );
          if (exposed > 0.5)
            this.hitSquad(
              Math.min(Math.ceil(exposed), this.threatDamage(22)),
              "Barricade",
              wallX,
              g.z,
            );
        }
      }
      if (g.z <= this.crowd.push && !g.passed) {
        g.passed = true;
        const side = selectedGate(this.x);
        if (!side) continue;
        const op = side === "a" ? g.left : g.right;
        const old = this.army;
        this.army = this.supers.gate(
          g,
          gateResult(this.army, op, g[side], this.mode),
          Math.max(
            gateResult(this.army, g.left, g.a, this.mode),
            gateResult(this.army, g.right, g.b, this.mode),
          ),
        );
        g.passage = { tick: this.tick, side, delta: this.army - old };
        this.reward(
          `${this.army >= old ? "+" : ""}${this.army - old} SOLDIERS`,
        );
        this.effect(this.x, 0, "reward", this.army - old);
        if (!this.army) {
          this.over = true;
          this.outcome = "defeat";
          this.reason = "Depleting gate";
        }
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (this.supers.beforeEnemy(e)) continue;
      const previousZ = e.z;
      const movement = this.supers.movement(e);
      e.age++;
      if (e.motions.length) {
        let keep = 0;
        for (const m of e.motions)
          if (this.tick <= Math.max(m.end, m.strike + 54))
            e.motions[keep++] = m;
        e.motions.length = keep;
      }
      if (e.action === "summon" && e.prepareUntil <= this.tick) {
        for (
          let n = 0;
          n < (e.boss && e.phase === 2 ? 6 : e.boss ? 4 : 2);
          n++
        ) {
          const lane =
            this.mode === "Mirror"
              ? e.actionLane === 1
                ? n % 2
                  ? 0
                  : 2
                : 1
              : (e.actionLane + 1 + (n % 2)) % 3;
          this.spawnEnemy(
            "Crawler",
            LANES[lane] + (n > 1 ? (n % 2 ? 0.3 : -0.3) : 0),
            Math.max(12, e.z - 2) + Math.floor(n / 2) * 1.3,
          );
        }
        this.effect(e.x, e.z, "blast", 2);
        e.action = "";
      }
      if (e.action === "scream" && e.prepareUntil <= this.tick) {
        for (const other of this.enemies)
          if (!other.boss && Math.abs(e.z - other.z) < 12)
            other.buffUntil = this.tick + 180;
        e.action = "";
        this.reward("HOSTILES ACCELERATING");
      }
      if (
        e.action === "charge" &&
        e.prepareUntil <= this.tick &&
        this.mode !== "Fortress"
      ) {
        e.x = LANES[e.actionLane];
        e.z -= 20 * DT * movement;
      }
      if (e.boss) {
        const definition = bossDefinition(e.kind);
        // Body contact cannot despawn a required boss. Attack limbs reach the squad.
        e.z = Math.max(definition.arenaZ, e.z - scroll * 0.7 * movement);
        const nextPhase =
          1 + definition.phases.filter((p) => e.hp / e.maxHp <= p).length;
        if (nextPhase > e.phase) {
          e.phase = nextPhase;
          e.phaseTick = this.tick;
          e.phaseUntil = this.tick + (isNewBoss(e.kind) ? 120 : 0);
          if (isNewBoss(e.kind)) {
            this.hazards = this.hazards.filter(
              (h) =>
                h.source !== e.id || (h.releaseAt ?? h.strikeAt) <= this.tick,
            );
            e.motions = e.motions.filter(
              (m) => (m.release ?? m.strike) <= this.tick,
            );
            e.prepareUntil = this.tick;
          }
          this.reward(`PHASE ${e.phase} · KEEP MOVING`);
          this.effect(e.x, e.z, "armor");
        }
      } else
        e.z -=
          (8 +
            (this.mode === "Fortress" || e.prepareUntil > this.tick
              ? 0
              : e.speed *
                (e.buffUntil > this.tick ? 1.45 : 1) *
                ((e.staggerUntil ?? 0) > this.tick
                  ? 0.15
                  : (e.slowUntil ?? 0) > this.tick
                    ? (e.slowFactor ?? 1)
                    : 1))) *
          DT *
          movement;
      this.supers.barrier(e, previousZ);
      if (
        e.cooldown <= this.tick &&
        e.z < 38 &&
        e.prepareUntil <= this.tick &&
        (e.phaseUntil ?? 0) <= this.tick
      ) {
        if (this.supers.cancelAttack(e)) {
          e.cooldown =
            this.tick +
            (e.boss
              ? 210 * (this.supers.active("shannondoa") ? 1.25 : 1)
              : 300);
          continue;
        }
        e.attacks++;
        e.cooldown =
          this.tick +
          (e.boss ? 210 * (this.supers.active("shannondoa") ? 1.25 : 1) : 300);
        const lane = LANES.reduce(
          (best, v, i) =>
            Math.abs(v - formationPositions(this.mode, this.x)[0]) <
            Math.abs(LANES[best] - formationPositions(this.mode, this.x)[0])
              ? i
              : best,
          0,
        );
        if (e.kind === "Charger") {
          const h = this.warn(e.id, [lane], "charge", this.threatDamage(18));
          commitMotion(e, h);
          e.prepareUntil = h.strikeAt;
          e.actionLane = lane;
          e.action = "charge";
        }
        if (
          e.kind === "Spitter" ||
          (e.kind === "Broodmass" && e.attacks % 2 === 1)
        )
          commitMotion(
            e,
            this.warn(
              e.id,
              [lane],
              "pool",
              this.threatDamage(e.boss ? 25 : 12, e.boss),
              1.7,
              2,
            ),
          );
        if (e.kind === "Gunner") {
          const first = this.warn(
            e.id,
            [lane],
            "burst",
            this.threatDamage(5),
            1.6,
            0.12,
          );
          commitMotion(e, first);
          for (let n = 1; n < 3; n++) {
            const next = this.warn(
              e.id,
              [lane],
              "burst",
              this.threatDamage(5),
              1.6,
              0.12,
            );
            next.warnAt = first.warnAt;
            next.strikeAt = first.strikeAt + n * 12;
            next.endAt = first.endAt + n * 12;
            commitMotion(e, next);
          }
        }
        if (e.kind === "Screamer") {
          e.prepareUntil = this.tick + 72;
          e.action = "scream";
          e.motions.push({
            kind: "scream",
            start: this.tick,
            strike: e.prepareUntil,
            end: e.prepareUntil + 36,
            lane,
            variant: 0,
          });
          this.reward("SCREAMER · INTERRUPT THE CALL");
        }
        if (
          e.kind === "Carrier" ||
          (e.kind === "Broodmass" && e.attacks % 2 === 0)
        ) {
          e.prepareUntil = this.tick + 84;
          e.action = "summon";
          e.actionLane = lane;
          e.motions.push({
            kind: "summon",
            start: this.tick,
            strike: e.prepareUntil,
            end: e.prepareUntil + 42,
            lane,
            variant: e.attacks,
          });
        }

        if (e.kind === "Bulwark") {
          commitMotion(
            e,
            this.warn(
              e.id,
              e.phase === 2 ? [(lane + 1) % 3, (lane + 2) % 3] : [lane],
              "slam",
              this.threatDamage(32, true),
              1.8,
              0.25,
            ),
          );
        }
        if (e.kind === "Congregation") {
          for (let n = 0; n < (e.phase === 2 ? 4 : 3); n++)
            commitMotion(
              e,
              this.warn(
                e.id,
                [(lane + n) % 3],
                "strike",
                this.threatDamage(26, true),
                1.3,
                0.15,
              ),
            );
        }
        if (isNewBoss(e.kind)) scheduleBossAttack(this, e, lane);
        if (e.boss)
          e.cooldown = Math.max(
            e.cooldown,
            this.hazards.reduce(
              (latest, h) => Math.max(latest, h.endAt + 75),
              0,
            ),
          );
      }
      const exposed =
        e.z <= 0.6 + this.crowd.push
          ? this.exposure(
              e.x - (e.boss ? 2.4 : 0.65),
              e.x + (e.boss ? 2.4 : 0.65),
              -e.z - 0.7,
              -e.z + 1.1,
            )
          : 0;
      if (!e.boss && exposed > 0.5) {
        this.hitSquad(
          Math.min(
            this.contactDamage(e),
            Math.ceil(
              this.exposure(
                e.x - (e.boss ? 2.4 : 0.65),
                e.x + (e.boss ? 2.4 : 0.65),
              ),
            ),
          ),
          e.boss ? "Boss contact" : `${e.kind} contact`,
          e.x,
          e.z,
          false,
          e.id,
        );
        e.dead = true;
        this.effect(e.x, e.z, "corpse", e.boss ? 1.8 : 1, { style: "tumble" });
        if (e.boss) this.endBoss();
      } else if (e.z < -this.crowd.back - 1) e.dead = true;
      if (e.dead)
        this.hazards = this.hazards.filter(
          (h) => h.source !== e.id || h.strikeAt <= this.tick,
        );
    }
    for (const h of this.hazards) {
      if (this.supers.hazard(h)) continue;
      if (this.tick >= h.strikeAt && this.tick <= h.endAt && !h.hit) {
        const exposed = h.lanes.reduce(
          (n, l) => n + this.exposure(LANES[l] - 1.5, LANES[l] + 1.5),
          0,
        );
        if (exposed > 0.5) {
          h.hit = true;
          const lane = h.lanes.reduce(
            (best, l) =>
              Math.abs(LANES[l] - this.x) < Math.abs(LANES[best] - this.x)
                ? l
                : best,
            h.lanes[0],
          );
          this.hitSquad(
            Math.min(h.damage, Math.ceil(exposed)),
            `${h.kind} attack`,
            LANES[lane],
            -1.2,
            false,
            h.source,
          );
        }
      }
    }
    // Curb attrition is physical loss, not shield damage. Repacking naturally
    // stops it once the pyramid fits at the currently steered tip.
    this.peak = Math.max(this.peak, this.army);
    if (this.tick % 9 === 0) {
      const exposed = edgeExposure(this.army, this.mode, this.x, this.crowdX);
      if (exposed > 0.01) {
        const loss = Math.min(
          this.army,
          Math.max(1, Math.ceil(exposed * 0.12)),
        );
        const side = this.x < 0 ? -1 : 1;
        this.edgeLosses += loss;
        this.hitSquad(
          loss,
          "Crowd crushed against the curb",
          side * ROAD_EDGE,
          -(this.crowd.front + this.crowd.depth * 0.8),
          true,
        );
      }
    }
    for (const d of this.drops) {
      d.z -= scroll;
      if (
        // Recruitment or losses can move the tip past a pickup in one tick.
        d.z < 1 + Math.max(previousPush, this.crowd.push) &&
        d.z > -0.5 + Math.min(previousPush, this.crowd.push) &&
        formationPositions(this.mode, this.x).some(
          (x) => Math.abs(d.x - x) < 1.4,
        )
      ) {
        this.pickup(d.kind);
        d.z = -10;
      } else if (d.z <= -0.6) {
        this.reward(`MISSED · ${PICKUPS[d.kind].name}`);
      }
    }
    for (const e of this.effects) {
      if (!e.active) continue;
      e.age += DT;
      e.z -= scroll;
      if (e.age >= e.life) e.active = false;
    }
    // Compact in place: rendering holds entity references, and the fixed-tick
    // loop does not need four newly allocated arrays on every update.
    let write = 0;
    for (const g of this.gates)
      if (
        !g.passed ||
        (g.passage && this.tick - g.passage.tick < GATE_PASS_TICKS) ||
        (g.wall >= 0 && g.z > -this.crowd.back - 1)
      )
        this.gates[write++] = g;
    this.gates.length = write;
    write = 0;
    for (const e of this.enemies) if (!e.dead) this.enemies[write++] = e;
    this.enemies.length = write;
    write = 0;
    for (const d of this.drops) if (d.z > -0.6) this.drops[write++] = d;
    this.drops.length = write;
    write = 0;
    for (const h of this.hazards)
      if (h.endAt >= this.tick) this.hazards[write++] = h;
    this.hazards.length = write;
    this.peak = Math.max(this.peak, this.army);
  }
  replay(): Replay {
    return {
      version: VERSION,
      superLoadout: [...this.initialSuperLoadout],
      superLoadoutChanges: this.superLoadoutChanges.map((change) => ({
        ...change,
        loadout: [...change.loadout],
      })),
      superInputs: this.superInputs,
      seed: this.seed,
      mode: this.mode,
      upgrades: [...this.upgrades],
      debug: this.debug,
      inputs: this.inputs,
      aims: this.aims,
    };
  }
}
export function replayRun(replay: Replay) {
  if (replay.version !== VERSION) throw Error("Incompatible balance version");
  if (!validSuperReplay(replay)) throw Error("Invalid super weapon replay");
  const sim = new Simulation(
    replay.seed,
    replay.mode,
    replay.upgrades,
    replay.superLoadout,
  );
  sim.debug = replay.debug;
  for (const [i, x] of replay.inputs.entries()) {
    for (const change of replay.superLoadoutChanges ?? [])
      if (change.tick === i) sim.setSuperLoadout(change.loadout, false);
    sim.update(
      {
        x,
        aim: replay.aims?.[i],
        superCycle:
          replay.superInputs[i] % 3 === 1
            ? -1
            : replay.superInputs[i] % 3 === 2
              ? 1
              : 0,
        superPressed: replay.superInputs[i] >= 3,
      },
      false,
    );
  }
  for (const change of replay.superLoadoutChanges ?? [])
    if (change.tick === replay.inputs.length)
      sim.setSuperLoadout(change.loadout, false);
  return sim;
}
