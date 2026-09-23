import type { Mode } from "./types";

export const MAX_PLAYER_NAME = 24;
export function playerName(value: unknown): string {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/[\p{C}]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_PLAYER_NAME)
    : "";
}

export interface ScoreSubmission {
  runId: string;
  playerId: string;
  name: string;
  distance: number;
  kills: number;
  mode: string;
}
export interface LeaderboardEntry {
  playerId: string;
  name: string;
  distance: number;
  kills: number;
  mode: string;
}
export interface Leaderboards {
  distance: LeaderboardEntry[];
}

export function loadPlayerId(): string {
  try {
    const saved = localStorage.getItem("cupocalypse-player-id");
    if (saved && /^[a-f0-9-]{36}$/i.test(saved)) return saved;
  } catch {
    /* Storage can be unavailable. */
  }
  const id = crypto.randomUUID();
  try {
    localStorage.setItem("cupocalypse-player-id", id);
  } catch {
    /* Session identity still works. */
  }
  return id;
}

export async function fetchLeaderboards(
  mode: Mode,
  signal?: AbortSignal,
): Promise<Leaderboards> {
  const response = await fetch(
    `/api/leaderboards?mode=${encodeURIComponent(mode)}`,
    { signal },
  );
  if (!response.ok)
    throw new Error("Shared scores are unavailable. Please try again.");
  return response.json();
}

export async function submitScore(score: ScoreSubmission): Promise<void> {
  const response = await fetch("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(score),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Score could not be saved. Please try again.");
}
