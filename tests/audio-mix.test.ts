import test from "node:test";
import assert from "node:assert/strict";
import { AudioEngine } from "../src/game/audio";
import {
  AUDIO_CUES,
  nextVariant,
  cueDefaults,
} from "../src/game/audioManifest";
import { Simulation } from "../src/game/simulation";
import { biomeAtVisit } from "../src/render/biomes";

function rig() {
  const nodes: FakeNode[] = [];
  const param = () => ({
    value: 0,
    targets: [] as number[],
    setValueAtTime(v: number) {
      this.value = v;
    },
    linearRampToValueAtTime(v: number) {
      this.value = v;
    },
    exponentialRampToValueAtTime(v: number) {
      this.value = v;
    },
    cancelScheduledValues() {},
    setTargetAtTime(v: number) {
      this.targets.push(v);
      this.value = v;
    },
  });
  class FakeNode {
    gain = param();
    pan = param();
    frequency = param();
    detune = param();
    Q = param();
    playbackRate = param();
    buffer: unknown;
    loop = false;
    onended: (() => void) | null = null;
    stopTimes: number[] = [];
    disconnects = 0;
    connections: unknown[] = [];
    starts: unknown[][] = [];
    connect(node: unknown) {
      this.connections.push(node);
      return node;
    }
    disconnect() {
      this.disconnects++;
    }
    start(...args: unknown[]) {
      this.starts.push(args);
    }
    stop(at = 0) {
      this.stopTimes.push(at);
    }
  }
  const node = () => {
    const n = new FakeNode();
    nodes.push(n);
    return n;
  };
  const context = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: node,
    createStereoPanner: node,
    createBufferSource: node,
    createOscillator: node,
    createBiquadFilter: node,
    createBuffer: (_c: number, n: number) => ({
      getChannelData: () => new Float32Array(n),
    }),
  };
  const a = new AudioEngine();
  a.ctx = context as unknown as AudioContext;
  a.bus = node() as unknown as GainNode;
  a.weaponBus = node() as unknown as GainNode;
  a.buses.set("weapons", a.weaponBus);
  a.cues = { ...AUDIO_CUES };
  const buffer = (duration: number) =>
    ({
      duration,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(Math.ceil(duration * 44100)),
    }) as unknown as AudioBuffer;
  return { a, context, nodes, buffer };
}
test("variant selection cannot repeat the previous take, including edge random values", () => {
  for (let count = 2; count <= 6; count++)
    for (let prev = 0; prev < count; prev++)
      for (const random of [0, 0.2, 0.5, 0.999999, 1]) {
        const n = nextVariant(count, prev, random);
        assert.notEqual(n, prev);
        assert.ok(n >= 0 && n < count);
      }
  assert.equal(nextVariant(1, 0, 0.5), 0);
});
test("triggered samples use every variant and never repeat the last take", (t) => {
  const { a, buffer, nodes } = rig();
  const bank = [buffer(0.2), buffer(0.3), buffer(0.4)];
  a.sampleVariants.set("pulse", bank);
  const random = [0, 0.99, 0.99, 0, 0.99, 0.99];
  let n = 0;
  t.mock.method(Math, "random", () => random[n++ % random.length]);
  const heard: unknown[] = [];
  for (let i = 0; i < 6; i++) {
    assert.equal(a.sample("pulse", 0, 0.2), true);
    heard.push(nodes.filter((v) => v.starts.length).at(-1)!.buffer);
    a.stop();
  }
  assert.equal(new Set(heard).size, 3);
  assert.ok(heard.slice(1).every((v, i) => v !== heard[i]));
});
test("recorded ready reminders vary each phrase and cannot restart after mute", (t) => {
  const { a, buffer, nodes } = rig();
  a.sampleVariants.set("ui-ready", [buffer(0.2), buffer(0.3), buffer(0.4)]);
  const random = [0, 0.99, 0.99];
  let n = 0;
  t.mock.method(Math, "random", () => random[n++ % random.length]);
  const sim = new Simulation(
    "ready-variants",
    "Classic",
    [0, 0, 0],
    ["mortal"],
  );
  sim.supers.charge = sim.supers.quota;
  a.updateSuperReady(sim);
  const heard: unknown[] = [];
  for (let i = 0; i < 3; i++) {
    const source = nodes.filter((v) => v.starts.length).at(-1)!;
    assert.equal(source.loop, false);
    heard.push(source.buffer);
    source.onended?.();
  }
  assert.equal(new Set(heard).size, 3);
  const last = nodes.filter((v) => v.starts.length).at(-1)!;
  a.muted = true;
  last.onended?.();
  assert.equal(a.superReadySource, null);
  assert.equal(last.disconnects, 1);
});
test("ambience randomizes on entry, remains stable while playing, and keeps all variants reachable", (t) => {
  const { a, buffer, nodes } = rig();
  const sim = new Simulation("ambience-variants");
  a.sampleVariants.set(`ambience-${biomeAtVisit(sim.seed, 0)}`, [
    buffer(12),
    buffer(12),
    buffer(12),
  ]);
  const random = [0, 0.99, 0.99];
  let n = 0;
  t.mock.method(Math, "random", () => random[n++ % random.length]);
  const heard: unknown[] = [];
  for (let i = 0; i < 3; i++) {
    a.ambience(sim);
    a.ambience(sim);
    heard.push(nodes.filter((v) => v.starts.length).at(-1)!.buffer);
    assert.equal(a.voices.size, 1);
    a.stop();
  }
  assert.equal(new Set(heard).size, 3);
  assert.equal(n, 3);
});
test("sample playback preserves authored tails and applies cue boundaries with pitch", () => {
  const { a, buffer, nodes } = rig();
  a.buffers.set("pulse", buffer(1.8));
  assert.equal(a.sample("pulse", 0, 0.3), true);
  assert.deepEqual(nodes.find((n) => n.starts.length)?.stopTimes, [1.8]);
  a.stop();
  a.cues.pulse = { ...a.cues.pulse, start: 0.2, end: 1.4 };
  a.sample("pulse", 0, 0.3, 2);
  assert.deepEqual(
    nodes.filter((n) => n.starts.length).at(-1)?.stopTimes,
    [0.6],
  );
});
test("overlapping priority cues keep weapons ducked until the last cue ends", () => {
  const { a, buffer, nodes } = rig();
  a.buffers.set("super-mortal", buffer(2));
  a.buffers.set("super-doc", buffer(3));
  a.sample("super-mortal", 0, 0.5);
  a.sample("super-doc", 0, 0.5);
  const sources = nodes.filter((n) => n.starts.length);
  sources[0].onended?.();
  assert.equal(a.weaponBus!.gain.value, 0.55);
  sources[1].onended?.();
  assert.equal(a.weaponBus!.gain.value, 1);
});
test("priority steals a lesser voice from a full pool and pause clears oscillators too", () => {
  const { a, buffer, nodes } = rig();
  for (let i = 0; i < 32; i++) {
    const name = `super-test-${i}`;
    a.buffers.set(name, buffer(2));
    a.sample(name, 0, 0.2);
  }
  assert.equal(a.voices.size, 32);
  a.buffers.set("ui-warning", buffer(0.4));
  assert.equal(a.sample("ui-warning", 0, 0.2), true);
  assert.equal(a.voices.size, 32);
  assert.ok(nodes.filter((n) => n.starts.length)[0].stopTimes.length >= 2);
  a.stop();
  a.tone(440, 0.2, 0.05);
  a.roar();
  assert.ok(a.voices.size >= 3);
  const active = [...a.voices];
  a.setActive(false);
  assert.equal(a.voices.size, 0);
  assert.equal(a.voiceNames.size, 0);
  for (const n of active)
    assert.ok((n as unknown as { disconnects: number }).disconnects >= 1);
});
test("ambience follows biome time, is unique per biome, and stops on mute and game over", () => {
  const { a, buffer } = rig();
  const sim = new Simulation("ambience");
  for (const id of ["city", "suburb", "country", "forest", "ash"]) {
    a.buffers.set(`ambience-${id}`, buffer(12));
    a.cues[`ambience-${id}`] = {
      ...cueDefaults(`ambience-${id}`),
      variants: [],
    };
  }
  a.ambience(sim);
  a.ambience(sim);
  assert.equal(a.voices.size, 1);
  sim.tick = 70 * 60;
  a.ambience(sim);
  assert.equal(a.voices.size, 2);
  a.muted = true;
  assert.equal(a.voices.size, 0);
  a.muted = false;
  a.ambience(sim);
  assert.equal(a.voices.size, 2);
  sim.over = true;
  a.ambience(sim);
  assert.equal(a.voices.size, 0);
});
