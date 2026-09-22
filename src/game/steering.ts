import { clamp, DT, MOVE_SPEED, ROAD_LIMIT } from "./simulation";
/** Continuous held-key steering; reaches full speed in 0.1s, brakes in 0.08s. */
export function steer(target: number, velocity: number, direction: number) {
  const desired = direction * MOVE_SPEED;
  const acceleration = direction ? 60 : 75;
  velocity += clamp(desired - velocity, -acceleration * DT, acceleration * DT);
  target = clamp(target + velocity * DT, -ROAD_LIMIT, ROAD_LIMIT);
  if (
    (target === ROAD_LIMIT && velocity > 0) ||
    (target === -ROAD_LIMIT && velocity < 0)
  )
    velocity = 0;
  return { target, velocity };
}
