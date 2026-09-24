import type { Effect } from "../game/types";
import { effectRandom } from "../game/deaths";

export type DebrisKind =
  "torso" | "limb" | "head" | "plate" | "bone" | "chunk" | "spark";
export interface DebrisPiece {
  kind: DebrisKind;
  offset: [number, number, number];
  size: [number, number, number];
  velocity: [number, number, number];
  spin: [number, number, number];
  tint: string;
  linked: boolean;
  life: number;
}
const cloth = ["#4c4940", "#655a49", "#3b4848", "#6a554f", "#565e43"];
export function debrisRecipe(e: Effect): DebrisPiece[] {
  const r = (i: number) => effectRandom(e.seed, i);
  const body = e.kind === "corpse";
  const armor = e.style === "armor" || e.kind === "armor";
  const acid = e.style === "acid";
  const linked =
    body &&
    (e.style === "collapse" || e.style === "tumble" || e.style === "soldier");
  const scale = body ? Math.max(0.3, e.value) : 0.55;
  const uniform =
    e.style === "soldier" ? "#5b6653" : cloth[Math.floor(r(4) * cloth.length)];
  const flesh = acid ? "#667331" : "#591d1a";
  const parts: {
    kind: DebrisKind;
    offset: [number, number, number];
    size: [number, number, number];
    tint: string;
  }[] = body
    ? [
        {
          kind: "torso",
          offset: [0, 1.1, 0],
          size: [0.32, 0.52, 0.2],
          tint: uniform,
        },
        {
          kind: "head",
          offset: [0, 1.65, 0.02],
          size: [0.16, 0.2, 0.17],
          tint: e.style === "soldier" ? "#626f52" : "#9b8170",
        },
        ...([-1, 1] as const).flatMap((side) => [
          {
            kind: "limb" as const,
            offset: [side * 0.37, 1.05, 0] as [number, number, number],
            size: [0.105, 0.52, 0.105] as [number, number, number],
            tint: uniform,
          },
          {
            kind: "limb" as const,
            offset: [side * 0.16, 0.47, 0] as [number, number, number],
            size: [0.125, 0.65, 0.13] as [number, number, number],
            tint: uniform,
          },
          {
            kind: "plate" as const,
            offset: [side * 0.16, 0.1, 0.1] as [number, number, number],
            size: [0.13, 0.12, 0.23] as [number, number, number],
            tint: "#303431",
          },
        ]),
      ]
    : [];
  const count = body
    ? linked
      ? 3
      : 8 + Math.floor(r(8) * 11)
    : e.kind === "armor"
      ? 11
      : e.kind === "reward"
        ? 10
        : 7;
  for (let i = 0; i < count; i++) {
    const kind: DebrisKind =
      armor && i % 3 !== 0
        ? "plate"
        : armor
          ? "spark"
          : body && i % 5 === 0
            ? "bone"
            : "chunk";
    parts.push({
      kind,
      offset: [
        (r(i * 17 + 1) - 0.5) * 0.45,
        0.65 + r(i * 17 + 2) * 0.75,
        (r(i * 17 + 3) - 0.5) * 0.25,
      ],
      size:
        kind === "bone"
          ? [0.04, 0.23, 0.04]
          : kind === "plate"
            ? [0.15 + r(i + 40) * 0.17, 0.05, 0.14]
            : [
                0.04 + r(i + 41) * 0.09,
                0.04 + r(i + 42) * 0.09,
                0.05 + r(i + 43) * 0.09,
              ],
      tint:
        kind === "bone"
          ? "#b3a086"
          : kind === "spark"
            ? "#ffc46b"
            : kind === "plate"
              ? "#63716d"
              : e.kind === "reward"
                ? "#82d7b8"
                : flesh,
    });
  }
  return parts.map((p, i) => {
    const angle = r(i * 29 + 31) * Math.PI * 2;
    const spread = (0.6 + r(i * 29 + 32) * 3.2) * e.energy;
    const connected = linked && i < 8;
    return {
      ...p,
      offset: p.offset.map((v) => v * scale) as [number, number, number],
      size: p.size.map((v) => v * scale * (0.8 + r(i * 29 + 33) * 0.45)) as [
        number,
        number,
        number,
      ],
      velocity: [
        Math.sin(angle) * spread + Math.sin(e.direction) * 2,
        1.2 + r(i * 29 + 34) * (e.style === "rupture" ? 6 : 3.8),
        Math.cos(angle) * spread - (e.style === "shred" ? 2.3 : 0.4),
      ],
      spin: [
        r(i * 29 + 35) * 12 - 6,
        r(i * 29 + 36) * 12 - 6,
        r(i * 29 + 37) * 10 - 5,
      ],
      linked: connected,
      life:
        p.kind === "spark"
          ? 0.25 + r(i + 48) * 0.45
          : body
            ? e.life
            : 0.4 + r(i + 49) * 0.9,
    };
  });
}
/** Ballistic flight, two diminishing bounces, then rest. Evaluated from event
 * time so pause, slow frames and replay seeking never change debris motion. */
export interface DebrisPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  fade: number;
}
export function debrisPose(
  e: Effect,
  p: DebrisPiece,
  out: DebrisPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, fade: 1 },
): DebrisPose {
  const t = e.age;
  const floor = Math.min(...p.size) * 0.65 + 0.025;
  const gravity = 13;
  const landing =
    (p.velocity[1] +
      Math.sqrt(p.velocity[1] ** 2 + 2 * gravity * p.offset[1])) /
    gravity;
  let height = p.offset[1] + p.velocity[1] * t - (gravity * t * t) / 2;
  let bounceTime = t - landing;
  const impactSpeed = Math.sqrt(p.velocity[1] ** 2 + 2 * gravity * p.offset[1]);
  if (bounceTime > 0) {
    let speed = impactSpeed * 0.27;
    for (let n = 0; n < 2; n++) {
      const duration = (speed * 2) / gravity;
      height = speed * bounceTime - (gravity * bounceTime * bounceTime) / 2;
      if (bounceTime <= duration) break;
      bounceTime -= duration;
      speed *= 0.24;
      height = 0;
    }
  }
  const travel =
    Math.min(t, landing) +
    (t > landing ? (1 - Math.exp(-(t - landing) * 6)) / 6 : 0);
  const fade = Math.max(0, Math.min(1, (p.life - t) / 0.45));
  if (p.linked) {
    const fall = Math.min(1, t / (e.style === "collapse" ? 0.48 : 0.7));
    const angle = (fall * Math.PI) / 2;
    const localY = p.offset[1] - Math.max(0.3, e.value) * 0.85;
    const centerY =
      (1 - fall) * Math.max(0.3, e.value) * 0.85 +
      0.13 +
      Math.sin(fall * Math.PI) * (e.style === "tumble" ? 0.9 : 0.05);
    const yaw = (effectRandom(e.seed, 55) - 0.5) * 3.4;
    const localZ = localY * Math.sin(angle);
    out.x =
      p.offset[0] * Math.cos(yaw) +
      localZ * Math.sin(yaw) +
      Math.sin(e.direction) * fall * 0.7;
    out.y = Math.max(floor, centerY + localY * Math.cos(angle));
    out.z = localZ * Math.cos(yaw) - p.offset[0] * Math.sin(yaw) - fall * 0.4;
    out.rx = angle;
    out.ry = yaw;
    out.rz = Math.sin(p.spin[2]) * fall * 0.35;
    out.fade = fade;
    return out;
  }
  const spinTime = Math.min(t, landing + 0.3);
  out.x = p.offset[0] + p.velocity[0] * travel;
  out.y = Math.max(floor, floor + height);
  out.z = p.offset[2] + p.velocity[2] * travel;
  out.rx = p.spin[0] * spinTime;
  out.ry = p.spin[1] * spinTime;
  out.rz = p.spin[2] * spinTime;
  out.fade = fade;
  return out;
}
