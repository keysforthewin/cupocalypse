import {
  SUPERS,
  isSuperId,
  sanitizeLoadout,
  type SuperId,
} from "./superWeapons";
import { MODES, type Mode, type Upgrade, type Replay } from "./types";
import type { Simulation } from "./simulation";
import { playerName } from "./leaderboard";
export interface Profile {
  playerName: string;
  pinnedSeed: string | null;
  ownedSuperWeapons: SuperId[];
  superLoadout: SuperId[];
  helpVisible: boolean;
  currency: number;
  upgrades: Upgrade;
  records: Record<string, number>;
  muted: boolean;
  quality: "high" | "performance";
  runs: number;
  lastReplay?: Replay;
}
export const fresh = (): Profile => ({
  playerName: "",
  pinnedSeed: null,
  ownedSuperWeapons: [],
  superLoadout: [],
  helpVisible: true,
  currency: 0,
  upgrades: [0, 0, 0],
  records: {},
  muted: false,
  quality: "high",
  runs: 0,
});
export const PRICES = [300, 900, 2500, 6000, 10000];
// Keep the original storage key so the title change preserves existing profiles.
export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem("gate-runner-profile") || "null");
    if (!p || !Array.isArray(p.upgrades) || p.upgrades.length !== 3)
      return fresh();
    const owned = Array.isArray(p.ownedSuperWeapons)
      ? [...new Set<SuperId>(p.ownedSuperWeapons.filter(isSuperId))]
      : [];
    return {
      ...fresh(),
      playerName: playerName(p.playerName),
      pinnedSeed:
        typeof p.pinnedSeed === "string"
          ? p.pinnedSeed.trim().slice(0, 40) || null
          : null,
      ownedSuperWeapons: owned,
      superLoadout: sanitizeLoadout(p.superLoadout, owned),
      helpVisible: p.helpVisible !== false,
      currency: Number.isFinite(p.currency)
        ? Math.max(0, Math.floor(p.currency))
        : 0,
      upgrades: p.upgrades.map((n: unknown) =>
        typeof n === "number" ? Math.max(0, Math.min(5, Math.floor(n))) : 0,
      ) as Upgrade,
      records: Object.fromEntries(
        MODES.map((m) => [
          m,
          Number.isFinite(p.records?.[m]) ? Math.max(0, p.records[m]) : 0,
        ]),
      ),
      muted: p.muted === true,
      quality: p.quality === "performance" ? "performance" : "high",
      runs: Number.isFinite(p.runs) ? p.runs : 0,
      lastReplay: p.lastReplay,
    };
  } catch {
    return fresh();
  }
}
export function saveProfile(p: Profile) {
  try {
    localStorage.setItem("gate-runner-profile", JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
export function earnings(sim: Simulation) {
  // Each boss kill pays 100 credits times that boss's level (1 for the first).
  const bossCredits = 50 * sim.bossKills * (sim.bossKills + 1);
  return sim.debug ? 0 : Math.floor(sim.distance / 4) + bossCredits;
}
export function settle(p: Profile, sim: Simulation): Profile {
  if (sim.debug) return p;
  return {
    ...p,
    currency: p.currency + earnings(sim),
    records: {
      ...p.records,
      [sim.mode]: Math.max(p.records[sim.mode] || 0, Math.floor(sim.distance)),
    },
    runs: p.runs + 1,
    lastReplay: sim.replay(),
  };
}
export function purchase(p: Profile, index: number): Profile {
  if (index < 0 || index > 2) return p;
  const level = p.upgrades[index];
  if (level >= 5 || p.currency < PRICES[level]) return p;
  const upgrades = [...p.upgrades] as Upgrade;
  upgrades[index]++;
  return { ...p, currency: p.currency - PRICES[level], upgrades };
}
export const modeDescriptions: Record<Mode, string> = {
  Classic: "Build your squad. Break the containment line.",
  Reverse: "Unknown gates. Shoot to reveal your route.",
  Swarm: "More infected. Less breathing room. Bring spread shot.",
  Fortress: "Break stationary defenses to reach the gates.",
  Mirror: "Two formations. One army. Every choice echoes.",
  "Sudden Death": "Gates offer no growth. Earn every soldier in combat.",
};

export function purchaseSuper(p: Profile, id: SuperId): Profile {
  if (
    !isSuperId(id) ||
    p.ownedSuperWeapons.includes(id) ||
    p.currency < SUPERS[id].price
  )
    return p;
  return {
    ...p,
    currency: p.currency - SUPERS[id].price,
    ownedSuperWeapons: [...p.ownedSuperWeapons, id],
  };
}
export function setSuperLoadout(p: Profile, ids: readonly SuperId[]): Profile {
  return { ...p, superLoadout: sanitizeLoadout(ids, p.ownedSuperWeapons) };
}
