import { formationExposure, edgeExposure, crowdEnvelope } from "./formation";
import {
  Simulation,
  LANES,
  MOVE_SPEED,
  formationPositions,
} from "./simulation";
// Lossless reachability on a 0.1m spatial grid and 0.1s time grid.
// Large pyramids can deliberately have no lossless route; width is authoritative.
export function reachableRoute(
  sim: Simulation,
  seconds = 6,
  includeContacts = true,
): boolean {
  const width = 77,
    step = 6,
    slices = Math.ceil(seconds * 10);
  let reachable = new Uint8Array(width);
  reachable[Math.round((sim.x + 3.8) * 10)] = 1;
  for (let slice = 1; slice <= slices; slice++) {
    const future = sim.tick + slice * 6,
      time = slice / 10,
      next = new Uint8Array(width);
    for (let i = 0; i < width; i++) {
      const x = i / 10 - 3.8;
      let blocked = edgeExposure(sim.army, sim.mode, x) > 0.01;
      for (const h of sim.hazards) {
        if (future < h.strikeAt || future > h.endAt) continue;
        if (
          h.lanes.some(
            (l) =>
              formationExposure(
                sim.army,
                sim.mode,
                x,
                LANES[l] - 1.5,
                LANES[l] + 1.5,
              ) > 0.5,
          )
        ) {
          blocked = true;
          break;
        }
      }
      if (!blocked && includeContacts)
        for (const e of sim.enemies) {
          if (e.boss) continue;
          const z =
            e.z - time * (8 + (sim.mode === "Fortress" ? 0 : e.speed * 1.45));
          if (
            z <= 0.6 + crowdEnvelope(sim.army, sim.mode, x).push &&
            formationExposure(
              sim.army,
              sim.mode,
              x,
              e.x - 0.65,
              e.x + 0.65,
              -z - 0.7,
              -z + 1.1,
            ) > 0.5
          ) {
            blocked = true;
            break;
          }
        }
      if (!blocked)
        for (const g of sim.gates) {
          if (g.wall < 0) continue;
          const depth = -g.z + time * 8;
          const centers = formationPositions(sim.mode, g.wall === 0 ? -3 : 3);
          const half = sim.mode === "Mirror" ? 0.625 : 1.25;
          if (
            centers.some(
              (center) =>
                formationExposure(
                  sim.army,
                  sim.mode,
                  x,
                  center - half,
                  center + half,
                  depth - 0.45,
                  depth + 0.45,
                ) > 0.5,
            )
          ) {
            blocked = true;
            break;
          }
        }
      if (blocked) continue;
      for (
        let j = Math.max(0, i - step);
        j <= Math.min(width - 1, i + step);
        j++
      )
        if (reachable[j]) {
          next[i] = 1;
          break;
        }
    }
    if (!next.some(Boolean)) return false;
    reachable = next;
  }
  return true;
}
export const WARNING_MINIMUM_SECONDS = (2 * 3.8) / MOVE_SPEED + 0.2;
