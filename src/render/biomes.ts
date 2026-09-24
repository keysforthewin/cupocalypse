import { RNG } from "../game/rng";
export const BIOME_IDS = [
  "city",
  "suburb",
  "country",
  "forest",
  "ash",
] as const;
export type BiomeId = (typeof BIOME_IDS)[number];
export const BIOME_PERIOD = 60;
export const BIOME_BLEND_SECONDS = 20;
export const WORLD_SPEED = 8;
export const TRANSITION_LENGTH = 40;
export const BIOMES = {
  city: {
    name: "Iron District",
    ground: "#565e55",
    sky: "#83979b",
    fog: "#83979b",
    sun: "#ffe1b8",
    ambient: "#c8dce5",
    intensity: 2.5,
    plants: "#3d5743",
  },
  suburb: {
    name: "Haven Estates",
    ground: "#697851",
    sky: "#a4bec9",
    fog: "#a4bec9",
    sun: "#ffe0ac",
    ambient: "#d4e3e8",
    intensity: 2.8,
    plants: "#607948",
  },
  country: {
    name: "Golden Hinterlands",
    ground: "#94815a",
    sky: "#c0c7b5",
    fog: "#c0c7b5",
    sun: "#ffcf86",
    ambient: "#dce2d5",
    intensity: 3.0,
    plants: "#a99851",
  },
  forest: {
    name: "Blackpine Wilds",
    ground: "#455246",
    sky: "#7f9b9c",
    fog: "#7f9b9c",
    sun: "#e6e8cf",
    ambient: "#b5d3d2",
    intensity: 2.0,
    plants: "#365749",
  },
  ash: {
    name: "Ashfall Expanse",
    ground: "#363b38",
    sky: "#9a8c7b",
    fog: "#9a8c7b",
    sun: "#ffc38a",
    ambient: "#c5bdb0",
    intensity: 2.0,
    plants: "#3f3931",
  },
} satisfies Record<
  BiomeId,
  {
    name: string;
    ground: string;
    sky: string;
    fog: string;
    sun: string;
    ambient: string;
    intensity: number;
    plants: string;
  }
>;
export interface BiomeSample {
  from: BiomeId;
  to: BiomeId;
  blend: number;
}
export interface BiomeReview {
  biome?: BiomeId;
  from?: BiomeId;
  to?: BiomeId;
  progress?: number;
  seed?: string;
}
export interface BiomeAsset {
  id: string;
  url: string;
  lowUrl: string;
  width: number;
  depth: number;
  height: number;
  hash: string;
  lowHash: string;
  source: string;
}
export const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
// Independent bag seeds permit random access without caching an unbounded route.
export function biomeBag(seed: string, bag: number): BiomeId[] {
  const rng = new RNG(`${seed}:biome-bag:${bag}`);
  const ids: BiomeId[] = [...BIOME_IDS];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  // Each bag's final item is fixed independently; repair only its first two items.
  // This avoids recursive lookbacks on arbitrarily long runs.
  if (bag > 0) {
    const previous = new RNG(`${seed}:biome-bag:${bag - 1}`);
    const prior: BiomeId[] = [...BIOME_IDS];
    for (let i = 4; i > 0; i--) {
      const j = previous.int(i + 1);
      [prior[i], prior[j]] = [prior[j], prior[i]];
    }
    if (ids[0] === prior[4]) [ids[0], ids[1]] = [ids[1], ids[0]];
  }
  return ids;
}
export function biomeAtVisit(seed: string, visit: number): BiomeId {
  const n = Math.max(0, Math.floor(visit));
  return biomeBag(seed, Math.floor(n / 5))[n % 5];
}
export function atmosphereAt(seed: string, seconds: number): BiomeSample {
  const visit = Math.max(0, Math.floor(seconds / BIOME_PERIOD));
  if (!visit) {
    const first = biomeAtVisit(seed, 0);
    return { from: first, to: first, blend: 0 };
  }
  return {
    from: biomeAtVisit(seed, visit - 1),
    to: biomeAtVisit(seed, visit),
    blend: smooth((seconds - visit * BIOME_PERIOD) / BIOME_BLEND_SECONDS),
  };
}
export function routeBiome(seed: string, route: number): BiomeSample {
  const visit = Math.max(
    0,
    Math.floor((route - 120) / (BIOME_PERIOD * WORLD_SPEED)),
  );
  if (!visit) {
    const first = biomeAtVisit(seed, 0);
    return { from: first, to: first, blend: 0 };
  }
  const start = visit * BIOME_PERIOD * WORLD_SPEED + 120;
  return {
    from: biomeAtVisit(seed, visit - 1),
    to: biomeAtVisit(seed, visit),
    blend: smooth((route - start) / TRANSITION_LENGTH),
  };
}
export function sampleBiome(
  seed: string,
  route: number,
  review?: BiomeReview,
): BiomeSample {
  if (review?.biome) return { from: review.biome, to: review.biome, blend: 0 };
  if (review?.from && review.to)
    return {
      from: review.from,
      to: review.to,
      blend: smooth((route - 600) / TRANSITION_LENGTH),
    };
  return routeBiome(seed, route);
}
