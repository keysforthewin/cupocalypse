import * as T from "three";
import type { EnemyKind, BossKind } from "../game/types";
const box = new T.BoxGeometry(1, 1, 1),
  sphere = new T.SphereGeometry(1, 12, 8),
  cylinder = new T.CylinderGeometry(1, 1, 1, 10);
const mats = new Map<string, T.MeshStandardMaterial>();
export function material(color: string, metal = 0.1) {
  const key = color + metal;
  if (!mats.has(key))
    mats.set(
      key,
      new T.MeshStandardMaterial({ color, roughness: 0.83, metalness: metal }),
    );
  return mats.get(key)!;
}
export function part(
  parent: T.Object3D,
  shape: "box" | "sphere" | "cylinder",
  xyz: number[],
  size: number[],
  color: string,
  rotation?: number[],
) {
  const m = new T.Mesh(
    shape === "box" ? box : shape === "sphere" ? sphere : cylinder,
    material(color),
  );
  m.position.set(...(xyz as [number, number, number]));
  m.scale.set(...(size as [number, number, number]));
  if (rotation) m.rotation.set(...(rotation as [number, number, number]));
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function humanoid(kind: EnemyKind | BossKind | "Soldier") {
  const g = new T.Group(),
    skin = kind === "Soldier" ? "#b6a28b" : "#898e7f",
    cloth =
      kind === "Soldier"
        ? "#4d5c51"
        : kind === "Walker"
          ? "#605c50"
          : "#424e40";
  const muscle = "#61312f",
    dark = "#1e2827";
  const torso = new T.Group();
  torso.position.y = 1.12;
  g.add(torso);
  part(torso, "box", [0, 0, 0], [0.49, 0.6, 0.3], cloth);
  part(
    torso,
    "box",
    [0, 0.08, 0.19],
    [0.41, 0.36, 0.1],
    kind === "Soldier" ? "#263b37" : dark,
  );
  for (let i = 0; i < 3; i++)
    part(
      torso,
      "box",
      [(i - 1) * 0.13, -0.08, 0.25],
      [0.1, 0.14, 0.08],
      "#565b46",
    );
  part(torso, "sphere", [0, 0.53, 0], [0.2, 0.25, 0.2], skin);
  part(
    torso,
    "sphere",
    [0, 0.61, -0.01],
    [0.22, 0.17, 0.22],
    kind === "Walker" ? skin : dark,
  );
  part(torso, "box", [0, 0.54, 0.19], [0.26, 0.065, 0.04], "#171c1c");
  if (kind !== "Soldier") {
    part(torso, "sphere", [0.12, 0.38, 0.16], [0.08, 0.12, 0.08], muscle);
    for (let i = 0; i < 3; i++)
      part(
        torso,
        "box",
        [-0.18 + i * 0.15, 0.08, 0.26],
        [0.015, 0.32, 0.018],
        "#272c27",
        [0, 0, 0.2 + i * 0.18],
      );
  }
  const limbs: T.Group[] = [];
  for (const sign of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(sign * 0.34, 0.18, 0);
    torso.add(arm);
    part(arm, "cylinder", [0, -0.2, 0], [0.105, 0.43, 0.105], cloth);
    part(arm, "sphere", [0, -0.42, 0.08], [0.105, 0.12, 0.1], skin);
    limbs.push(arm);
    const leg = new T.Group();
    leg.position.set(sign * 0.15, 0.83, 0);
    g.add(leg);
    part(leg, "cylinder", [0, -0.25, 0], [0.12, 0.52, 0.12], cloth);
    part(leg, "box", [0, -0.65, 0.08], [0.23, 0.22, 0.36], dark);
    limbs.push(leg);
  }
  if (kind === "Soldier" || kind === "Gunner") {
    part(torso, "box", [0.22, -0.07, 0.5], [0.095, 0.14, 0.65], "#1c2223");
    part(
      torso,
      "cylinder",
      [0.22, -0.07, 0.94],
      [0.028, 0.3, 0.028],
      "#363d3c",
      [Math.PI / 2, 0, 0],
    );
    limbs[0].rotation.x = -0.8;
    limbs[2].rotation.x = -0.8;
  }
  const armor = new T.Group();
  torso.add(armor);
  if (kind === "Riot Guard" || kind === "Bulwark") {
    part(armor, "box", [-0.25, -0.03, 0.5], [0.7, 0.95, 0.14], "#343f3e");
    part(armor, "box", [-0.25, 0.24, 0.59], [0.47, 0.17, 0.025], "#748b89");
    part(armor, "box", [-0.25, -0.05, 0.585], [0.035, 0.7, 0.02], "#9c9b75");
    part(armor, "sphere", [0.36, 0.25, 0], [0.29, 0.29, 0.32], "#4b5450");
  }
  if (kind === "Charger" || kind === "Bulwark") {
    part(torso, "sphere", [0.5, 0.12, 0], [0.43, 0.47, 0.36], muscle);
    part(torso, "sphere", [0.62, -0.32, 0.12], [0.29, 0.4, 0.28], skin);
    for (let i = 0; i < 3; i++)
      part(
        torso,
        "cylinder",
        [0.35 + i * 0.15, 0.54, 0],
        [0.05, 0.4, 0.06],
        "#b6b29b",
        [0, 0, -0.4],
      );
  }
  if (kind === "Bloater" || kind === "Carrier" || kind === "Broodmass") {
    part(
      torso,
      "sphere",
      [0, -0.03, -0.2],
      [0.57, 0.66, 0.55],
      kind === "Bloater" ? skin : muscle,
    );
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      part(
        torso,
        "sphere",
        [Math.sin(a) * 0.42, Math.cos(a) * 0.45, -0.52],
        [0.18, 0.22, 0.2],
        i % 2 ? muscle : "#8b7662",
      );
    }
  }
  if (kind === "Spitter") {
    torso.rotation.x = 0.28;
    part(torso, "sphere", [0, 0.3, 0.18], [0.28, 0.33, 0.24], "#817357");
  }
  if (kind === "Screamer") {
    g.scale.set(0.8, 1.5, 0.8);
    part(torso, "sphere", [0, 0.42, 0.21], [0.1, 0.18, 0.08], "#201916");
    for (let i = 0; i < 5; i++)
      part(
        torso,
        "box",
        [0, 0.15 - i * 0.09, 0.22],
        [0.36, 0.026, 0.05],
        "#b2b09a",
      );
  }
  if (kind === "Runner") torso.rotation.x = 0.3;
  if (kind === "Crawler") {
    torso.rotation.x = 1.05;
    g.scale.set(1, 0.45, 1.4);
    limbs[0].scale.set(1.7, 1.5, 1.7);
    limbs[2].scale.set(1.7, 1.5, 1.7);
  }
  if (kind === "Bulwark") g.scale.setScalar(2.5);
  if (kind === "Broodmass") {
    g.scale.set(3, 1.2, 2.3);
    for (let i = 0; i < 4; i++) {
      part(
        torso,
        "sphere",
        [(i - 1.5) * 0.35, 0.4, 0.15],
        [0.19, 0.23, 0.2],
        skin,
      );
      part(
        torso,
        "cylinder",
        [(i - 1.5) * 0.5, -0.35, 0.35],
        [0.1, 0.7, 0.1],
        skin,
        [0.8, 0, (i - 1.5) * 0.6],
      );
    }
  }
  if (kind === "Congregation") {
    g.scale.set(2.4, 3.4, 1.9);
    for (let i = 0; i < 5; i++) {
      part(
        torso,
        "sphere",
        [(i - 2) * 0.23, 0.5 + Math.sin(i) * 0.2, 0],
        [0.19, 0.23, 0.2],
        skin,
      );
      part(
        torso,
        "cylinder",
        [(i - 2) * 0.3, -0.05, 0.2],
        [0.085, 0.75, 0.085],
        i % 2 ? skin : muscle,
        [0, 0, (i - 2) * 0.45],
      );
    }
    for (let i = 0; i < 6; i++)
      part(
        torso,
        "box",
        [0, 0.15 - i * 0.09, 0.3],
        [0.48, 0.03, 0.05],
        "#a7a68f",
      );
  }
  g.userData = { limbs, torso, armor, baseScale: g.scale.clone() };
  return g;
}
export function vehicle() {
  const g = new T.Group();
  part(g, "box", [0, 0.85, 0], [2.4, 0.65, 4.6], "#3d4941");
  part(g, "box", [0, 1.5, 0.8], [2.2, 0.9, 1.8], "#465348");
  part(g, "box", [0, 1.6, 1.72], [1.8, 0.48, 0.04], "#172627");
  part(g, "box", [0, 1.15, 2], [2, 0.3, 0.9], "#3b483f");
  part(g, "box", [0, 1.2, -1.35], [2.25, 1.1, 2], "#555c4b");
  for (const x of [-1.18, 1.18])
    for (const z of [-1.4, 1.4])
      part(g, "cylinder", [x, 0.48, z], [0.5, 0.22, 0.5], "#171e1e", [
        0,
        0,
        Math.PI / 2,
      ]);
  for (const x of [-0.8, 0.8])
    part(g, "box", [x, 1, 2.48], [0.32, 0.15, 0.03], "#beb08b");
  return g;
}
