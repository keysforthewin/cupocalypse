import fs from "node:fs";
import { Simulation } from "../src/game/simulation";
import { MODES, type Upgrade } from "../src/game/types";
import { bot } from "../src/game/bot";
interface Activation {
  id: string;
  seconds: number;
  quota: number;
  focusedSeconds: number;
  readyHeld: number;
}
const runs: {
  mode: string;
  upgraded: boolean;
  seed: string;
  seconds: number;
  kills: number;
  distance: number;
  firstCharge: number | null;
  activations: Activation[];
  reason: string;
}[] = [];
const count = Number(process.env.SEEDS || 5);
for (const mode of MODES)
  for (const upgraded of [false, true])
    for (let n = 0; n < count; n++) {
      const upgrades: Upgrade = upgraded ? [5, 5, 5] : [0, 0, 0];
      const s = new Simulation(`super-balance-${n}`, mode, upgrades, [
        "doc",
        "mortal",
        "nitro",
      ]);
      const activations: {
        id: string;
        seconds: number;
        quota: number;
        focusedSeconds: number;
        readyHeld: number;
      }[] = [];
      const focused = [0, 0, 0];
      let prior = 0,
        first: number | null = null;
      const readyAt = [-1, -1, -1];
      for (let t = 0; t < 18000 && !s.over; t++) {
        const slot = s.supers.slot,
          index = s.supers.selected;
        const ready =
          s.supers.charge >= s.supers.quota && !s.supers.active(slot.id);
        if (ready && readyAt[index] < 0) readyAt[index] = s.tick;
        const cycle = !ready && s.supers.active(slot.id) ? 1 : 0;
        if (!cycle) focused[index]++;
        const required = s.supers.quota;
        s.update(
          { x: bot(s), superPressed: ready, superCycle: cycle as 0 | 1 },
          false,
        );
        if (s.supers.serial > prior) {
          prior = s.supers.serial;
          first ??= s.time;
          activations.push({
            id: slot.id,
            seconds: s.time,
            quota: required,
            focusedSeconds: focused[index] / 60,
            readyHeld: readyAt[index] < 0 ? 0 : (s.tick - readyAt[index]) / 60,
          });
          focused[index] = 0;
          readyAt[index] = -1;
        }
      }
      runs.push({
        mode,
        upgraded,
        seed: s.seed,
        seconds: s.time,
        kills: s.kills,
        distance: Math.floor(s.distance),
        firstCharge: first,
        activations,
        reason: s.over ? s.reason : "five-minute cutoff",
      });
    }
const median = (a: number[]) => {
  const sorted = [...a].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const summary = MODES.flatMap((mode) =>
  [false, true].map((upgraded) => {
    const group = runs.filter(
        (r) => r.mode === mode && r.upgraded === upgraded,
      ),
      charged = group.filter((r) => r.firstCharge !== null);
    return {
      mode,
      upgraded,
      runs: group.length,
      chargedRuns: charged.length,
      endedBeforeCharge: group.filter((r) => r.firstCharge === null).length,
      medianFirstChargeSeconds: median(charged.map((r) => r.firstCharge!)),
      medianDistance: median(group.map((r) => r.distance)),
      activations: group.reduce((n, r) => n + r.activations.length, 0),
      medianFocusedChargingSeconds: median(
        group.flatMap((r) => r.activations.map((a) => a.focusedSeconds)),
      ),
    };
  }),
);
fs.mkdirSync("artifacts/supers", { recursive: true });
fs.writeFileSync(
  "artifacts/supers/balance.json",
  JSON.stringify(
    {
      assumption:
        "Legal-speed existing bot; five fixed seeds per mode/profile; Doc/Mortal/Nitro; switch after activation; 300 simulated second cutoff. Charge targets are kill quotas, not minimum timers.",
      summary,
      runs,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(summary, null, 2));
