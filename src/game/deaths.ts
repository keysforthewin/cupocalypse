import type { Enemy, Effect, DeathStyle } from "./types";

// Stateless cosmetic randomness must never consume encounter / replay RNG.
export function effectRandom(seed: number, index = 0) {
  let n = Math.imul((seed ^ Math.imul(index + 1, 374761393)) >>> 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function deathStyle(
  e: Enemy,
  seed: number,
  explosive = false,
): DeathStyle {
  if (e.kind === "Bloater" || e.kind === "Broodmass") return "rupture";
  if (e.kind === "Spitter") return "acid";
  if (e.maxArmor > 0 && effectRandom(seed, 9) < 0.7) return "armor";
  if (explosive) return "shred";
  return (["collapse", "tumble", "shred"] as const)[
    Math.floor(effectRandom(seed, 7) * 3)
  ];
}
export const DEATH_STYLES: DeathStyle[] = [
  "collapse",
  "tumble",
  "shred",
  "rupture",
  "acid",
  "armor",
];
export function deathTint(e: Effect) {
  return e.style === "acid"
    ? "#869942"
    : e.style === "rupture"
      ? "#773524"
      : e.style === "soldier"
        ? "#68735e"
        : "#7d2622";
}
