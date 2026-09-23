import type { BufferGeometry } from "three";
export function planeDeviation(points: number[][]): number;
export function auditGeometry(
  geometry: BufferGeometry,
  options?: { uvUp?: boolean; requireUV?: boolean },
): Record<string, number>;
