import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { Simulation } from "../src/game/simulation";
import { bot } from "../src/game/bot";
const count = Number(process.env.SEEDS || 20),
  prefix = process.env.SEED_PREFIX || "arsenal-fixed";
const Constructor: typeof Simulation = process.env.BASELINE_SOURCE
  ? (
      await import(
        pathToFileURL(`${process.env.BASELINE_SOURCE}/src/game/simulation.ts`)
          .href
      )
    ).Simulation
  : Simulation;
const runs = [];
for (let i = 0; i < count; i++) {
  const s = new Constructor(`${prefix}-${String(i).padStart(3, "0")}`);
  let firstEncounter = false,
    secondDefeated = false,
    contactEscapes = 0,
    priorIndex = 0,
    priorKills = 0,
    firstAt = 0,
    pickups = 0,
    damage = 0;
  const originalPickup = s.pickup.bind(s),
    originalDamage = s.damageEnemy.bind(s);
  s.pickup = (kind) => {
    pickups++;
    originalPickup(kind);
  };
  s.damageEnemy = (enemy, amount) => {
    if (!enemy.dead) damage += Math.min(enemy.hp + enemy.armor, amount);
    originalDamage(enemy, amount);
  };
  for (let tick = 0; tick < 60 * 300 && !s.over && s.bossIndex < 2; tick++) {
    let x = bot(s);
    // Identical legal-speed, supply-aware steering in both versions.
    const drop = s.drops.find((d) => d.z < 16 && d.z > s.crowd.push + 1);
    if (
      drop &&
      !s.hazards.some(
        (h) =>
          h.warnAt <= s.tick &&
          h.endAt >= s.tick &&
          h.lanes.some((l) => Math.abs([-3, 0, 3][l] - drop.x) < 1.6),
      ) &&
      !s.enemies.some(
        (e) =>
          !e.dead && Math.abs(e.x - drop.x) < 1.5 && e.z < s.crowd.push + 8,
      ) &&
      !s.gates.some((g) => !g.passed && g.z < drop.z)
    )
      x = drop.x;
    s.update({ x }, false);
    if (s.bossIndex > priorIndex) {
      const killed = s.bossKills > priorKills;
      if (!killed) contactEscapes++;
      if (s.bossIndex === 1) {
        firstEncounter = !s.over;
        firstAt = s.time;
      }
      if (s.bossIndex === 2 && killed) secondDefeated = true;
      priorIndex = s.bossIndex;
      priorKills = s.bossKills;
    }
  }
  const r = {
    seed: s.seed,
    distance: Math.round(s.distance),
    firstEncounter,
    secondDefeated,
    bossKills: s.bossKills,
    contactEscapes,
    pickups,
    damage: Math.round(damage),
    afterFirstSeconds: firstEncounter ? Math.round(s.time - firstAt) : 0,
    reason: s.over
      ? s.reason
      : s.bossIndex >= 2
        ? "second encounter completed"
        : "five-minute cutoff",
  };
  runs.push(r);
  console.log(JSON.stringify(r));
}
const survivors = runs.filter((r) => r.firstEncounter),
  summary = {
    prefix,
    count,
    firstSurvivors: survivors.length,
    secondBossVictories: survivors.filter((r) => r.secondDefeated).length,
    secondBossRate:
      survivors.filter((r) => r.secondDefeated).length /
      Math.max(1, survivors.length),
    medianDistance: runs.map((r) => r.distance).sort((a, b) => a - b)[
      Math.floor(count / 2)
    ],
    meanPickups: runs.reduce((n, r) => n + r.pickups, 0) / count,
  };
fs.mkdirSync("artifacts/arsenal", { recursive: true });
fs.writeFileSync(
  `artifacts/arsenal/balance-${prefix}-${process.env.BASELINE_SOURCE ? "before" : "after"}.json`,
  JSON.stringify({ summary, runs }, null, 2),
);
console.log(JSON.stringify(summary));
