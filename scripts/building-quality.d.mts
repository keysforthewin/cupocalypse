export const catalog: {
  assets: string[];
  procedural: string[];
  variants: number[];
  seeds: string[];
  qualities: string[];
  weights: Record<string, number>;
  threshold: number;
  categoryFloor: number;
};
export const buildingIds: string[];
export function hashFile(file: string): string;
export function buildingHash(): string;
export { auditGeometry, planeDeviation } from "./building-geometry.mjs";
export function evaluateBuildings(
  report: Record<string, unknown>,
  assessment: Record<string, unknown>,
  options?: {
    currentHash?: string;
    exists?: (file: string) => boolean;
    ids?: string[];
    seeds?: string[];
    qualities?: string[];
  },
): {
  accepted: boolean;
  scores: Record<string, number | null>;
  failures: string[];
  sourceHash: string;
};
