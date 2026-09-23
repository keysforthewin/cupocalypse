import type { Simulation } from "./simulation";
import type { Enemy, Gate, Hazard, ShotPayload } from "./types";
import { UPGRADE_PERCENT } from "./types";
import { ARSENAL, GUNS, type ProjectileKind } from "./projectiles";
import { weaponStats } from "./weapons";
import { SUPERS, sanitizeLoadout, type SuperId } from "./superWeapons";

export interface SuperSlot {
  readonly id: SuperId;
  charge: number;
  quota: number;
}
export interface SuperEvent {
  serial: number;
  tick: number;
  kind: "charge" | "ready" | "fire" | "hit" | "end" | "switch";
  id: SuperId;
  x: number;
  z: number;
  value: number;
  tx?: number;
  tz?: number;
}
export interface SuperCast {
  serial: number;
  id: SuperId;
  start: number;
  end: number;
  army: number;
  next: number;
  count: number;
  shield: number;
  absorbed: number;
  target: number;
  targets: number[];
  hits: Set<number>;
  bossDamage: Map<number, number>;
  bossSeen: Map<number, number>;
  points: { x: number; z: number; until: number }[];
  walls: number[];
  seeds: { target: number; tick: number; generation: number }[];
  weaponSnapshot?: ReturnType<typeof weaponStats>;
  snapshot?: {
    kind: ProjectileKind;
    damage: number;
    interval: number;
    next: number;
    count: number;
    offsets: number[];
  }[];
}
const hz = 60;
export class SuperSystem {
  readonly loadout: readonly SuperId[];
  readonly slots: SuperSlot[];
  selected = 0;
  serial = 0;
  eventSerial = 0;
  events: SuperEvent[] = [];
  casts: SuperCast[] = [];
  archive = new Map<number, SuperCast>();
  history: { tick: number; count: number }[] = [];
  losses: { tick: number; count: number }[] = [];
  constructor(
    readonly sim: Simulation,
    loadout: readonly SuperId[] = [],
  ) {
    this.loadout = Object.freeze(sanitizeLoadout(loadout));
    this.slots = this.loadout.map((id) => ({
      id,
      charge: 0,
      quota: this.minimum,
    }));
  }
  get minimum() {
    return Math.ceil((this.sim.mode === "Swarm" ? 90 : 50) / 3);
  }
  get slot() {
    return this.slots[this.selected];
  }
  get readySlots() {
    return this.slots.filter(
      (slot) => slot.charge >= slot.quota && !this.active(slot.id),
    );
  }
  active(id: SuperId) {
    return this.casts.find((c) => c.id === id && c.end > this.sim.tick);
  }
  event(
    kind: SuperEvent["kind"],
    id: SuperId,
    x = this.sim.x,
    z = 0,
    value = 1,
    tx?: number,
    tz?: number,
  ) {
    this.events.push({
      serial: ++this.eventSerial,
      tick: this.sim.tick,
      kind,
      id,
      x,
      z,
      value,
      tx,
      tz,
    });
    if (this.events.length > 160)
      this.events.splice(0, this.events.length - 160);
  }
  select(delta: number) {
    if (!this.slots.length || !delta) return;
    this.selected =
      (this.selected + (delta > 0 ? 1 : -1) + this.slots.length) %
      this.slots.length;
    this.event("switch", this.slot.id);
  }
  killed(e: Enemy, source?: number) {
    const s = this.sim;
    if (source !== undefined) {
      const c = this.archive.get(source);
      if (c?.id === "strawberry" && c.count < 35) {
        c.count++;
        s.army++;
      }
      return;
    }
    const last = this.history.at(-1);
    if (last?.tick === s.tick) last.count++;
    else this.history.push({ tick: s.tick, count: 1 });
    this.prune();
    const slot = this.slot;
    if (slot && slot.charge < slot.quota) {
      slot.charge++;
      this.event("charge", slot.id, e.x, e.z, slot.charge / slot.quota);
      if (slot.charge === slot.quota) this.event("ready", slot.id);
    }
    const gimmy = this.active("gimmy");
    if (gimmy && ++gimmy.count % 3 === 0 && gimmy.count <= 15) s.army += 5;
  }
  prune() {
    const t = this.sim.tick;
    while (this.history.length && this.history[0].tick <= t - 3600)
      this.history.shift();
    while (this.losses.length && this.losses[0].tick < t - 900)
      this.losses.shift();
  }
  recordLoss(count: number) {
    if (count > 0) this.losses.push({ tick: this.sim.tick, count });
  }
  activate() {
    const s = this.sim,
      slot = this.slot;
    if (s.over || !slot || slot.charge < slot.quota || this.active(slot.id))
      return false;
    this.prune();
    const rate =
      this.history.reduce((a, h) => a + h.count, 0) /
      Math.max(1, Math.min(60, s.time));
    slot.charge = 0;
    // About 25 seconds of ordinary kills: three times faster than the old target.
    slot.quota = Math.max(this.minimum, Math.ceil(rate * 25));
    const c: SuperCast = {
      serial: ++this.serial,
      id: slot.id,
      start: s.tick,
      end: s.tick + Math.round(SUPERS[slot.id].duration * hz),
      army: s.army,
      next: s.tick,
      count: 0,
      shield: 0,
      absorbed: 0,
      target: -1,
      targets: [],
      hits: new Set(),
      bossDamage: new Map(),
      bossSeen: new Map(),
      points: [],
      walls: [s.army, s.army, s.army],
      seeds: [],
    };
    this.casts.push(c);
    this.archive.set(c.serial, c);
    this.event("fire", c.id);
    if (c.id === "doc") {
      const restored = Math.floor(
        this.losses.reduce((n, l) => n + l.count, 0) * 0.6,
      );
      let remaining = restored;
      for (const loss of this.losses) {
        const n = Math.min(loss.count, remaining);
        loss.count -= n;
        remaining -= n;
      }
      s.army += restored;
      c.shield = Math.max(30, Math.ceil(c.army * 0.5));
    }
    if (c.id === "panda") c.shield = c.army * 2;
    if (c.id === "gimmy") {
      const collected = new Set<number>();
      for (const d of [...s.drops])
        if (d.z >= 0 && d.z <= 48) {
          this.event("hit", c.id, d.x, d.z, 1, s.x, 0);
          s.pickup(d.kind);
          s.pickup(d.kind);
          collected.add(d.id);
        }
      // Remove consumed salvage before the ordinary missed-pickup presentation.
      s.drops = s.drops.filter((drop) => !collected.has(drop.id));
    }
    if (c.id === "strawberry")
      for (const e of this.targets()
        .filter((e) => !e.boss)
        .slice(0, 5))
        this.seed(c, e, 0);
    if (c.id === "mmiguel") {
      const w = weaponStats(s.boosts),
        base =
          (1.4 + Math.min(12, Math.sqrt(c.army) * 0.28)) *
          (1 + s.upgrades[1] * UPGRADE_PERCENT[1] / 100) *
          w.damage;
      c.weaponSnapshot = w;
      c.snapshot = (
        ["pulse", ...GUNS.filter((k) => s.guns[k] > 0)] as ProjectileKind[]
      ).map((kind) => ({
        kind,
        damage:
          base *
          ARSENAL[kind].damage *
          (kind === "pulse" ? 1 : 1 + 0.22 * Math.sqrt(s.guns[kind] - 1)) *
          0.5,
        interval:
          kind === "pulse"
            ? 60 /
              ((6 + Math.min(6, Math.sqrt(c.army) * 0.18)) *
                (1 + s.upgrades[2] * UPGRADE_PERCENT[2] / 100) *
                w.rate)
            : (60 * ARSENAL[kind].interval) / w.gunRate,
        next: s.tick,
        count: 0,
        offsets:
          kind === "pulse"
            ? w.offsets
            : kind === "helix"
              ? [-0.14, 0.14]
              : ["scatter", "cryo"].includes(kind)
                ? [-0.28, 0, 0.28]
                : kind === "needle"
                  ? [-0.06, 0.06, -0.06, 0.06, -0.06]
                  : [0],
      }));
    }
    return true;
  }
  targets() {
    return this.sim.enemies
      .filter((e) => !e.dead && e.z >= 0 && e.z <= 48 && Math.abs(e.x) <= 5.5)
      .sort((a, b) => a.z - b.z || a.id - b.id);
  }
  damage(c: SuperCast, e: Enemy, amount: number) {
    if (e.dead || amount <= 0) return;
    if (e.boss) {
      const spent = c.bossDamage.get(e.id) || 0;
      const allowed = Math.max(0, e.maxHp * 0.35 - spent);
      amount = Math.min(amount, e.armor + allowed);
      const hpDamage = Math.min(e.hp, Math.max(0, amount - e.armor));
      c.bossDamage.set(e.id, spent + hpDamage);
    }
    this.sim.damageEnemy(e, amount, c.serial);
  }
  hit(c: SuperCast, e: Enemy, fraction: number, x = this.sim.x, z = 0) {
    this.damage(c, e, (e.maxHp + e.maxArmor) * fraction);
    this.event("hit", c.id, x, z, fraction, e.x, e.z);
  }
  arsenalDamage(
    e: Enemy,
    amount: number,
    payload?: ShotPayload,
    ordinaryDamage?: number,
  ) {
    const source = payload?.superSource,
      sourceCast = source === undefined ? undefined : this.archive.get(source);
    if (payload?.superOnly && sourceCast) {
      this.damage(sourceCast, e, amount);
      return;
    }
    const keys = this.active("keys");
    const nemesis = this.active("nemesis");
    const marked = nemesis?.target === e.id ? nemesis : undefined;
    const attribution = keys?.serial ?? marked?.serial ?? source;
    if (keys && this.inArea(e)) {
      if (!e.boss) {
        this.damage(keys, e, e.hp + e.armor);
        return;
      }
      if (!keys.hits.has(e.id)) {
        keys.hits.add(e.id);
        this.damage(keys, e, e.armor + e.maxHp * 0.25);
      }
    }
    const base =
      ordinaryDamage ?? (sourceCast?.id === "nitro" ? amount / 1.5 : amount);
    this.sim.damageEnemy(e, base, attribution);
    if (sourceCast?.id === "nitro") this.damage(sourceCast, e, amount - base);
    if (marked) this.damage(marked, e, amount * 2);
  }
  inArea(e: Enemy) {
    return e.z >= 0 && e.z <= 48 && Math.abs(e.x) <= 5.5;
  }
  seed(c: SuperCast, e: Enemy, generation: number) {
    if (c.hits.has(e.id) || c.hits.size >= 35) return;
    c.hits.add(e.id);
    c.seeds.push({ target: e.id, tick: this.sim.tick + 60, generation });
    this.event("hit", c.id, e.x, e.z, 0.2, e.x, e.z);
  }
  finish(c: SuperCast) {
    if (c.id === "panda" && c.absorbed > 0)
      for (const e of this.targets())
        this.hit(c, e, Math.min(1, c.absorbed * 0.01));
    this.event("end", c.id);
  }
  update() {
    const s = this.sim,
      t = s.tick;
    this.prune();
    for (const c of [...this.casts]) {
      if (c.end <= t) {
        this.finish(c);
        continue;
      }
      const age = t - c.start,
        list = this.targets();
      if (c.id === "mortal" && age >= 36 && c.count++ === 0) {
        const ids = new Set(list.filter((e) => !e.boss).map((e) => e.id));
        for (const e of list) this.hit(c, e, 1);
        s.hazards = s.hazards.filter((h) => !ids.has(h.source));
      }
      if (c.id === "keys")
        for (const e of list) {
          if (!c.bossSeen.has(e.id)) {
            e.armor = e.boss ? e.armor * 0.5 : 0;
            c.bossSeen.set(e.id, t);
          }
        }
      if (c.id === "tuna" && age <= 180) {
        const front = (age / 180) * 48;
        for (const e of list)
          if (e.z <= front && !c.hits.has(e.id)) {
            c.hits.add(e.id);
            this.hit(c, e, 0.6, 0, front);
            if (!e.boss && !e.dead) {
              e.z = Math.min(60, e.z + 12);
              e.slowUntil = t + 240;
              e.slowFactor = 0.5;
            }
          }
        s.hazards = s.hazards.filter((h) => {
          const e = s.enemies.find((e) => e.id === h.source);
          return e ? e.z > front : front < 48;
        });
      }
      if (c.id === "baezil") {
        c.points = [
          { x: -3, z: 12, until: c.end },
          { x: 0, z: 24, until: c.end },
          { x: 3, z: 36, until: c.end },
        ];
        if (age % 6 === 0)
          for (const e of list)
            if (c.points.some((p) => Math.hypot(e.x - p.x, e.z - p.z) < 2.5))
              this.hit(c, e, 0.025, e.x, e.z);
      }
      if (c.id === "machinegunqueen" && t >= c.next) {
        c.next = t + 5;
        const e = list.find((e) => !e.boss) || list[0];
        if (e) this.hit(c, e, 0.2, s.x, 3);
      }
      if (c.id === "zunneh" && t >= c.next) {
        c.next = t + 45;
        let x = s.x,
          z = 6;
        for (const e of list.slice(0, 5)) {
          this.hit(c, e, 0.45, x, z);
          x = e.x;
          z = e.z;
        }
      }
      if (c.id === "rae" && age % 6 === 0)
        for (const e of list)
          if (Math.abs(e.x - s.aim) < 1 + (e.boss ? 1.4 : 0.3))
            this.hit(c, e, 0.1, s.aim, 0);
      if (c.id === "mmiguel")
        for (const shot of c.snapshot || [])
          if (t >= shot.next) {
            shot.next += shot.interval;
            for (const sign of [-1, 1])
              for (const dx of shot.offsets)
                s.launch(
                  shot.kind,
                  Math.max(-4.5, Math.min(4.5, s.x + sign * 1.3)),
                  dx,
                  shot.damage,
                  0,
                  0,
                  c.serial,
                  c.weaponSnapshot,
                );
          }
      if (c.id === "strawberry") {
        const due = c.seeds.filter((seed) => seed.tick <= t);
        c.seeds = c.seeds.filter((seed) => seed.tick > t);
        for (const seed of due) {
          const e = s.enemies.find((e) => e.id === seed.target);
          // Remember the seed position even if an ordinary shot removed its host.
          const saved = c.points.find((p) => p.until === seed.target);
          if (!e && !saved) continue;
          const x = e?.x ?? saved!.x,
            z = e?.z ?? saved!.z;
          this.event("hit", c.id, x, z, 1, x, z);
          for (const target of this.targets())
            if (Math.hypot(target.x - x, target.z - z) < 2)
              this.hit(c, target, 0.6, x, z);
          if (seed.generation < 2)
            for (const target of this.targets()
              .filter((e) => !e.boss && !c.hits.has(e.id))
              .sort(
                (a, b) =>
                  Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z) ||
                  a.id - b.id,
              )
              .slice(0, 2))
              this.seed(c, target, seed.generation + 1);
        }
        for (const seed of c.seeds) {
          const e = s.enemies.find((e) => e.id === seed.target);
          if (e) {
            let p = c.points.find((p) => p.until === e.id);
            if (!p) {
              p = { x: e.x, z: e.z, until: e.id };
              c.points.push(p);
            }
            p.x = e.x;
            p.z = e.z;
          }
        }
      }
      if (c.id === "nemesis") {
        const target = list.find((e) => e.id === c.target);
        if (!target && c.count < 3) {
          const e = [...list].sort(
            (a, b) =>
              Number(b.boss) - Number(a.boss) ||
              b.hp + b.armor - (a.hp + a.armor) ||
              a.id - b.id,
          )[0];
          if (e) {
            c.target = e.id;
            c.count++;
          }
        }
      }
      if (c.id === "bronze-leopard" && t >= c.next && c.count < 6) {
        c.next = t + 24;
        c.count++;
        const e = list.find((e) => !e.boss) || list[0];
        if (e) {
          c.target = e.id;
          this.hit(c, e, e.boss ? (e.maxHp * 0.1) / (e.maxHp + e.maxArmor) : 1);
        }
      }
      if (
        c.id === "five10" &&
        age >= 30 &&
        (age - 30) % 60 === 0 &&
        c.count < 5
      ) {
        const pair = c.count++;
        for (const x of [-4.05 + pair * 0.9, 4.05 - pair * 0.9]) {
          this.event("hit", c.id, x, 24, 1, x, 48);
          for (const e of list)
            if (Math.abs(e.x - x) < 0.5 + (e.boss ? 1.4 : 0.3))
              this.hit(c, e, 1, x, 0);
        }
      }
      if (c.id === "shannondoa") {
        for (const e of list)
          if (!e.boss) {
            const sign = e.x === 0 ? (e.id % 2 ? 1 : -1) : Math.sign(e.x);
            if (Math.abs(e.x) < 2.2) e.x += (sign * 2.6) / 60;
          }
        for (const h of s.hazards) h.lanes = h.lanes.filter((l) => l !== 1);
        s.hazards = s.hazards.filter((h) => h.lanes.length);
      }
      if (c.id === "kuttula") {
        let capacity = 6;
        c.targets = [];
        for (const e of list) {
          const n = e.boss ? 2 : 1;
          if (capacity < n) continue;
          capacity -= n;
          c.targets.push(e.id);
          if (!c.bossSeen.has(e.id)) c.bossSeen.set(e.id, t);
          if (age % 6 === 0) this.hit(c, e, 0.035, e.x, e.z);
        }
      }
      if (c.id === "haut-carl") {
        if (t >= c.next && c.count < 6) {
          c.next = t + 36;
          c.count++;
          const target = [...list].sort(
            (a, b) =>
              list.filter((e) => Math.hypot(e.x - b.x, e.z - b.z) < 2.5)
                .length -
                list.filter((e) => Math.hypot(e.x - a.x, e.z - a.z) < 2.5)
                  .length || a.id - b.id,
          )[0];
          if (target) {
            const { x, z } = target;
            c.points.push({ x, z, until: t + 240 });
            this.event("hit", c.id, s.x, 0, 1, x, z);
            for (const e of list)
              if (Math.hypot(e.x - x, e.z - z) < 2.5) this.hit(c, e, 0.8, x, z);
          }
        }
        c.points = c.points.filter((p) => p.until > t);
        if (age % 6 === 0)
          for (const e of list)
            if (c.points.some((p) => Math.hypot(e.x - p.x, e.z - p.z) < 2.5))
              this.hit(c, e, 0.015, e.x, e.z);
      }
      if (c.id === "pokey" && t >= c.next && c.count < 24) {
        const e = list.find((e) => e.z <= s.crowd.push + 12);
        if (e) {
          c.next = t + 9;
          c.count++;
          this.hit(c, e, 0.6, s.x, 0);
        }
      }
      if (c.id === "panda" && c.shield <= 0) {
        this.finish(c);
        c.end = t;
      }
    }
    this.casts = this.casts.filter((c) => c.end > t);
    // Retain recent casts for delayed projectiles, burns and capped boss attribution.
    for (const [id, c] of this.archive)
      if (t - c.end > 1200) this.archive.delete(id);
  }
  beforeEnemy(e: Enemy) {
    const s = this.sim,
      t = s.tick;
    const silence = this.active("so1ician");
    if (silence && this.inArea(e)) {
      const pending = e.action !== "" && e.prepareUntil >= t;
      const hazards = s.hazards.filter(
        (h) => h.source === e.id && h.strikeAt > t,
      );
      if (pending || hazards.length) {
        e.action = "";
        e.prepareUntil = 0;
        e.motions.length = 0;
        s.hazards = s.hazards.filter(
          (h) => h.source !== e.id || h.strikeAt <= t,
        );
        this.punish(silence, e);
      }
      if (e.dead) return true;
    }
    const clock = this.active("sybex");
    if (clock && this.inArea(e)) {
      if (!clock.bossSeen.has(e.id)) clock.bossSeen.set(e.id, t);
      if (!e.boss || t - clock.bossSeen.get(e.id)! < 120) {
        e.cooldown++;
        if (e.prepareUntil > 0) e.prepareUntil++;
        for (const m of e.motions) {
          m.start++;
          m.strike++;
          m.end++;
        }
        for (const h of s.hazards)
          if (h.source === e.id) {
            h.warnAt++;
            h.strikeAt++;
            h.endAt++;
          }
        return true;
      }
    }
    return false;
  }
  punish(c: SuperCast, e: Enemy) {
    this.damage(
      c,
      e,
      e.boss ? e.armor + e.maxHp * 0.05 : (e.maxHp + e.maxArmor) * 0.4,
    );
    this.event("hit", c.id, e.x, e.z, 1, e.x, e.z);
  }
  cancelAttack(e: Enemy) {
    const c = this.active("so1ician");
    if (!c || !this.inArea(e)) return false;
    this.punish(c, e);
    return true;
  }
  movement(e: Enemy) {
    const c = this.active("kuttula");
    if (
      c?.targets.includes(e.id) &&
      (!e.boss || this.sim.tick - (c.bossSeen.get(e.id) || 0) < 120)
    )
      return 0;
    return !e.boss && this.active("shannondoa")?.end ? 0.4 : 1;
  }
  barrier(e: Enemy, previousZ: number) {
    const c = this.active("hondo"),
      front = this.sim.crowd.push + 8;
    if (!c || e.z > front || previousZ < front - 0.2) return;
    const lane = Math.max(0, Math.min(2, Math.round((e.x + 3) / 3)));
    if (c.walls[lane] <= 0) return;
    if (e.boss) {
      if (!c.bossSeen.has(e.id)) c.bossSeen.set(e.id, this.sim.tick);
      if (this.sim.tick - c.bossSeen.get(e.id)! >= 120) {
        c.walls[lane] = 0;
        return;
      }
    } else
      c.walls[lane] = Math.max(
        0,
        c.walls[lane] - this.sim.contactDamage(e) / 60,
      );
    e.z = front;
  }
  protect(amount: number, bypass: boolean, source?: number) {
    if (this.active("meesh")) return 0;
    if (bypass) return amount;
    const pauly = this.active("pauly");
    if (pauly) {
      amount *= 0.25;
      if (source !== undefined && this.sim.tick >= pauly.next) {
        const e = this.sim.enemies.find((e) => e.id === source && !e.dead);
        if (e) {
          pauly.next = this.sim.tick + 30;
          this.hit(pauly, e, 0.3);
        }
      }
    }
    for (const id of ["panda", "doc"] as const) {
      const c = this.active(id);
      if (c) {
        const n = Math.min(c.shield, amount);
        c.shield -= n;
        amount -= n;
        c.absorbed += n;
      }
    }
    return Math.ceil(amount);
  }
  hazard(h: Hazard) {
    const c = this.active("platypus");
    if (!c) return false;
    if (
      this.sim.tick >= h.strikeAt &&
      this.sim.tick <= h.endAt &&
      (h.kind === "pool" ? (this.sim.tick - h.strikeAt) % 60 === 0 : !h.hit)
    ) {
      for (const e of this.targets())
        if (h.lanes.some((l) => Math.abs(e.x - [-3, 0, 3][l]) < 1.5))
          this.hit(c, e, 0.35, e.x, e.z);
      h.hit = true;
    }
    return true;
  }
  gate(g: Gate, normal: number, better: number) {
    const c = this.active("kismet");
    if (!c || c.count >= 3) return normal;
    c.count++;
    if (this.sim.mode === "Sudden Death") {
      this.sim.shield += 40;
      return this.sim.army;
    }
    return this.sim.army + Math.max(0, better - this.sim.army) * 2;
  }
}
