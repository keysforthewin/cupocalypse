import { ARSENAL, GUNS, type Gun } from "./projectiles";
import { BOOSTS, type Boost, type Pickup } from "./types";

export const PICKUPS: Record<
  Pickup,
  { name: string; color: string; detail: string }
> = {
  ...(Object.fromEntries(
    GUNS.map((k) => [
      k,
      {
        name: ARSENAL[k].name,
        color: ARSENAL[k].color,
        detail: ARSENAL[k].description.toUpperCase(),
      },
    ]),
  ) as Record<Gun, { name: string; color: string; detail: string }>),
  damage: { name: "PLASMA CORE", color: "#ff9961", detail: "PERMANENT DAMAGE" },
  rate: { name: "OVERCLOCK", color: "#ffe680", detail: "PERMANENT FIRE RATE" },
  spread: { name: "SPLIT SHOT", color: "#69e9ff", detail: "PERMANENT SPREAD" },
  hero: { name: "NOVA REACTOR", color: "#c7a0ff", detail: "PERMANENT POWER" },
  warhead: {
    name: "WARHEAD PRESS",
    color: "#ff8568",
    detail: "+18% ALL-WEAPON DAMAGE / LEVEL",
  },
  feed: {
    name: "FEEDSTORM",
    color: "#eee477",
    detail: "FASTER FIRE · STACKS WITH OVERCLOCK",
  },
  titan: {
    name: "TITAN BORE",
    color: "#77ddf5",
    detail: "LARGER PROJECTILES & HIT COVERAGE",
  },
  phase: {
    name: "PHASE AWL",
    color: "#c9afff",
    detail: "+1 PENETRATION · THEN +10% DAMAGE",
  },
  fork: {
    name: "FORK CAPACITOR",
    color: "#b695ff",
    detail: "+1 CHAIN JUMP · THEN +10% ARC DAMAGE",
  },
  ember: {
    name: "EMBER JACKET",
    color: "#ff9652",
    detail: "+8% BURN DAMAGE OVER 2 SECONDS / LEVEL",
  },
  deadeye: {
    name: "DEADEYE PRISM",
    color: "#f99bc9",
    detail: "+8% CRITICAL CHANCE · THEN CRIT DAMAGE",
  },
  breach: {
    name: "BREACH TEETH",
    color: "#cedc9a",
    detail: "+35% ARMOR / +5% BODY DAMAGE PER LEVEL",
  },
  blast: {
    name: "BLAST IRIS",
    color: "#ffcb72",
    detail: "EXPLOSIVE HITS · LARGER, STRONGER SPLASH",
  },
  echo: {
    name: "ECHO CHAMBER",
    color: "#88f3c9",
    detail: "DELAYED VOLLEYS · STACKING ECHO DAMAGE",
  },
  shield: { name: "AEGIS", color: "#76aaff", detail: "+35 SHIELD" },
  recruit: { name: "REINFORCEMENTS", color: "#8affbc", detail: "+20 SOLDIERS" },
};
export const BULLET_CAPACITY = 4096;
// Levels are permanent for a run and serialize as ordinary finite numbers.
// Rate approaches a ceiling to keep the projectile pool and audio bounded.
export function boostLevels(): Record<Boost, number> {
  return Object.fromEntries(BOOSTS.map((k) => [k, 0])) as Record<Boost, number>;
}
export function weaponStats(input: Partial<Record<Boost, number>>) {
  const levels = { ...boostLevels(), ...input };
  // Split Shot stops widening at five projectiles; later levels and the
  // seven-shot volley they used to fire are paid out as per-shot damage.
  const wings = Math.min(2, levels.spread);
  const volley = 1 + 2 * Math.min(3, levels.spread);
  const offsets = Array.from(
    { length: wings * 2 + 1 },
    (_, i) => (i - wings) * 0.9,
  );
  // `rate` is the damage-per-second multiplier that balance and escalation
  // were tuned against. `cadence` is how often shots actually leave the
  // formation: Overclock and Feedstorm now add far fewer projectiles, and the
  // difference is folded into each projectile's damage (`shotScale`) so the
  // arsenal keeps its damage per second with far less on screen.
  const rate =
    (1 + (2 * levels.rate) / (levels.rate + 2)) *
    (1 + levels.feed / (levels.feed + 4));
  const cadence =
    (1 + (0.8 * levels.rate) / (levels.rate + 2)) *
    (1 + (0.4 * levels.feed) / (levels.feed + 4));
  const gunRate =
    Math.sqrt(1 + (2 * levels.rate) / (levels.rate + 2)) *
    (1 + levels.feed / (levels.feed + 4));
  const gunCadence = Math.sqrt(cadence);
  return {
    // Each visual channel composes independently, just like damage/rate/spread.
    coreColor: levels.damage ? "#ff9855" : "#ffd69a",
    haloColor: levels.hero ? "#c7a0ff" : levels.spread ? "#69e9ff" : "#ffd69a",
    width: 0.035 + Math.min(0.045, levels.damage * 0.009),
    length: levels.hero ? 1.05 : 0.7,
    size: 1 + (0.8 * levels.titan) / (levels.titan + 4),
    pierce: Math.min(6, levels.phase),
    chain: Math.min(4, levels.fork),
    chainDamage: 0.45 * (1 + 0.1 * Math.max(0, levels.fork - 4)),
    burn: 0.08 * levels.ember,
    critChance: Math.min(0.6, 0.08 * levels.deadeye),
    critDamage: 2 + 0.1 * Math.max(0, levels.deadeye - 7.5),
    breach: 1 + 0.35 * levels.breach,
    unarmored: 1 + 0.05 * levels.breach,
    blastRadius: levels.blast
      ? 0.9 + (1.5 * levels.blast) / (levels.blast + 3)
      : 0,
    radiusScale: 1 + (0.8 * levels.blast) / (levels.blast + 3),
    splash: levels.blast ? 0.25 + (0.5 * levels.blast) / (levels.blast + 4) : 0,
    echoCount: Math.min(2, levels.echo),
    echoDamage: 0.45 * (1 + 0.1 * Math.max(0, levels.echo - 2)),
    gunRate,
    rate,
    cadence,
    gunCadence,
    shotScale: (rate / cadence) * (volley / offsets.length),
    gunShotScale: gunRate / gunCadence,
    volley,
    damage:
      (1 +
        Math.sqrt(levels.damage) * 0.42 +
        Math.sqrt(levels.hero) * 0.32 +
        Math.sqrt(Math.max(0, levels.spread - 3)) * 0.09) *
      (1 + 0.18 * levels.warhead) *
      (1 + 0.1 * Math.max(0, levels.phase - 6)),
    offsets,
  };
}
