import test from "node:test";
import assert from "node:assert/strict";
import { AudioEngine } from "../src/game/audio";
import { Simulation } from "../src/game/simulation";

test("gate passage plays once, distinguishes losses, and resets for a new run", () => {
  const audio = new AudioEngine();
  const notes: number[] = [];
  audio.tone = (frequency) => {
    notes.push(frequency);
  };
  for (const x of [-3, 3, 0]) {
    const sim = new Simulation("gate-audio");
    sim.nextBoss = sim.nextEncounter = sim.nextSupply = sim.fireClock = 1e9;
    sim.x = x;
    sim.spawnGate();
    Object.assign(sim.gates[0], {
      z: sim.crowd.push,
      left: "+",
      a: 10,
      right: "−",
      b: 3,
    });
    notes.length = 0;
    audio.telegraph(sim);
    assert.deepEqual(notes, []);
    sim.update({ x });
    audio.telegraph(sim);
    assert.deepEqual(
      notes,
      x < 0 ? [110, 660, 990] : x > 0 ? [110, 220, 261.6] : [],
    );
    const count = notes.length;
    for (let i = 0; i < 45; i++) {
      sim.update({ x });
      audio.telegraph(sim);
    }
    assert.equal(notes.length, count);
  }
});

function setup() {
  const audio = new AudioEngine();
  const sources: {
    loop: boolean;
    starts: number;
    stops: number;
    disconnects: number;
  }[] = [];
  audio.ctx = {
    currentTime: 0,
    sampleRate: 48000,
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const source = {
        loop: false,
        starts: 0,
        stops: 0,
        disconnects: 0,
        connect() {},
        disconnect() {
          this.disconnects++;
        },
        start() {
          this.starts++;
        },
        stop() {
          this.stops++;
        },
      };
      sources.push(source);
      return source;
    },
  } as unknown as AudioContext;
  audio.bus = { gain: { setTargetAtTime() {} } } as unknown as GainNode;
  const sim = new Simulation(
    "ready-audio",
    "Classic",
    [0, 0, 0],
    ["mortal", "doc"],
  );
  sim.supers.slot.charge = sim.supers.slot.quota;
  return { audio, sim, sources };
}

test("ready audio loops once, survives selection changes, and stops when fired", () => {
  const { audio, sim, sources } = setup();
  audio.updateSuperReady(sim);
  for (let i = 0; i < 120; i++) audio.updateSuperReady(sim);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].loop, true);
  assert.equal(sources[0].starts, 1);
  sim.supers.select(1);
  audio.updateSuperReady(sim);
  assert.equal(sources[0].stops, 0);
  sim.supers.select(-1);
  assert.equal(sim.supers.activate(), true);
  audio.updateSuperReady(sim);
  assert.equal(audio.superReadySource, null);
  assert.equal(sources[0].stops, 1);
  assert.equal(sources[0].disconnects, 1);
});

test("ready audio respects pause and mute, restarts on resume, and stops at game over", () => {
  const { audio, sim, sources } = setup();
  audio.updateSuperReady(sim);
  audio.setActive(false);
  audio.updateSuperReady(sim);
  assert.equal(audio.superReadySource, null);
  audio.setActive(true);
  audio.updateSuperReady(sim);
  assert.equal(sources.length, 2);
  audio.muted = true;
  audio.updateSuperReady(sim);
  assert.equal(audio.superReadySource, null);
  audio.muted = false;
  audio.updateSuperReady(sim);
  assert.equal(sources.length, 3);
  sim.over = true;
  audio.updateSuperReady(sim);
  assert.equal(audio.superReadySource, null);
  assert.ok(sources.every((s) => s.stops === 1 && s.disconnects === 1));
});

test("another charged super keeps the alert going and a new run clears it", () => {
  const { audio, sim, sources } = setup();
  sim.supers.slots[1].charge = sim.supers.slots[1].quota;
  audio.updateSuperReady(sim);
  sim.supers.activate();
  audio.updateSuperReady(sim);
  assert.equal(sources[0].stops, 0);
  audio.supers(new Simulation("fresh-run"));
  assert.equal(audio.superReadySource, null);
  assert.equal(sources[0].stops, 1);
});
