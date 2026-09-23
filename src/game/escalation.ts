import { ARSENAL, GUNS, type Gun } from "./projectiles";
import { weaponStats } from "./weapons";
import type { Boost } from "./types";

const OPENING_DISTANCE = 60;
/** Keep the tutorial opening, then make each campaign sector demand more power. */
export function strengthDistance(distance: number) {
  return distance <= OPENING_DISTANCE
    ? distance
    : OPENING_DISTANCE + (distance - OPENING_DISTANCE) * 1.25;
}

/** Missed telegraphs become much more costly by the second boss. */
export function attackScale(distance: number) {
  return 1 + Math.min(2, Math.max(0, distance - OPENING_DISTANCE) / 120);
}

/** New enemies respond to earned firepower; existing enemies retain their HP.
 * The opening remains gentle, and every upgrade keeps its full weapon benefit. */
export function encounterScale(
  distance: number,
  army: number,
  boosts: Partial<Record<Boost, number>>,
  guns?: Record<Gun, number>,
  relieved = false,
) {
  const weapon = weaponStats(boosts);
  // A wide volley cannot focus every pellet on one target, so count its
  // contribution to lane coverage separately from single-projectile damage.
  const firepower =
    weapon.damage * weapon.rate * (1 + (weapon.offsets.length - 1) * 0.3) +
    (guns
      ? GUNS.reduce(
          (sum, k) =>
            sum +
            (guns[k] > 0
              ? (ARSENAL[k].damage / ARSENAL[k].interval / 7) *
                (1 + 0.22 * Math.sqrt(guns[k] - 1))
              : 0),
          0,
        ) *
        weapon.damage *
        Math.sqrt(weapon.rate)
      : 0);
  const opening = Math.max(0, Math.min(1, (distance - 60) / 210));
  const durability = opening;
  const strength = Math.max(0, firepower - 1) * (relieved ? 0.5 : 1);
  const crowd = Math.max(0, Math.log2(Math.max(1, army / 100)));
  const pressure = opening * (Math.log2(1 + strength) + crowd * 0.22);
  return {
    firepower,
    pressure,
    health: 1 + durability * (Math.pow(strength, 0.85) * 0.65 + crowd * 0.12),
    armor: 1 + durability * Math.pow(strength, 0.7) * 0.5,
    extraEnemies: Math.min(10, Math.floor(pressure * 1.8)),
    speed: 1 + Math.min(0.65, pressure * 0.08),
    spacing: Math.max(4.6, 11 - Math.min(3.5, distance / 70) - pressure * 0.55),
    multiplierChance: distance < 100 ? 0 : distance < 250 ? 0.025 : 0.06,
  };
}
