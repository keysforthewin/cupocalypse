import { formationExposure, edgeExposure } from "./formation";
import {
  Simulation,
  gateResult,
  LANES,
  clamp,
  formationPositions,
} from "./simulation";
import type { Enemy } from "./types";
export function bot(sim: Simulation) {
  let target = sim.x;
  const warning = sim.hazards.find(
    (h) => h.warnAt <= sim.tick && h.endAt >= sim.tick,
  );
  if (warning) {
    const candidates = sim.mode === "Mirror" ? [-3.8, 0, 3.8] : LANES;
    const risk = (x: number) =>
      warning.lanes.reduce(
        (n, lane) =>
          n +
          formationExposure(
            sim.army,
            sim.mode,
            x,
            LANES[lane] - 1.5,
            LANES[lane] + 1.5,
          ),
        0,
      ) +
      edgeExposure(sim.army, sim.mode, x) * 0.4;
    // Oversized armies may have no lossless lane. Preserve the most soldiers.
    return candidates.reduce((a, b) =>
      risk(a) < risk(b) ||
      (risk(a) === risk(b) && Math.abs(a - sim.x) < Math.abs(b - sim.x))
        ? a
        : b,
    );
  }
  const gate = sim.gates.find((g) => !g.passed);
  let enemy: Enemy | undefined;
  for (const candidate of sim.enemies)
    if (!candidate.dead && (!enemy || candidate.z < enemy.z)) enemy = candidate;
  if (enemy && (!gate || enemy.z < gate.z)) {
    if (enemy.z < 10 + sim.crowd.push && enemy.hp > sim.army * 0.3) {
      const candidates = sim.mode === "Mirror" ? [-3.8, 0, 3.8] : LANES;
      const risk = (x: number) => {
        const rear = sim.crowdX + (x - sim.crowdX) * (1 - Math.exp(-0.8 * 4));
        return (
          sim.enemies.reduce(
            (sum, threat) =>
              sum +
              (threat.z < 12 + sim.crowd.push
                ? formationExposure(
                    sim.army,
                    sim.mode,
                    x,
                    threat.x - 0.8,
                    threat.x + 0.8,
                    -Infinity,
                    Infinity,
                    rear,
                  ) *
                  (1 - threat.z / 30)
                : 0),
            0,
          ) +
          edgeExposure(sim.army, sim.mode, x, rear) * 0.3
        );
      };
      return candidates.reduce((a, b) =>
        risk(a) < risk(b) ||
        (risk(a) === risk(b) && Math.abs(a - sim.x) < Math.abs(b - sim.x))
          ? a
          : b,
      );
    }
    target = sim.mode === "Mirror" ? 2 * (2.45 - Math.abs(enemy.x)) : enemy.x;
  } else if (gate) {
    if (!gate.revealed) target = -2.4;
    else {
      const left =
          gateResult(sim.army, gate.left, gate.a, sim.mode) -
          (gate.wall === 0 ? 18 * sim.difficulty : 0),
        right =
          gateResult(sim.army, gate.right, gate.b, sim.mode) -
          (gate.wall === 1 ? 18 * sim.difficulty : 0);
      target = left >= right ? -2.4 : 2.4;
    }
  } else if (sim.drops.length)
    target =
      sim.mode === "Mirror"
        ? 2 * (2.45 - Math.abs(sim.drops[0].x))
        : sim.drops[0].x;
  return clamp(target, -3.8, 3.8);
}
