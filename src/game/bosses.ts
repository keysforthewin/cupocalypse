import { BOSSES, type BossKind, type Enemy, type Hazard } from "./types";
import type { Simulation } from "./simulation";
import { commitMotion } from "./attacks";

export const BOSS_SPACING = 150;
export const CAMPAIGN_DISTANCE = BOSS_SPACING * BOSSES.length;
export interface BossDefinition {
  id: string;
  title: string;
  height: number;
  span: number;
  color: string;
  arenaZ: number;
  visualZ: number;
  seconds: number;
  healthMultiplier: number;
  phases: number[];
}
const definitions: BossDefinition[] = [
  {
    id: "bulwark",
    title: "The Armored Breach",
    height: 4.68,
    span: 4,
    arenaZ: 22,
    visualZ: 0,
    seconds: 30,
    healthMultiplier: 2,
    phases: [0.5],
    color: "#d49c79",
  },
  {
    id: "broodmass",
    title: "Mother of the Infected",
    height: 2.34,
    span: 6,
    arenaZ: 22,
    visualZ: 0,
    seconds: 35,
    healthMultiplier: 6,
    phases: [0.5],
    color: "#b3be87",
  },
  {
    id: "congregation",
    title: "The Many Become One",
    height: 6.48,
    span: 5,
    arenaZ: 24,
    visualZ: 0,
    seconds: 40,
    healthMultiplier: 12,
    phases: [0.5],
    color: "#cc997e",
  },
  {
    id: "grave-marshal",
    title: "The Unburied Commander",
    height: 11,
    span: 11,
    arenaZ: 24,
    visualZ: 4,
    seconds: 45,
    healthMultiplier: 18,
    phases: [0.5],
    color: "#dc815b",
  },
  {
    id: "widow-of-the-salvo",
    title: "The Walking Battery",
    height: 18,
    span: 22,
    arenaZ: 24,
    visualZ: 16,
    seconds: 50,
    healthMultiplier: 22,
    phases: [0.5],
    color: "#e7bd83",
  },
  {
    id: "ossuary-engine",
    title: "The Hospital That Walks",
    height: 28,
    span: 26,
    arenaZ: 24,
    visualZ: 35,
    seconds: 55,
    healthMultiplier: 22,
    phases: [0.5],
    color: "#b8d9c5",
  },
  {
    id: "seraph-of-the-wound",
    title: "The Skyborne Parasite",
    height: 44,
    span: 97,
    arenaZ: 24,
    visualZ: 66,
    seconds: 65,
    healthMultiplier: 28,
    phases: [0.5],
    color: "#b39bcf",
  },
  {
    id: "the-last-witness",
    title: "The World Inside the Wound",
    height: 70,
    span: 130,
    arenaZ: 24,
    visualZ: 120,
    seconds: 85,
    healthMultiplier: 34,
    phases: [0.65, 0.3],
    color: "#edd2a2",
  },
];
export const BOSS_DEFINITIONS = Object.fromEntries(
  BOSSES.map((name, i) => [name, definitions[i]]),
) as Record<BossKind, BossDefinition>;
export const NEW_BOSSES = BOSSES.slice(3);
export const bossDefinition = (kind: string) =>
  BOSS_DEFINITIONS[kind as BossKind];
export const isNewBoss = (kind: string) =>
  NEW_BOSSES.includes(kind as BossKind);

// Every offensive event uses the existing reservation scheduler. The same lane,
// release and impact ticks drive projectiles, animation, sound and collision.
export function scheduleBossAttack(
  sim: Simulation,
  enemy: Enemy,
  lane: number,
) {
  const phase = enemy.phase,
    cycle = (enemy.attacks - 1) % 3;
  const add = (
    name: string,
    kind: Hazard["kind"],
    lanes: number[],
    delay: number,
    duration = 0.22,
    trajectory?: Hazard["trajectory"],
  ) => {
    const h = sim.warn(
      enemy.id,
      lanes,
      kind,
      sim.threatDamage(19 + BOSSES.indexOf(enemy.kind as BossKind) * 1.6, true),
      delay,
      duration,
    );
    h.attack = name;
    if (trajectory) {
      h.trajectory = trajectory;
      h.releaseAt = h.strikeAt - Math.round(Math.min(1.15, delay * 0.55) * 60);
      h.origin = [
        enemy.x,
        Math.min(9, bossDefinition(enemy.kind).height * 0.6),
        enemy.z,
      ];
    }
    const motion = commitMotion(enemy, h);
    motion.clip = name;
    motion.release = h.releaseAt;
  };
  const next = (lane + 1) % 3;
  switch (enemy.kind) {
    case "Grave Marshal":
      if (cycle === 0) add("cleave", "strike", [lane], 1.8);
      if (cycle === 1) add("execution", "slam", [lane], 2.2);
      if (cycle === 2) add("heel", "charge", [lane], 1.9, 0.3, "wave");
      if (phase > 1) add("cleave", "strike", [next], 1.6);
      break;
    case "Widow of the Salvo":
      for (let n = 0; n < (phase > 1 ? 3 : 2); n++)
        add(
          cycle === 0 ? "mortar" : cycle === 1 ? "needles" : "shell",
          "burst",
          cycle === 2 ? [(lane + n) % 3, (lane + n + 1) % 3] : [(lane + n) % 3],
          1.65,
          0.3,
          cycle === 0 ? "arc" : cycle === 1 ? "spear" : "split",
        );
      break;
    case "Ossuary Engine":
      add(
        cycle === 0 ? "surgery" : cycle === 1 ? "restraint" : "rivets",
        cycle === 1 ? "pool" : "strike",
        [lane],
        1.9,
        cycle === 1 ? 1.1 : 0.3,
        cycle === 2 ? "spear" : undefined,
      );
      if (phase > 1) add("surgery", "strike", [next], 1.7);
      break;
    case "Seraph of the Wound":
      if (cycle === 0)
        for (let n = 0; n < (phase > 1 ? 3 : 2); n++)
          add("spears", "burst", [(lane + n) % 3], 1.7, 0.25, "spear");
      if (cycle === 1)
        for (let n = 0; n < 3; n++)
          add("beam", "burst", [(lane + n) % 3], 1.65, 0.4, "beam");
      if (cycle === 2) add("talon", "strike", [lane], 2.1, 0.4);
      break;
    case "The Last Witness":
      add(
        cycle === 0 ? "palm" : cycle === 1 ? "eyes" : "ribs",
        cycle === 0 ? "slam" : "burst",
        [lane],
        phase === 3 ? 1.7 : 2.1,
        0.35,
        cycle === 0 ? undefined : cycle === 1 ? "beam" : "spear",
      );
      if (phase > 1) add("ribs", "burst", [next], 1.6, 0.3, "spear");
      if (phase === 3) add("palm", "slam", [(lane + 2) % 3], 1.8, 0.4);
      break;
  }
}

/** Shared deterministic projectile path. z is positive forward, as in simulation. */
export function bossProjectilePosition(
  h: Hazard,
  lane: number,
  tick: number,
): [number, number, number] {
  const from = h.origin ?? [0, 5, 24];
  const t = Math.max(
    0,
    Math.min(
      1,
      (tick - (h.releaseAt ?? h.warnAt)) /
        (h.strikeAt - (h.releaseAt ?? h.warnAt)),
    ),
  );
  const destination = (lane - 1) * 3;
  const center =
    h.lanes.reduce((sum, l) => sum + (l - 1) * 3, 0) / h.lanes.length;
  const x =
    h.trajectory === "split"
      ? t < 0.55
        ? from[0] + (center - from[0]) * t
        : from[0] +
          (center - from[0]) * 0.55 +
          ((destination - (from[0] + (center - from[0]) * 0.55)) * (t - 0.55)) /
            0.45
      : from[0] + (destination - from[0]) * t;
  return [
    x,
    from[1] * (1 - t) +
      0.25 * t +
      (h.trajectory === "arc" || h.trajectory === "split"
        ? Math.sin(t * Math.PI) * 6
        : 0),
    from[2] * (1 - t),
  ];
}
