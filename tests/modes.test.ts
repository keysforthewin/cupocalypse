import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, formationPositions } from "../src/game/simulation";
test("Mirror copies share one gate result and keep total firepower unchanged", () => {
  const s = new Simulation("mirror", "Mirror");
  s.nextEncounter = 1e9;
  s.nextBoss = 1e9;
  s.spawnGate();
  const g = s.gates[0];
  g.z = 0.1;
  g.left = "+";
  g.a = 20;
  s.x = -3;
  s.fireClock = 100;
  s.update({ x: -3 });
  assert.equal(s.army, 44);
  assert.deepEqual(formationPositions("Mirror", -3), [-3.95, 3.95]);
  const c = new Simulation("mirror", "Classic"),
    m = new Simulation("mirror", "Mirror");
  c.update({ x: 0 });
  m.update({ x: 0 });
  assert.equal(
    c.bullets.reduce((n, b) => n + (b.active ? b.damage : 0), 0),
    m.bullets.reduce((n, b) => n + (b.active ? b.damage : 0), 0),
  );
});
test("Screamer visibly prepares and death cancels its pending pulse", () => {
  const s = new Simulation("scream");
  s.nextEncounter = 1e9;
  s.nextBoss = 1e9;
  const scream = s.spawnEnemy("Screamer", -3, 30)!,
    walker = s.spawnEnemy("Walker", 3, 30)!;
  scream.cooldown = 0;
  s.fireClock = 100;
  s.update({ x: 0 });
  assert.equal(scream.action, "scream");
  assert.equal(walker.buffUntil, 0);
  s.kill(scream);
  for (let n = 0; n < 80; n++) s.update({ x: 0 });
  assert.equal(walker.buffUntil, 0);
});
test("every specialist gets a dedicated introduction before random selection", () => {
  const s = new Simulation("intro");
  for (let d = 0; d < 1500; d += 22) {
    s.distance = d;
    const prior = s.introduced;
    s.generate();
    if (s.introduced > prior) assert.ok(s.template.startsWith("Introduction:"));
    s.enemies = [];
    s.gates = [];
    s.drops = [];
  }
  assert.equal(s.introduced, 10);
});
test("boss arena waits until preceding gates, enemies, and hazards have cleared", () => {
  const s = new Simulation("arena");
  s.distance = 235;
  s.nextEncounter = 1e9;
  s.spawnGate();
  s.gates[0].z = 20;
  s.update({ x: 0 });
  assert.equal(s.bossPending, true);
  assert.equal(s.bossActive, false);
  s.gates = [];
  s.warn(0, [0], "pool", 1, 0.1, 0.1);
  s.update({ x: 3 });
  assert.equal(s.bossActive, false);
  s.hazards = [];
  s.update({ x: 3 });
  assert.equal(s.bossActive, true);
  assert.equal(s.boss?.kind, "Bulwark");
});
test("Sudden Death shooting cannot improve a penalty past neutral, even with a large hit", async () => {
  const { improveGate } = await import("../src/game/simulation");
  const s = new Simulation("neutral", "Sudden Death");
  s.spawnGate();
  const g = s.gates[0];
  g.left = "−";
  g.a = 2;
  improveGate(g, "a", 90, s.mode);
  assert.equal(g.left, "+");
  assert.equal(g.a, 0);
});
test("replay quantization affects simulation and recording identically", async () => {
  const { replayRun } = await import("../src/game/simulation");
  const s = new Simulation("fraction");
  for (let i = 0; i < 180; i++) s.update({ x: 1.234567 });
  const r = replayRun(s.replay());
  assert.equal(r.x, s.x);
  assert.deepEqual(r.bullets, s.bullets);
});
