import * as T from "three";
import type { Enemy } from "../game/types";
import { activeMotion, motionReleaseTick } from "../game/attacks";

const sat = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const x = sat(v);
  return x * x * (3 - 2 * x);
};
const mix = T.MathUtils.lerp;
export type JointPose = Record<string, [number, number, number]>;
export interface CharacterPose {
  joints: JointPose;
  y: number;
  lean: number;
  turn: number;
  sac: number;
  mouth: number;
}
// Poses use radians in each joint's parent space, relative to the imported bind pose.
// Absolute simulation time makes pause, replay, LOD swaps and skipped render frames agree.
export function characterPose(e: Enemy, tick: number): CharacterPose {
  const t = tick / 60,
    seed = e.id * 2.399;
  const fast =
    e.kind === "Runner" ||
    (e.kind === "Charger" && e.action === "charge" && tick >= e.prepareUntil);
  const low = e.kind === "Crawler" || e.kind === "Broodmass";
  const pace = t * (fast ? 12 : low ? 5 : e.boss ? 2.8 : 4.2) + seed;
  const step = Math.sin(pace),
    opposite = Math.sin(pace + Math.PI);
  const gait = e.boss ? 0.12 : fast ? 0.65 : low ? 0.34 : 0.24;
  const p: CharacterPose = {
    joints: {},
    y: Math.abs(step) * (fast ? 0.055 : 0.014),
    lean: 0,
    turn: 0,
    sac: 1,
    mouth: 0.15,
  };
  const j = p.joints;
  j.pelvis = [0, step * 0.045, step * 0.035];
  j.spine = [fast ? 0.19 : low ? 0.02 : 0.06, -step * 0.06, opposite * 0.045];
  j.head = [
    -0.07 + Math.sin(t * 2.1 + seed) * 0.06,
    Math.sin(t * 1.3 + seed) * 0.14,
    Math.sin(t * 3 + seed) * 0.06,
  ];
  j.legL = [step * gait, 0, -0.03];
  j.legR = [opposite * gait, 0, 0.03];
  j.footL = [-Math.max(0, opposite) * gait * 0.9, 0, 0];
  j.footR = [-Math.max(0, step) * gait * 0.9, 0, 0];
  const wave = 0.5 + 0.5 * Math.sin(t * 1.7 + seed);
  for (const [side, sign, phase] of [
    ["L", -1, pace],
    ["R", 1, pace + Math.PI],
  ] as const) {
    const armed =
      e.kind === "Gunner" || e.kind === "Riot Guard" || e.kind === "Bulwark";
    j["arm" + side] = [
      armed
        ? -0.5
        : low
          ? Math.sin(phase) * 0.3
          : -0.6 - wave * 0.55 + Math.sin(phase) * 0.22,
      0,
      sign * (armed ? 0.08 : 0.15 + wave * 0.18),
    ];
    j["hand" + side] = [-0.15 - wave * 0.35, Math.sin(phase) * 0.1, 0];
  }
  if (e.kind === "Bloater" || e.kind === "Carrier") {
    j.spine[0] = -0.1 + Math.sin(t * 3 + seed) * 0.07;
    p.sac = 1 + Math.sin(t * 3 + seed) * 0.035;
  }
  for (let n = 0; n < 4; n++) {
    j["aux-head" + n] = [
      Math.sin(t * 2.7 + n) * 0.14,
      Math.sin(t * 1.9 + n * 2) * 0.21,
      Math.sin(t * 3 + n) * 0.1,
    ];
    j["sac" + n] = [Math.sin(t * 3 + n) * 0.08, 0, Math.sin(t * 2 + n) * 0.08];
  }
  // Independent howls ripple through a crowd instead of synchronized marching.
  const howlPhase = ((t + seed) % 7) / 7;
  const howl =
    smooth((howlPhase - 0.68) / 0.1) * (1 - smooth((howlPhase - 0.86) / 0.14));
  if (!e.boss && e.kind !== "Gunner" && e.kind !== "Crawler") {
    j.head[0] -= howl * 0.38;
    j.spine[0] -= howl * 0.12;
    j.armL[0] -= howl * 0.55;
    j.armR[0] -= howl * 0.45;
    p.mouth = howl;
  }
  const m = activeMotion(e, tick);
  if (m) {
    const prep = sat((tick - m.start) / Math.max(1, m.strike - m.start));
    const after = (tick - m.strike) / 60;
    const recover = 1 - smooth((after - 0.13) / 0.72);
    const wind = smooth(prep / 0.72);
    // Final 180ms is the fast attack; fist reaches its contact pose exactly on strike.
    const hit = smooth((tick - (m.strike - 11)) / 11);
    const strength = after < 0 ? smooth(prep / 0.18) : recover;
    const set = (name: string, x: number, y = 0, z = 0) => {
      const old = j[name] || [0, 0, 0];
      j[name] = [
        mix(old[0], x, strength),
        mix(old[1], y, strength),
        mix(old[2], z, strength),
      ];
    };
    if (m.kind === "slam") {
      // Plant, lift both fists, arch, then collapse through hips/shoulders into pavement.
      set("pelvis", mix(-0.14 * wind, 0.1, hit), 0, 0);
      set("spine", mix(-0.32 * wind, 1.1, hit));
      set("head", mix(-0.35 * wind, -0.45, hit));
      set("armL", mix(-2.7 * wind, -1.1, hit), -0.12, -0.24);
      set("armR", mix(-2.7 * wind, -1.1, hit), 0.12, 0.24);
      set("handL", mix(-0.65 * wind, -0.08, hit));
      set("handR", mix(-0.65 * wind, -0.08, hit));
      set("legL", 0.18 + hit * 0.87, 0, -0.13);
      set("legR", 0.18 + hit * 0.87, 0, 0.13);
      set("footL", -0.3 - hit * 2.6);
      set("footR", -0.3 - hit * 2.6);
      p.y = mix(0.04 * wind, -0.48, hit) * strength;
      p.lean = hit * 0.035 * strength;
    } else if (m.kind === "strike") {
      const side = m.variant % 2 ? "L" : "R",
        sign = side === "L" ? -1 : 1;
      const sweep = mix(-sign * 0.45 * wind, sign * 0.48, hit);
      set("spine", mix(-0.17 * wind, 0.58, hit), sweep, sign * hit * 0.12);
      set("head", -0.24, -sweep * 0.7);
      set(
        "arm" + side,
        mix(-2.5 * wind, -0.8, hit),
        -sign * hit * 0.48,
        sign * (0.25 + wind * 0.35),
      );
      set("hand" + side, mix(-1.1 * wind, -0.05, hit));
      set("arm" + (side === "L" ? "R" : "L"), -0.45, 0, -sign * 0.38);
      p.turn = (m.lane - 1) * -0.16 * strength;
      p.y = -0.16 * hit * strength;
      for (let n = 0; n < 4; n++)
        set(
          "aux-head" + n,
          -0.35 + hit * 0.55,
          sweep * (n % 2 ? -0.5 : 0.5),
          (n - 1.5) * 0.13,
        );
      p.mouth = strength;
    } else if (m.kind === "pool") {
      const release = motionReleaseTick(m);
      const spitHit = smooth((tick - (release - 11)) / 11);
      const sinceRelease = (tick - release) / 60;
      const recoil = sinceRelease >= 0 ? Math.exp(-sinceRelease * 9) : 0;
      set("spine", mix(-0.22 * wind, 0.6, spitHit) - recoil * 0.16);
      set("head", mix(-0.6 * wind, 0.24, spitHit));
      set("armL", -0.65 - wind * 0.4, -0.15, -0.36);
      set("armR", -0.65 - wind * 0.4, 0.15, 0.36);
      p.sac = 1 + (0.14 * wind - 0.24 * spitHit) * strength;
      p.y = -0.09 * spitHit * strength;
      p.mouth = wind * strength;
      p.turn = -(m.lane - 1) * 0.16 * strength;
    } else if (m.kind === "summon") {
      const convulse = Math.sin((tick - m.start) * 0.42) * wind * 0.05;
      set("spine", -0.2 * wind + hit * 0.48 + convulse);
      set("head", -0.48 * wind + hit * 0.45);
      set("armL", -0.25 - wind * 0.35, -0.2, -0.6 * wind);
      set("armR", -0.25 - wind * 0.35, 0.2, 0.6 * wind);
      p.sac = 1 + (0.25 * wind - 0.38 * hit + convulse) * strength;
      p.y = (-0.13 * wind + 0.12 * Math.sin(hit * Math.PI)) * strength;
      p.mouth = wind * strength;
    } else if (m.kind === "scream") {
      set("spine", -0.26 * wind, Math.sin(t * 20) * 0.025 * wind);
      set("head", -0.65 * wind, Math.sin(t * 27) * 0.07 * wind);
      set("armL", -1.75 * wind, -0.3, -0.65 * wind);
      set("armR", -1.75 * wind, 0.3, 0.65 * wind);
      set("handL", -0.65);
      set("handR", -0.65);
      p.mouth = wind * strength;
    } else if (m.kind === "burst") {
      const recoil = after >= 0 ? Math.exp(-after * 24) * 0.18 : 0;
      set("spine", 0.12 - recoil, (m.lane - 1) * -0.15);
      set("armL", -1.22 + recoil);
      set("armR", -1.3 + recoil);
      set("handL", -0.55);
      set("handR", -0.35);
      set("head", 0.12);
    } else if (m.kind === "charge") {
      set("spine", 0.45 * wind);
      set("head", -0.3 * wind);
      set("armL", -0.85, 0, -0.35);
      set("armR", -0.85, 0, 0.35);
      p.y = -0.13 * wind * strength;
    }
  }
  const phaseRoar = Math.sin(sat((tick - e.phaseTick) / 75) * Math.PI) * 0.3;
  j.head[0] -= phaseRoar;
  j.spine[0] -= phaseRoar * 0.3;
  p.mouth = Math.max(p.mouth, phaseRoar * 3);
  if (e.hit > tick) j.spine[0] -= (0.07 * (e.hit - tick)) / 4;
  return p;
}

export function createRig(model: T.Object3D) {
  const joints: {
    bone: T.Bone;
    rotation: T.Quaternion;
    position: T.Vector3;
    scale: T.Vector3;
  }[] = [];
  model.traverse((o) => {
    if (o instanceof T.Bone)
      joints.push({
        bone: o,
        rotation: o.quaternion.clone(),
        position: o.position.clone(),
        scale: o.scale.clone(),
      });
  });
  const q = new T.Quaternion(),
    angles = new T.Euler();
  return (pose: CharacterPose) => {
    for (const { bone, rotation, position, scale } of joints) {
      bone.position.copy(position);
      bone.scale.copy(scale);
      bone.quaternion.copy(rotation);
      const a = pose.joints[bone.name];
      if (a) {
        q.setFromEuler(angles.set(...a));
        bone.quaternion.premultiply(q);
      }
      if (bone.name.startsWith("sac")) bone.scale.multiplyScalar(pose.sac);
      if (bone.name === "head" || bone.name.startsWith("aux-head"))
        bone.scale.y *= 1 + pose.mouth * 0.1;
    }
  };
}
