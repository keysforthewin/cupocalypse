import type { Simulation } from "../game/simulation";
const states = new WeakMap<
  Simulation,
  { x: number; crowdX: number; distance: number; alpha: number }
>();
export function beforeTick(sim: Simulation) {
  states.set(sim, {
    x: sim.x,
    crowdX: sim.crowdX,
    distance: sim.distance,
    alpha: 1,
  });
}
export function setFrameAlpha(sim: Simulation, alpha: number) {
  const state = states.get(sim);
  if (state) state.alpha = alpha;
}
export function presentedX(sim: Simulation) {
  const s = states.get(sim);
  return s ? s.x + (sim.x - s.x) * s.alpha : sim.x;
}
export function presentedDistance(sim: Simulation) {
  const s = states.get(sim);
  return s ? s.distance + (sim.distance - s.distance) * s.alpha : sim.distance;
}

export function presentedCrowdX(sim: Simulation) {
  const s = states.get(sim);
  return s ? s.crowdX + (sim.crowdX - s.crowdX) * s.alpha : sim.crowdX;
}
