import type { Bullet, Enemy, Pickup } from "./types";
export const GUNS = [
  "seeker",
  "helix",
  "scatter",
  "cursor",
  "mortar",
  "rail",
  "storm",
  "saw",
  "cinder",
  "cryo",
  "gravity",
  "cluster",
  "crescent",
  "needle",
  "sonic",
] as const;
export type Gun = (typeof GUNS)[number];
export type ProjectileKind = "pulse" | Gun;
export const ARSENAL: Record<
  ProjectileKind,
  {
    name: string;
    color: string;
    core: string;
    speed: number;
    interval: number;
    damage: number;
    radius: number;
    size: number;
    description: string;
  }
> = {
  pulse: {
    name: "KINETIC",
    color: "#ffd294",
    core: "#fff3db",
    speed: 29,
    interval: 0.28,
    damage: 1,
    radius: 0,
    size: 0.09,
    description: "Kinetic darts",
  },
  seeker: {
    name: "HELLHOUND",
    color: "#ff9b45",
    core: "#ffe1a6",
    speed: 17,
    interval: 1.66,
    damage: 2.1,
    radius: 1.8,
    size: 0.19,
    description: "Heat-seeking missiles",
  },
  helix: {
    name: "HELIX",
    color: "#45e6ff",
    core: "#d6ffff",
    speed: 20,
    interval: 1.14,
    damage: 1.3,
    radius: 0.8,
    size: 0.23,
    description: "Twin weaving plasma",
  },
  scatter: {
    name: "WILDSHARD",
    color: "#bcff68",
    core: "#eeffce",
    speed: 23,
    interval: 1.46,
    damage: 0.8,
    radius: 0,
    size: 0.19,
    description: "Erratic ricochet shards",
  },
  cursor: {
    name: "WISP",
    color: "#d8a1ff",
    core: "#f7eaff",
    speed: 15,
    interval: 2.04,
    damage: 2.4,
    radius: 1.4,
    size: 0.3,
    description: "Mouse-guided energy orbs",
  },
  mortar: {
    name: "THUNDER",
    color: "#ff6553",
    core: "#ffe1a0",
    speed: 13,
    interval: 3.1,
    damage: 3.7,
    radius: 2.7,
    size: 0.27,
    description: "Arcing explosive shells",
  },
  rail: {
    name: "LONGSPIKE",
    color: "#a7ceff",
    core: "#fff5ed",
    speed: 44,
    interval: 2.2,
    damage: 2.3,
    radius: 0,
    size: 0.13,
    description: "Rail dart · pierces three enemies",
  },
  storm: {
    name: "STORMFORK",
    color: "#ab83ff",
    core: "#fff5ed",
    speed: 26,
    interval: 2.1,
    damage: 1.7,
    radius: 0,
    size: 0.22,
    description: "Lightning · two chain jumps",
  },
  saw: {
    name: "RIPSAW",
    color: "#ffbf57",
    core: "#fff5ed",
    speed: 21,
    interval: 2.4,
    damage: 1.7,
    radius: 0,
    size: 0.32,
    description: "Saw disc · three targets",
  },
  cinder: {
    name: "CINDERSEED",
    color: "#ff793e",
    core: "#fff5ed",
    speed: 18,
    interval: 2.8,
    damage: 1.6,
    radius: 1.3,
    size: 0.25,
    description: "Incendiary capsule · burning ground",
  },
  cryo: {
    name: "RIMEFANG",
    color: "#9fefff",
    core: "#fff5ed",
    speed: 25,
    interval: 2.1,
    damage: 0.75,
    radius: 0,
    size: 0.19,
    description: "Three frost darts · slow targets",
  },
  gravity: {
    name: "UNDERTOW",
    color: "#9a87e8",
    core: "#fff5ed",
    speed: 12,
    interval: 4,
    damage: 1.8,
    radius: 2.5,
    size: 0.34,
    description: "Gravity well · pulls and damages",
  },
  cluster: {
    name: "FIRECRACKER",
    color: "#ff6788",
    core: "#fff5ed",
    speed: 18,
    interval: 3.3,
    damage: 2.3,
    radius: 1.1,
    size: 0.28,
    description: "Splitting shell · five bomblets",
  },
  crescent: {
    name: "MOONREAVER",
    color: "#5df3bd",
    core: "#fff5ed",
    speed: 23,
    interval: 2.6,
    damage: 1.45,
    radius: 0,
    size: 0.3,
    description: "Returning blade · strikes both ways",
  },
  needle: {
    name: "STITCHER",
    color: "#f58fe4",
    core: "#fff5ed",
    speed: 35,
    interval: 2.2,
    damage: 0.9,
    radius: 0,
    size: 0.09,
    description: "Three-needle rapid burst",
  },
  sonic: {
    name: "BELLHAMMER",
    color: "#f7de78",
    core: "#fff5ed",
    speed: 19,
    interval: 3,
    damage: 1.3,
    radius: 0,
    size: 0.45,
    description: "Wide pressure wave · staggers enemies",
  },
};
export interface OrdnanceImpact {
  active: boolean;
  serial: number;
  kind: ProjectileKind;
  x: number;
  z: number;
  age: number;
  radius: number;
  seed: number;
}
export interface WeaponEvent {
  serial: number;
  kind: ProjectileKind | Pickup;
  pickup?: boolean;
  x: number;
  impact: boolean;
}
export function gunLevels(): Record<Gun, number> {
  return Object.fromEntries(GUNS.map((k) => [k, 0])) as Record<Gun, number>;
}
// Hashing the shot serial leaves encounter randomness untouched.
export function shotNoise(seed: number) {
  let n = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function moveProjectile(
  b: Bullet,
  enemies: Enemy[],
  aim: number,
  dt: number,
) {
  b.previous = b.z;
  b.previousX = b.x;
  b.age += dt;
  const def = ARSENAL[b.kind];
  if (b.kind === "seeker") {
    let target = enemies.find(
      (e) => e.id === b.target && !e.dead && e.z > b.z - 0.3,
    );
    if (!target) {
      let best = Infinity;
      for (const e of enemies)
        if (!e.dead && e.z > b.z && e.z - b.z < 30) {
          const score = e.z - b.z + Math.abs(e.x - b.x) * 2;
          if (score < best) {
            best = score;
            target = e;
          }
        }
      b.target = target?.id ?? -1;
    }
    const desired = target
      ? Math.max(-10, Math.min(10, (target.x - b.x) * 5))
      : 0;
    b.vx += (desired - b.vx) * Math.min(1, dt * 5);
  } else if (b.kind === "saw" && b.target >= 0) {
    const target = enemies.find(
      (e) => e.id === b.target && !e.dead && e.z > b.z,
    );
    if (target)
      b.vx = Math.max(
        -35,
        Math.min(
          35,
          (target.x - b.x) /
            Math.max(dt, (target.z - b.z) / (def.speed + 8 + target.speed)),
        ),
      );
  } else if (b.kind === "cursor") {
    b.vx +=
      (Math.max(-11, Math.min(11, (aim - b.x) * 5)) - b.vx) *
      Math.min(1, dt * 4);
  } else if (b.kind === "helix") {
    b.vx = Math.cos(b.age * 6 + b.phase) * 5.5;
  } else if (b.kind === "scatter") {
    const segment = Math.floor(b.age / 0.22);
    const desired = (shotNoise(b.seed + segment * 71) * 2 - 1) * 9;
    b.vx += (desired - b.vx) * Math.min(1, dt * 12);
  } else if (b.kind === "mortar") {
    b.vx +=
      (Math.max(-4, Math.min(4, (b.aimX - b.x) * 2)) - b.vx) *
      Math.min(1, dt * 3);
  }
  b.x += b.vx * dt;
  if (b.kind === "crescent") {
    if (b.age >= 0.95 && !b.returning) {
      b.returning = true;
      b.hitIds = [];
    }
    b.vx = Math.sin(b.age * 4 + b.phase) * 3;
  }
  b.vz = b.returning ? -def.speed : def.speed;
  b.z += b.vz * dt;
  if (Math.abs(b.x) > 4.65) {
    b.x = Math.sign(b.x) * 4.65;
    b.vx *= -0.7;
  }
  b.y =
    b.kind === "mortar"
      ? 0.65 + Math.sin(Math.min(1, b.age / 1.5) * Math.PI) * 2.5
      : 0.72 + (b.kind === "cursor" ? Math.sin(b.age * 5 + b.phase) * 0.16 : 0);
  // Recycle the oldest trail point instead of allocating one per tick.
  const point: [number, number, number] =
    b.trail.length >= 12 ? b.trail.pop()! : [0, 0, 0];
  point[0] = b.x;
  point[1] = b.y;
  point[2] = b.z;
  b.trail.unshift(point);
}
// Swept lateral position is shared by enemy and gate intersections.
export function crossingX(b: Bullet, z: number) {
  const t = Math.max(
    0,
    Math.min(1, (z - b.previous) / (b.z - b.previous || 1)),
  );
  return b.previousX + (b.x - b.previousX) * t;
}
