import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MODES } from "../src/game/types";
import {
  playerName,
  type ScoreSubmission,
  type Leaderboards,
  type LeaderboardEntry,
} from "../src/game/leaderboard";

export function openScores(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS scores (
      runId TEXT PRIMARY KEY,
      playerId TEXT NOT NULL,
      name TEXT NOT NULL,
      distance INTEGER NOT NULL,
      kills INTEGER NOT NULL,
      mode TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scores_player ON scores(playerId);
  `);
  return {
    submit(score: ScoreSubmission) {
      // A retry keeps the same run ID, so a lost response cannot duplicate a run.
      db.prepare(
        "INSERT OR IGNORE INTO scores VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        score.runId,
        score.playerId,
        score.name,
        score.distance,
        score.kills,
        score.mode,
        Date.now(),
      );
    },
    list(): Leaderboards {
      const top = (metric: "distance" | "kills") =>
        db
          .prepare(
            `
        SELECT playerId, name, distance, kills, mode FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY playerId ORDER BY ${metric} DESC, ${metric === "distance" ? "kills" : "distance"} DESC, createdAt ASC, runId ASC
          ) AS place FROM scores
        ) WHERE place = 1
        ORDER BY ${metric} DESC, ${metric === "distance" ? "kills" : "distance"} DESC, createdAt ASC, runId ASC LIMIT 10
      `,
          )
          .all() as unknown as LeaderboardEntry[];
      return { distance: top("distance"), kills: top("kills") };
    },
    close() {
      db.close();
    },
  };
}

export function validateScore(value: unknown): ScoreSubmission | null {
  if (!value || typeof value !== "object") return null;
  const s = value as ScoreSubmission;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    typeof s.runId !== "string" ||
    !uuid.test(s.runId) ||
    typeof s.playerId !== "string" ||
    !uuid.test(s.playerId) ||
    !playerName(s.name) ||
    !MODES.includes(s.mode as (typeof MODES)[number]) ||
    !Number.isSafeInteger(s.distance) ||
    s.distance < 0 ||
    s.distance > 1_000_000_000 ||
    !Number.isSafeInteger(s.kills) ||
    s.kills < 0 ||
    s.kills > 1_000_000_000
  )
    return null;
  return {
    runId: s.runId,
    playerId: s.playerId,
    name: playerName(s.name),
    distance: s.distance,
    kills: s.kills,
    mode: s.mode,
  };
}

export function scoresHandler(store: ReturnType<typeof openScores>) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const path = req.url?.split("?")[0];
    if (path !== "/api/leaderboards" && path !== "/api/scores") return next();
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (path === "/api/leaderboards" && req.method === "GET")
        return reply(200, store.list());
      if (path !== "/api/scores" || req.method !== "POST")
        return reply(405, { error: "Method not allowed" });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return reply(415, { error: "JSON required" });
      if (req.headers["sec-fetch-site"] === "cross-site")
        return reply(403, { error: "Same-origin requests only" });
      let body = "";
      let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > 4096) return reply(413, { error: "Request too large" });
        body += chunk;
      }
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        return reply(400, { error: "Invalid JSON" });
      }
      const score = validateScore(value);
      if (!score) return reply(400, { error: "Invalid score" });
      store.submit(score);
      reply(200, { saved: true });
    } catch (error) {
      console.error("Leaderboard request failed", error);
      if (!res.headersSent) reply(500, { error: "Scores unavailable" });
    }
  };
}
