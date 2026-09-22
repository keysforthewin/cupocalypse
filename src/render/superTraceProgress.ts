/** Normalized endpoints of a short projectile streak; expired streaks collapse
 * at the target instead of extrapolating backwards across the battlefield. */
export function superTraceProgress(age: number): [number, number] {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return [clamp(age * 12 - 0.18), clamp(age * 12 + 0.3)];
}
