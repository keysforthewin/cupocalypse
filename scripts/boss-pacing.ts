import fs from "node:fs";
import { Simulation } from "../src/game/simulation";
import { bot } from "../src/game/bot";
import type { Mode } from "../src/game/types";
// A reproducible upgraded benchmark; it is not a substitute for human playtests.
const s = new Simulation(
  process.env.SEED || "boss-campaign-000",
  (process.env.MODE || "Mirror") as Mode,
  [5, 5, 5],
);
let bossId = 0,
  start = 0;
const fights: { kind: string; hp: number; army: number; seconds?: number }[] =
  [];
for (let n = 0; n < 60 * 60 * 18 && !s.over; n++) {
  const e = s.boss;
  if (e && e.id !== bossId) {
    bossId = e.id;
    start = s.tick;
    fights.push({ kind: e.kind, hp: e.hp, army: s.army });
  }
  const kills = s.bossKills;
  s.update({ x: bot(s) }, false);
  if (s.bossKills > kills) fights.at(-1)!.seconds = (s.tick - start) / 60;
}
const report = {
  seed: s.seed,
  mode: s.mode,
  upgrades: s.upgrades,
  outcome: s.outcome,
  seconds: s.tick / 60,
  distance: s.distance,
  fights,
};
fs.mkdirSync("artifacts/boss-review", { recursive: true });
fs.writeFileSync(
  "artifacts/boss-review/pacing.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
