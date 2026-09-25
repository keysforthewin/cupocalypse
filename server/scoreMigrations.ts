import type { DatabaseSync } from "node:sqlite";
import { playerName } from "../src/game/leaderboard";

export const scoreNameKey = (name: string) => playerName(name).toLowerCase();

export function migrateScores(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const version = db.prepare("PRAGMA user_version").get()!.user_version;
    if (version === 0) {
      // Remember every submitted run, including duplicates removed below, so
      // retries cannot resubmit an old run after its score has been replaced.
      db.exec(`
        CREATE TABLE score_runs (runId TEXT PRIMARY KEY);
        INSERT INTO score_runs SELECT runId FROM scores;
        ALTER TABLE scores ADD COLUMN nameKey TEXT NOT NULL DEFAULT '';
      `);
      const update = db.prepare(
        "UPDATE scores SET name = ?, nameKey = ? WHERE runId = ?",
      );
      for (const row of db.prepare("SELECT runId, name FROM scores").all()) {
        const name = playerName(row.name);
        update.run(name, scoreNameKey(name), row.runId);
      }
      db.exec(`
        DELETE FROM scores WHERE runId IN (
          SELECT runId FROM (
            SELECT runId, ROW_NUMBER() OVER (
              PARTITION BY mode, nameKey
              ORDER BY distance DESC, kills DESC, createdAt ASC, runId ASC
            ) AS place FROM scores
          ) WHERE place > 1
        );
        CREATE UNIQUE INDEX scores_mode_name ON scores(mode, nameKey);
        PRAGMA user_version = 1;
      `);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
