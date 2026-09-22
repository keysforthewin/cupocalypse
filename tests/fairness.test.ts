import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation";
import { reachableRoute } from "../src/game/fairness";
import { MODES, BOSSES } from "../src/game/types";
test("warned boss patterns have a legal-speed route from both road edges in every mode", () => {
  for (const mode of MODES)
    for (const name of BOSSES)
      for (const x of [-3.8, 3.8]) {
        const sim = new Simulation("route", mode);
        sim.x = x;
        sim.nextEncounter = 1e9;
        sim.nextBoss = 1e9;
        sim.bossActive = true;
        const boss = sim.spawnEnemy(name, 0, 25, true)!;
        boss.phase = 2;
        boss.hp = boss.maxHp * 0.4;
        boss.cooldown = 0;
        sim.update({ x });
        assert.ok(reachableRoute(sim, 6, true), `${mode} ${name} x=${x}`);
      }
});
test("validator rejects an impossible simultaneous full-road hazard", () => {
  const sim = new Simulation();
  sim.warn(1, [0, 1], "slam", 1);
  const h = sim.warn(2, [2], "slam", 1);
  h.warnAt = 0;
  h.strikeAt = sim.hazards[0].strikeAt;
  h.endAt = sim.hazards[0].endAt;
  assert.equal(reachableRoute(sim, 3), false);
});
test("specialist introductions and gate-wall templates permit reference routes", () => {
  for (const mode of MODES)
    for (let n = 0; n < 60; n++) {
      const sim = new Simulation("route-" + n, mode);
      sim.distance = n * 22;
      sim.introduced = Math.min(10, 1 + Math.floor(n / 4));
      sim.generate();
      assert.ok(reachableRoute(sim, 8), `${mode} at ${n * 22}m`);
    }
});
