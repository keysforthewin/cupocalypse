import type { Mode } from "./types";

export const FORMATION_TIP = 0.35;
export const FORMATION_BACK = FORMATION_TIP;
export const ROAD_EDGE = 5.05;
export const SOLDIER_RADIUS = 0.1;
const WALL_KNEE = 4.35;
const WALL_SOFTNESS = ROAD_EDGE - WALL_KNEE;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export function formationShape(army: number) {
  const growth = Math.sqrt(Math.max(0, army) / 100);
  return { halfWidth: 1.4 * growth, depth: 6 * Math.tanh((2.7 * growth) / 6) };
}
export function formationPositions(mode: Mode, x: number): number[] {
  return mode === "Mirror" ? [-2.45 + x * 0.5, 2.45 - x * 0.5] : [x];
}
/** Smooth confinement packs ranks against the curb instead of translating
 * them through it. The last 10cm still expose bodies to crushing damage. */
export function confineToRoad(x: number) {
  const excess = Math.max(0, Math.abs(x) - WALL_KNEE);
  return excess === 0
    ? x
    : Math.sign(x) *
        (WALL_KNEE + WALL_SOFTNESS * (1 - Math.exp(-excess / WALL_SOFTNESS)));
}
function unconfine(x: number) {
  if (Math.abs(x) >= ROAD_EDGE) return Math.sign(x) * Infinity;
  if (Math.abs(x) <= WALL_KNEE) return x;
  return (
    Math.sign(x) *
    (WALL_KNEE -
      WALL_SOFTNESS * Math.log(1 - (Math.abs(x) - WALL_KNEE) / WALL_SOFTNESS))
  );
}
export function roundedWidth(u: number) {
  return Math.sin((clamp01(u) * Math.PI) / 2) ** 0.8;
}
export function crowdEnvelope(army: number, mode: Mode, x: number, rearX = x) {
  const shape = formationShape(army);
  const tips = formationPositions(mode, x);
  const rears = formationPositions(mode, rearX * 0.98);
  const halfWidth = shape.halfWidth * (mode === "Mirror" ? 0.5 : 1);
  const pressure =
    rears.reduce(
      (sum, center) =>
        sum +
        Math.max(0, Math.abs(center) + halfWidth - WALL_KNEE) /
          Math.max(0.1, halfWidth * 2),
      0,
    ) / tips.length;
  // The rear stays fixed. New ranks and curb compression extend toward enemies.
  const compression = Math.min(4.8, shape.depth * pressure * 1.9);
  const push = shape.depth + compression;
  return {
    tips,
    rears,
    halfWidth,
    push,
    front: FORMATION_TIP - push,
    back: FORMATION_BACK,
    depth: push,
  };
}
function centerAt(tip: number, rear: number, u: number) {
  const blend = u * u * (3 - 2 * u);
  return tip + (rear - tip) * blend;
}
// Fixed cross sections integrate density before confinement. Inverting the
// same monotone wall transform preserves the extra density at a squashed flank.
const SLICES = 32;
const sections = Array.from({ length: SLICES }, (_, i) => {
  const u = (i + 0.5) / SLICES;
  return { u, width: roundedWidth(u) };
});
const mass = sections.reduce((n, s) => n + s.width, 0);
export function formationExposure(
  army: number,
  mode: Mode,
  tipX: number,
  left: number,
  right: number,
  front = -Infinity,
  back = Infinity,
  rearX = tipX,
) {
  if (army <= 0 || right <= left || back <= front) return 0;
  const envelope = crowdEnvelope(army, mode, tipX, rearX);
  if (back <= envelope.front || front >= envelope.back) return 0;
  const rawLeft = unconfine(left),
    rawRight = unconfine(right);
  const a = clamp01((front - envelope.front) / envelope.depth);
  const b = clamp01((back - envelope.front) / envelope.depth);
  let fraction = 0;
  for (let copy = 0; copy < envelope.tips.length; copy++) {
    for (let i = 0; i < SLICES; i++) {
      const section = sections[i];
      const overlap =
        Math.max(0, Math.min(b, (i + 1) / SLICES) - Math.max(a, i / SLICES)) *
        SLICES;
      if (!overlap) continue;
      const half = envelope.halfWidth * section.width;
      const center = centerAt(
        envelope.tips[copy],
        envelope.rears[copy],
        section.u,
      );
      const across =
        clamp01((rawRight - center + half) / (2 * half)) -
        clamp01((rawLeft - center + half) / (2 * half));
      fraction += across * section.width * overlap;
    }
  }
  const result = (army * fraction) / mass / envelope.tips.length;
  return Math.abs(result - army) < 1e-9
    ? army
    : Math.max(0, Math.min(army, result));
}
export function edgeExposure(army: number, mode: Mode, x: number, rearX = x) {
  return (
    army -
    formationExposure(
      army,
      mode,
      x,
      -ROAD_EDGE + SOLDIER_RADIUS,
      ROAD_EDGE - SOLDIER_RADIUS,
      -Infinity,
      Infinity,
      rearX,
    )
  );
}
export const ARMY_RENDER_BUDGET = 1600;
const layouts = new Map<number, { starts: number[]; columns: number[] }>();
function crowdLayout(count: number) {
  const known = layouts.get(count);
  if (known) return known;
  const rows = Math.ceil(Math.sqrt(count));
  const weights = Array.from({ length: rows }, (_, i) =>
    i === 0 ? 0 : roundedWidth(i / (rows - 1)),
  );
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (sum ? ((count - 1) * w) / sum : 0));
  const columns = exact.map(Math.floor);
  columns[0] = 1;
  let left = count - columns.reduce((a, b) => a + b, 0);
  const order = exact
    .map((n, i) => ({ i, f: n - Math.floor(n) }))
    .slice(1)
    .sort((a, b) => b.f - a.f);
  for (let i = 0; i < left; i++) columns[order[i % order.length].i]++;
  const starts: number[] = [];
  let start = 0;
  for (const n of columns) {
    starts.push(start);
    start += n;
  }
  if (layouts.size >= 32) layouts.delete(layouts.keys().next().value!);
  const layout = { starts, columns };
  layouts.set(count, layout);
  return layout;
}
/** Rounded shoulders and staggered ranks, with a flat rear. The tip leads a
 * trailing body, while confinement converts lateral overflow into dense ranks. */
export function soldierPosition(
  index: number,
  count: number,
  army: number,
  tipX = 0,
  rearX = tipX,
  mode: Mode = "Classic",
  copy = 0,
) {
  const { starts, columns } = crowdLayout(Math.max(1, count));
  let row = 0;
  while (row + 1 < starts.length && starts[row + 1] <= index) row++;
  const col = index - starts[row];
  const u = starts.length <= 1 ? 1 : row / (starts.length - 1);
  const e = crowdEnvelope(army, mode, tipX, rearX);
  const center = centerAt(e.tips[copy], e.rears[copy], u);
  const across = columns[row] <= 1 ? 0 : (col / (columns[row] - 1)) * 2 - 1;
  const half = e.halfWidth * roundedWidth(u) * 0.94;
  const jitter =
    row > 0 && row < starts.length - 1 ? Math.sin(index * 71.3) * 0.035 : 0;
  return {
    x: confineToRoad(center + across * half + jitter * (1 - Math.abs(across))),
    z: u === 1 ? e.back : e.front + e.depth * u + jitter * 0.55,
    row,
  };
}
