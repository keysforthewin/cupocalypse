// Headless simulation benchmark: plays the deterministic simulation with the
// built-in bot for a fixed number of simulated minutes and reports how the
// cost of one tick, the entity pools, and the JS heap evolve over time.
//
//   NODE_OPTIONS=--expose-gc npx tsx scripts/perf-sim.ts [label]
//   MODES=Classic,Mirror SEEDS=perf-001,perf-002 MINUTES=12 WINDOW=30
import fs from "node:fs";
import { PerformanceObserver } from "node:perf_hooks";
import { Simulation } from "../src/game/simulation";
import { GUNS } from "../src/game/projectiles";
import { BOOSTS, type Mode } from "../src/game/types";
import { bot } from "../src/game/bot";
const label = process.argv[2] || "baseline";
const modes = (process.env.MODES || "Classic").split(",") as Mode[];
const seeds = (process.env.SEEDS || "perf-001,perf-002").split(",");
const minutes = Number(process.env.MINUTES || 12);
const windowSeconds = Number(process.env.WINDOW || 30);
const upgrades = (process.env.UPGRADES || "0,0,0").split(",").map(Number) as [
  number,
  number,
  number,
];
// Assist options model a strong human player instead of the cautious bot:
// AUTOLOOT grants one loot-deck pickup every N seconds, ARMY_FLOOR tops the
// squad up each window, and NO_BOSS skips boss arenas entirely.
const autoloot = Number(process.env.AUTOLOOT || 0);
const armyFloor = Number(process.env.ARMY_FLOOR || 0);
const noBoss = process.env.NO_BOSS === "1";
const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));
let gcCount = 0,
  gcMs = 0;
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gcCount++;
    gcMs += entry.duration;
  }
});
observer.observe({ entryTypes: ["gc"] });
const forceGc = (globalThis as { gc?: () => void }).gc;
interface Window {
  minute: number;
  distance: number;
  boss: number;
  army: number;
  kills: number;
  updateMsPerTick: number;
  updateMaxMs: number;
  botMsPerTick: number;
  gcCount: number;
  gcMs: number;
  heapMb: number;
  heapAfterGcMb: number | null;
  pool: number;
  activeBullets: number;
  pending: number;
  enemies: number;
  effects: number;
  fields: number;
  gunLevels: number;
  boostLevels: number;
  droppedShots: number;
  droppedSchedules: number;
}
const report: {
  label: string;
  node: string;
  runs: { mode: Mode; seed: string; over: string; windows: Window[] }[];
} = { label, node: process.version, runs: [] };
for (const mode of modes)
  for (const seed of seeds) {
    const s = new Simulation(seed, mode, upgrades);
    if (noBoss) s.nextBoss = 1e9;
    const windows: Window[] = [];
    const ticksPerWindow = windowSeconds * 60;
    const totalTicks = minutes * 60 * 60;
    let updateMs = 0,
      updateMax = 0,
      botMs = 0;
    gcCount = 0;
    gcMs = 0;
    for (let tick = 0; tick < totalTicks && !s.over; tick++) {
      if (autoloot && tick > 0 && tick % (autoloot * 60) === 0)
        s.pickup(s.loot.next({ ...s.guns, ...s.boosts }));
      if (armyFloor && s.army < armyFloor) s.army = armyFloor;
      const b0 = performance.now();
      const x = bot(s);
      const u0 = performance.now();
      s.update({ x }, false);
      const u1 = performance.now();
      botMs += u0 - b0;
      updateMs += u1 - u0;
      updateMax = Math.max(updateMax, u1 - u0);
      if ((tick + 1) % ticksPerWindow === 0 || s.over) {
        await yieldToLoop();
        const heapMb = process.memoryUsage().heapUsed / 1048576;
        let heapAfterGcMb: number | null = null;
        if (forceGc) {
          forceGc();
          heapAfterGcMb = process.memoryUsage().heapUsed / 1048576;
        }
        const ticks = (tick + 1) % ticksPerWindow || ticksPerWindow;
        windows.push({
          minute: Math.round(((tick + 1) / 3600) * 100) / 100,
          distance: Math.round(s.distance),
          boss: s.bossIndex,
          army: s.army,
          kills: s.kills,
          updateMsPerTick: Math.round((updateMs / ticks) * 1000) / 1000,
          updateMaxMs: Math.round(updateMax * 100) / 100,
          botMsPerTick: Math.round((botMs / ticks) * 1000) / 1000,
          gcCount,
          gcMs: Math.round(gcMs),
          heapMb: Math.round(heapMb * 10) / 10,
          heapAfterGcMb:
            heapAfterGcMb === null ? null : Math.round(heapAfterGcMb * 10) / 10,
          pool: s.bullets.length,
          activeBullets: s.bullets.filter((b) => b.active).length,
          pending: s.pendingShots.length,
          enemies: s.enemies.length,
          effects: s.effects.filter((e) => e.active).length,
          fields: s.fields.length,
          gunLevels: GUNS.reduce((n, k) => n + s.guns[k], 0),
          boostLevels: BOOSTS.reduce((n, k) => n + s.boosts[k], 0),
          droppedShots: s.droppedShots,
          droppedSchedules: s.droppedSchedules,
        });
        updateMs = updateMax = botMs = 0;
        gcCount = 0;
        gcMs = 0;
      }
    }
    report.runs.push({
      mode,
      seed,
      over: s.over ? s.reason : `${minutes} minute cutoff`,
      windows,
    });
    console.log(`\n${mode} ${seed} — ${s.over ? s.reason : "cutoff"}`);
    console.log(
      "min   dist boss army  upd/tick max  bot/tick gcN gcMs heap  afterGc pool  act  pend en fx guns boosts drop",
    );
    for (const w of windows)
      console.log(
        [
          w.minute.toFixed(1).padStart(4),
          String(w.distance).padStart(6),
          String(w.boss).padStart(4),
          String(w.army).padStart(5),
          w.updateMsPerTick.toFixed(3).padStart(9),
          w.updateMaxMs.toFixed(1).padStart(5),
          w.botMsPerTick.toFixed(3).padStart(8),
          String(w.gcCount).padStart(4),
          String(w.gcMs).padStart(5),
          w.heapMb.toFixed(0).padStart(5),
          String(w.heapAfterGcMb ?? "-").padStart(7),
          String(w.pool).padStart(5),
          String(w.activeBullets).padStart(5),
          String(w.pending).padStart(5),
          String(w.enemies).padStart(3),
          String(w.effects).padStart(3),
          String(w.gunLevels).padStart(4),
          String(w.boostLevels).padStart(6),
          String(w.droppedShots + w.droppedSchedules).padStart(5),
        ].join(" "),
      );
  }
fs.mkdirSync("artifacts/perf", { recursive: true });
fs.writeFileSync(
  `artifacts/perf/sim-${label}.json`,
  JSON.stringify(report, null, 2),
);
console.log(`\nSaved artifacts/perf/sim-${label}.json`);
