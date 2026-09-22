export const ROAD_CHUNK_LENGTH = 20;
export const ROAD_CHUNK_COUNT = 15;
export const ROAD_NEAR_RECYCLE = 70;
export const ROAD_FAR_RECYCLE =
  ROAD_NEAR_RECYCLE - ROAD_CHUNK_COUNT * ROAD_CHUNK_LENGTH;
export const CITY_MAX_HEIGHT = 44;
export const FOG_FAR = 125;
// Sun rays move toward +x/+z. Keep the farthest caster's ground projection
// beyond the fog, and retain chunks behind the camera until all shadows exit.
export const SUN_OFFSET = [-60, 96, -84] as const;
export const SUN_TARGET = [0, 0, -65] as const;
export const SHADOW_BOUNDS = {
  left: -145,
  right: 145,
  top: 135,
  bottom: -135,
  near: 1,
  far: 380,
};
export function roadChunkZ(index: number, displacement: number) {
  const span = ROAD_CHUNK_LENGTH * ROAD_CHUNK_COUNT;
  return (
    ((((ROAD_NEAR_RECYCLE - index * ROAD_CHUNK_LENGTH + displacement) % span) +
      span) %
      span) +
    ROAD_FAR_RECYCLE
  );
}
