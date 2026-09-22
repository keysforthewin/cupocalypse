import fs from "node:fs";
import { Simulation, gateResult, LANES, clamp } from "../src/game/simulation";
import { MODES, type Upgrade } from "../src/game/types";
import { bot } from "../src/game/bot";
const count = Number(process.env.SEEDS || 50),
  prefix = process.env.SEED_PREFIX || "fixed";
const upgraded = process.env.UPGRADED === "1";
const report = [];
for (const mode of MODES) {
  const runs = [];
  for (let i = 0; i < count; i++) {
    const upgrades: Upgrade = upgraded ? [5, 5, 5] : [0, 0, 0];
    const s = new Simulation(
      `${prefix}-${i.toString().padStart(3, "0")}`,
      mode,
      upgrades,
    );
    for (let tick = 0; tick < 60 * 60 * 15 && !s.over; tick++)
      s.update({ x: bot(s) }, false);
    runs.push({
      seed: s.seed,
      distance: Math.round(s.distance),
      duration: Math.round(s.time),
      kills: s.kills,
      bosses: s.bossKills,
      peak: s.peak,
      reason: s.over ? s.reason : "15 minute cutoff",
    });
  }
  const sorted = runs.map((r) => r.distance).sort((a, b) => a - b);
  const quantile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)];
  const summary = {
    mode,
    upgraded,
    seeds: count,
    min: sorted[0],
    p10: quantile(0.1),
    median: quantile(0.5),
    p90: quantile(0.9),
    max: sorted.at(-1),
    reasons: runs.reduce(
      (r, a) => ({ ...r, [a.reason]: (r[a.reason] || 0) + 1 }),
      {} as Record<string, number>,
    ),
  };
  console.log(JSON.stringify(summary));
  report.push({ summary, runs });
}
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync(
  `artifacts/balance-${prefix}-${upgraded ? "upgraded" : "fresh"}.json`,
  JSON.stringify(report, null, 2),
);
