import type { SuperId } from "./superWeapons";
import type { Gun, ProjectileKind } from "./projectiles";
import type { AttackMotion } from "./attacks";
export const MODES = [
  "Classic",
  "Reverse",
  "Swarm",
  "Fortress",
  "Mirror",
  "Sudden Death",
] as const;
export type Mode = (typeof MODES)[number];
export const ENEMIES = [
  "Walker",
  "Runner",
  "Crawler",
  "Riot Guard",
  "Charger",
  "Spitter",
  "Bloater",
  "Screamer",
  "Carrier",
  "Gunner",
] as const;
export type EnemyKind = (typeof ENEMIES)[number];
export const BOSSES = [
  "Bulwark",
  "Broodmass",
  "Congregation",
  "Grave Marshal",
  "Widow of the Salvo",
  "Ossuary Engine",
  "Seraph of the Wound",
  "The Last Witness",
] as const;
export type BossKind = (typeof BOSSES)[number];
export type Upgrade = [number, number, number];
export const UPGRADE_PERCENT = [40, 24, 16] as const;
export const BOOSTS = [
  "damage",
  "rate",
  "spread",
  "hero",
  "warhead",
  "feed",
  "titan",
  "phase",
  "fork",
  "ember",
  "deadeye",
  "breach",
  "blast",
  "echo",
] as const;
export type Boost = (typeof BOOSTS)[number];
export type Pickup = Boost | Gun | "shield" | "recruit";
export type Op = "+" | "−" | "×" | "÷";
export interface Gate {
  id: number;
  z: number;
  left: Op;
  right: Op;
  a: number;
  b: number;
  hitsA: number;
  hitsB: number;
  revealed: boolean;
  wall: number;
  passed: boolean;
  passage?: { tick: number; side: "a" | "b"; delta: number };
}
export interface Enemy {
  id: number;
  kind: EnemyKind | BossKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  speed: number;
  cooldown: number;
  buffUntil: number;
  phase: number;
  boss: boolean;
  age: number;
  hit: number;
  dead: boolean;
  attacks: number;
  prepareUntil: number;
  actionLane: number;
  action: string;
  slowUntil?: number;
  staggerUntil?: number;
  slowFactor?: number;
  burns?: {
    until: number;
    perTick: number;
    superSource?: number;
    superOnly?: boolean;
  }[];
  motions: AttackMotion[];
  phaseTick: number;
  phaseUntil?: number;
  deathTick?: number;
}
export interface ShotPayload {
  superSource?: number;
  superOnly?: boolean;
  pierce: number;
  chain: number;
  chainDamage: number;
  burn: number;
  breach: number;
  unarmored: number;
  radius: number;
  splash: number;
  size: number;
  echoCount: number;
  echoDamage: number;
}
export interface Bullet {
  payload?: ShotPayload;
  hitIds?: number[];
  hitGateIds?: number[];
  returning?: boolean;
  fragment?: boolean;
  ricochets?: number;
  vz?: number;
  kind: ProjectileKind;
  serial: number;
  age: number;
  previousX: number;
  y: number;
  vx: number;
  phase: number;
  seed: number;
  target: number;
  aimX: number;
  trail: [number, number, number][];
  active: boolean;
  x: number;
  z: number;
  damage: number;
  previous: number;
  gatePower: number;
  coreColor: string;
  haloColor: string;
  width: number;
  length: number;
}
export interface Hazard {
  id: number;
  lanes: number[];
  warnAt: number;
  strikeAt: number;
  endAt: number;
  damage: number;
  kind: "charge" | "pool" | "burst" | "slam" | "strike";
  source: number;
  hit: boolean;
  attack?: string;
  releaseAt?: number;
  origin?: [number, number, number];
  trajectory?: "arc" | "spear" | "beam" | "split" | "wave";
}
export interface Drop {
  id: number;
  x: number;
  z: number;
  kind: Pickup;
}
export type DeathStyle =
  "collapse" | "tumble" | "shred" | "rupture" | "acid" | "armor" | "soldier";
export interface Effect {
  active: boolean;
  x: number;
  z: number;
  age: number;
  life: number;
  seed: number;
  style: DeathStyle;
  direction: number;
  energy: number;
  kind: "blood" | "armor" | "blast" | "reward" | "corpse";
  value: number;
}
export interface Input {
  superCycle?: -1 | 0 | 1;
  superPressed?: boolean;
  x: number;
  aim?: number;
}
export interface Replay {
  superLoadout: SuperId[];
  superLoadoutChanges?: { tick: number; loadout: SuperId[] }[];
  superInputs: number[];
  version: string;
  seed: string;
  mode: Mode;
  upgrades: Upgrade;
  debug: boolean;
  inputs: number[];
  aims?: number[];
}
