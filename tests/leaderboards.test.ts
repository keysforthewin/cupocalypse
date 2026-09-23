import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import {
  openScores,
  scoresHandler,
  validateScore,
} from "../server/leaderboards";
import { playerName, type ScoreSubmission } from "../src/game/leaderboard";
import { MODES } from "../src/game/types";
import { fresh, loadProfile, saveProfile } from "../src/game/persistence";

const score = (values: Partial<ScoreSubmission> = {}): ScoreSubmission => ({
  runId: randomUUID(),
  playerId: randomUUID(),
  name: "Survivor",
  distance: 100,
  kills: 20,
  mode: "Classic",
  ...values,
});

test("distance rankings return ten distinct players per protocol, even after restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "cupocalypse-scores-"));
  const file = join(directory, "scores.sqlite");
  let store = openScores(file);
  try {
    for (let i = 1; i <= 15; i++)
      store.submit(score({ distance: i * 10, kills: i }));
    const playerId = randomUUID();
    const distanceRun = score({
      playerId,
      name: "Distance Ace",
      distance: 1000,
      kills: 1,
    });
    store.submit(distanceRun);
    store.submit(distanceRun);
    store.submit(
      score({ playerId, name: "Kill Ace", distance: 1, kills: 1000 }),
    );
    for (const mode of MODES.filter((mode) => mode !== "Classic")) {
      store.submit(
        score({ playerId, name: `${mode} Ace`, mode, distance: 2000 }),
      );
      store.submit(score({ playerId, mode, distance: 500 }));
    }
    store.close();
    store = openScores(file);
    const boards = store.list("Classic");
    assert.equal(boards.distance.length, 10);
    assert.deepEqual(Object.keys(boards), ["distance"]);
    assert.equal(boards.distance[0].name, "Distance Ace");
    for (const mode of MODES.filter((mode) => mode !== "Classic")) {
      const entries = store.list(mode).distance;
      assert.equal(entries.length, 1);
      assert.equal(entries[0].name, `${mode} Ace`);
      assert.equal(entries[0].distance, 2000);
      assert.equal(entries[0].mode, mode);
    }
    assert.equal(
      boards.distance.filter((s) => s.playerId === playerId).length,
      1,
    );
    assert.equal(boards.distance[1].distance, 150);
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});

test("score validation rejects malformed values and normalizes names", () => {
  const valid = score({ name: "  Rust\n  Guild\u0000  " });
  assert.equal(validateScore(valid)?.name, "Rust Guild");
  for (const change of [
    { distance: -1 },
    { distance: 1.2 },
    { kills: Infinity },
    { kills: "20" },
    { name: "  " },
    { playerId: "bad" },
    { mode: "Unknown" },
  ]) {
    assert.equal(validateScore({ ...valid, ...change }), null);
  }
  assert.equal(playerName("a".repeat(50)).length, 24);
});

test("HTTP API shares scores and retries are idempotent", async () => {
  const store = openScores(":memory:");
  const handler = scoresHandler(store);
  const server = createServer(
    (req, res) => void handler(req, res, () => res.writeHead(404).end()),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (body: string, headers = {}) =>
    fetch(`${base}/api/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
  try {
    const run = score();
    assert.equal((await post(JSON.stringify(run))).status, 200);
    assert.equal(
      (await post(JSON.stringify({ ...run, distance: 9999 }))).status,
      200,
    );
    const boards = await (
      await fetch(`${base}/api/leaderboards?mode=Classic`)
    ).json();
    assert.equal(boards.distance.length, 1);
    assert.equal(boards.distance[0].distance, 100);
    assert.deepEqual(Object.keys(boards), ["distance"]);
    for (const mode of MODES.filter((mode) => mode !== "Classic")) {
      const url = `${base}/api/leaderboards?mode=${encodeURIComponent(mode)}`;
      assert.deepEqual(await (await fetch(url)).json(), { distance: [] });
      assert.equal(
        (
          await post(
            JSON.stringify(
              score({ playerId: run.playerId, mode, distance: 500 }),
            ),
          )
        ).status,
        200,
      );
      const response = await fetch(url);
      assert.equal(response.status, 200);
      const entries = (await response.json()).distance;
      assert.equal(entries.length, 1);
      assert.equal(entries[0].mode, mode);
      assert.equal(entries[0].distance, 500);
    }
    for (const query of ["", "?mode=Unknown", "?mode="]) {
      assert.equal(
        (await fetch(`${base}/api/leaderboards${query}`)).status,
        400,
      );
    }
    assert.equal((await post("{")).status, 400);
    assert.equal(
      (await post(JSON.stringify(score({ kills: -2 })))).status,
      400,
    );
    assert.equal((await post("a".repeat(5000))).status, 413);
    assert.equal(
      (await post(JSON.stringify(score()), { "Sec-Fetch-Site": "cross-site" }))
        .status,
      403,
    );
    assert.equal((await fetch(`${base}/api/scores`)).status, 405);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});

test("existing profiles migrate and remember a normalized player name", () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    values.set(
      "gate-runner-profile",
      JSON.stringify({ upgrades: [1, 2, 3], currency: 500 }),
    );
    assert.equal(loadProfile().playerName, "");
    assert.equal(loadProfile().currency, 500);
    assert.equal(loadProfile().pinnedSeed, null);
    saveProfile({ ...fresh(), playerName: "  Rust Guild  " });
    assert.equal(loadProfile().playerName, "Rust Guild");
    saveProfile({ ...fresh(), pinnedSeed: "MY-MAP-42" });
    assert.equal(loadProfile().pinnedSeed, "MY-MAP-42");
    saveProfile({ ...loadProfile(), pinnedSeed: null });
    assert.equal(loadProfile().pinnedSeed, null);
    for (const pinnedSeed of [true, 123, {}, "", "   "]) {
      values.set(
        "gate-runner-profile",
        JSON.stringify({ ...fresh(), pinnedSeed }),
      );
      assert.equal(loadProfile().pinnedSeed, null);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
