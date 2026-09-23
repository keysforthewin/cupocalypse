import type { Enemy, Hazard } from "./types";

export type MotionKind = Hazard["kind"] | "summon" | "scream";
export interface AttackMotion {
  kind: MotionKind;
  start: number;
  strike: number;
  end: number;
  lane: number;
  variant: number;
  clip?: string;
  release?: number;
}
// Keep completed motions for recovery after the damage hazard has expired.
export function commitMotion(enemy: Enemy, hazard: Hazard) {
  const motion: AttackMotion = {
    kind: hazard.kind,
    start: hazard.warnAt,
    strike: hazard.strikeAt,
    end: hazard.endAt,
    lane: hazard.lanes[0],
    variant: enemy.motions.length,
  };
  enemy.motions.push(motion);
  enemy.prepareUntil = Math.max(enemy.prepareUntil, hazard.strikeAt);
  return motion;
}
export function activeMotion(enemy: Enemy, tick: number) {
  const released = [...enemy.motions]
    .reverse()
    .find((m) => tick >= m.strike && tick <= m.strike + 54);
  if (released && tick - released.strike < 12) return released;
  return (
    enemy.motions.find((m) => tick >= m.start && tick < m.strike) ?? released
  );
}

export function motionReleaseTick(motion: AttackMotion) {
  if (motion.release !== undefined) return motion.release;
  return motion.kind === "pool" ? motion.strike - 27 : motion.strike;
}
