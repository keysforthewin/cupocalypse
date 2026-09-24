import type { Mode } from "./types";
export const GATE_CENTER = 3;
export const GATE_WIDTH = 2.5;
export const GATE_PASS_TICKS = 42;
/** A formation's center selects one lane; the open middle grants no gate. */
export function selectedGate(x: number): "a" | "b" | undefined {
  if (Math.abs(x + GATE_CENTER) <= GATE_WIDTH / 2) return "a";
  if (Math.abs(x - GATE_CENTER) <= GATE_WIDTH / 2) return "b";
}
export function bulletGate(x: number, mode: Mode) {
  return selectedGate(mode === "Mirror" ? 2 * (2.45 - Math.abs(x)) : x);
}
