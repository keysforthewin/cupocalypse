import { publicPath } from "./paths";
import { type SuperId } from "./superWeapons";
import { GUNS } from "./projectiles";
import { bossDefinition, isNewBoss } from "./bosses";
import { effectRandom } from "./deaths";
import type { Effect } from "./types";
import type { Simulation } from "./simulation";
import {
  AUDIO_CUES,
  cueDefaults,
  nextVariant,
  type AudioBus,
  type AudioCue,
} from "./audioManifest";
import { atmosphereAt } from "../render/biomes";

export class AudioEngine {
  ctx: AudioContext | null = null;
  private isMuted = false;
  bus: GainNode | null = null;
  weaponBus: GainNode | null = null;
  buffers = new Map<string, AudioBuffer>();
  loading: Promise<void> | null = null;
  voices = new Set<AudioScheduledSourceNode>();
  voiceNames = new Map<AudioScheduledSourceNode, string>();
  voicePriorities = new Map<AudioScheduledSourceNode, number>();
  private cleanup = new Map<AudioScheduledSourceNode, () => void>();
  private duckers = new Set<AudioScheduledSourceNode>();
  private lastVariants = new Map<string, number>();
  sampleVariants = new Map<string, AudioBuffer[]>();
  cues: Record<string, AudioCue> = AUDIO_CUES;
  buses = new Map<AudioBus, GainNode>();
  private previewBus: GainNode | null = null;
  output: AudioNode | null = null;
  private ambient = new Map<
    string,
    { source: AudioBufferSourceNode; gain: GainNode }
  >();
  private ambienceSim: Simulation | null = null;
  lastPlayed = new Map<string, number>();
  weaponSim: Simulation | null = null;
  lastWeaponEvent = 0;
  active = true;
  get muted() {
    return this.isMuted;
  }
  set muted(value: boolean) {
    this.isMuted = value;
    if (this.bus && this.ctx)
      this.bus.gain.setTargetAtTime(
        value || !this.active ? 0 : 0.72,
        this.ctx.currentTime,
        0.025,
      );
    if (value) this.stop();
  }
  private release(source: AudioScheduledSourceNode) {
    this.cleanup.get(source)?.();
  }
  private track(
    source: AudioScheduledSourceNode,
    name: string,
    priority: number,
    nodes: AudioNode[],
  ) {
    this.voices.add(source);
    this.voiceNames.set(source, name);
    this.voicePriorities.set(source, priority);
    this.cleanup.set(source, () => {
      this.cleanup.delete(source);
      this.voices.delete(source);
      this.voiceNames.delete(source);
      this.voicePriorities.delete(source);
      for (const node of [source, ...nodes]) node.disconnect();
      if (this.duckers.delete(source)) this.updateDucking();
    });
    source.onended = () => this.release(source);
  }
  private updateDucking() {
    if (!this.ctx) return;
    for (const [bus, depth] of [
      [this.weaponBus, 0.55],
      [this.buses.get("impacts"), 0.7],
      [this.buses.get("ambience"), 0.45],
    ] as const) {
      if (!bus) continue;
      const now = this.ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(
        this.duckers.size ? depth : 1,
        now,
        this.duckers.size ? 0.025 : 0.22,
      );
    }
  }
  private makeRoom(priority: number) {
    const limit = priority >= 4 ? 32 : 24;
    if (this.voices.size < limit) return true;
    const victim = [...this.voices].find(
      (source) =>
        (this.voicePriorities.get(source) ?? 0) < priority &&
        ![...this.ambient.values()].some((v) => v.source === source),
    );
    if (!victim) return false;
    try {
      victim.stop();
    } catch {}
    this.release(victim);
    return true;
  }
  stop() {
    this.stopSuperReady();
    for (const voice of [...this.voices]) {
      try {
        voice.stop();
      } catch {}
      this.release(voice);
    }
    this.voices.clear();
    this.voiceNames.clear();
    this.voicePriorities.clear();
    this.ambient.clear();
    this.duckers.clear();
    this.lastPlayed.clear();
    this.updateDucking();
  }
  setActive(active: boolean) {
    this.active = active;
    if (this.bus && this.ctx)
      this.bus.gain.setTargetAtTime(
        active && !this.muted ? 0.72 : 0,
        this.ctx.currentTime,
        0.025,
      );
    if (!active) this.stop();
  }
  private prefetched = new Map<string, Promise<ArrayBuffer | null>>();
  /** Every sample file the cue catalogue can play. */
  sampleUrls() {
    return [...new Set(Object.values(this.cues).flatMap((c) => c.variants))];
  }
  /**
   * Hands over bytes downloaded ahead of time (the loading screen fetches them
   * before a user gesture allows an AudioContext), so init only decodes.
   */
  prefetch(url: string, bytes: Promise<ArrayBuffer | null>) {
    this.prefetched.set(url, bytes);
  }
  private async sampleBytes(url: string) {
    const early = this.prefetched.get(url);
    // decodeAudioData detaches the buffer, so each download is used once.
    this.prefetched.delete(url);
    const bytes = early && (await early);
    if (bytes) return bytes;
    const response = await fetch(publicPath(url));
    if (!response.ok) throw Error("Audio asset missing");
    return response.arrayBuffer();
  }
  async loadSamples() {
    if (!this.ctx) return;
    await Promise.all(
      Object.entries(this.cues).map(async ([name, cue]) => {
        const loaded = await Promise.all(
          cue.variants.map(async (url) => {
            try {
              return await this.ctx!.decodeAudioData(
                await this.sampleBytes(url),
              );
            } catch {
              console.warn(`Sound unavailable: ${name}`);
              return null;
            }
          }),
        );
        const buffers = loaded.filter((b): b is AudioBuffer => b !== null);
        if (buffers.length) {
          this.sampleVariants.set(name, buffers);
          this.buffers.set(name, buffers[0]);
        }
      }),
    );
  }
  private chooseBuffer(name: string) {
    const variants =
      this.sampleVariants.get(name) ??
      (this.buffers.has(name) ? [this.buffers.get(name)!] : []);
    if (!variants.length) return null;
    const index = nextVariant(
      variants.length,
      this.lastVariants.get(name),
      Math.random(),
    );
    this.lastVariants.set(name, index);
    return variants[index];
  }
  sample(name: string, x: number, volume: number, pitch = 1, preview = false) {
    const ctx = this.ctx,
      cue = this.cues[name] ?? { ...cueDefaults(name), variants: [] };
    const variants =
      this.sampleVariants.get(name) ??
      (this.buffers.has(name) ? [this.buffers.get(name)!] : []);
    if (
      !ctx ||
      !variants.length ||
      this.muted ||
      (!this.active && !preview) ||
      !Number.isFinite(pitch) ||
      pitch <= 0
    )
      return false;
    const now = ctx.currentTime;
    if (
      !preview &&
      (now - (this.lastPlayed.get(name) ?? -100) < cue.cooldown ||
        [...this.voiceNames.values()].filter((value) => value === name)
          .length >= cue.maxVoices)
    )
      return false;
    if (!this.makeRoom(cue.priority)) return false;
    const buffer = this.chooseBuffer(name)!;
    const start = Math.max(0, Math.min(cue.start ?? 0, buffer.duration));
    const end = Math.min(cue.end ?? buffer.duration, buffer.duration);
    const duration = (end - start) / pitch;
    if (duration <= 0) return false;
    this.lastPlayed.set(name, now);
    const source = ctx.createBufferSource(),
      gain = ctx.createGain(),
      pan = ctx.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    const level = Math.max(0, Math.min(1, volume * cue.gain));
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      level,
      now + Math.min(0.0015, duration / 4),
    );
    gain.gain.setValueAtTime(
      level,
      now + Math.max(duration * 0.5, duration - 0.015),
    );
    gain.gain.linearRampToValueAtTime(0, now + duration);
    pan.pan.value = Math.max(-0.8, Math.min(0.8, x / 7));
    source.connect(gain);
    gain.connect(pan);
    pan.connect(
      preview ? this.previewBus! : (this.buses.get(cue.bus) ?? this.bus!),
    );
    this.track(source, name, cue.priority, [gain, pan]);
    if (!preview && cue.priority >= 4) {
      this.duckers.add(source);
      this.updateDucking();
    }
    source.start(now, start, end - start);
    source.stop(now + duration);
    return true;
  }
  feedback(
    name: string,
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType = "triangle",
  ) {
    if (this.buffers.has(name)) this.sample(name, 0, volume);
    else this.tone(freq, duration, volume, type);
  }
  ambience(sim: Simulation) {
    if (this.ambienceSim !== sim) {
      for (const { source } of this.ambient.values()) {
        try {
          source.stop();
        } catch {}
        this.release(source);
      }
      this.ambient.clear();
      this.ambienceSim = sim;
    }
    if (!this.ctx || !this.active || this.muted || sim.over) {
      for (const { source } of this.ambient.values()) {
        try {
          source.stop();
        } catch {}
        this.release(source);
      }
      this.ambient.clear();
      return;
    }
    const state = atmosphereAt(sim.seed, sim.time);
    const weights =
      state.from === state.to
        ? { [state.to]: 1 }
        : {
            [state.from]: Math.cos((state.blend * Math.PI) / 2),
            [state.to]: Math.sin((state.blend * Math.PI) / 2),
          };
    for (const [id, voice] of this.ambient)
      if (!(id in weights) || weights[id] < 0.001) {
        voice.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        voice.source.stop(this.ctx.currentTime + 0.4);
        this.ambient.delete(id);
      }
    for (const [id, weight] of Object.entries(weights)) {
      if (weight < 0.001) continue;
      const name = `ambience-${id}`;
      let voice = this.ambient.get(id);
      if (!voice) {
        const buffer = this.chooseBuffer(name);
        if (!buffer) continue;
        const source = this.ctx.createBufferSource(),
          gain = this.ctx.createGain();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = this.cues[name]?.start ?? 0;
        source.loopEnd = this.cues[name]?.end ?? buffer.duration;
        source.connect(gain);
        gain.connect(this.buses.get("ambience") ?? this.bus!);
        gain.gain.value = 0;
        this.track(source, name, 0, [gain]);
        source.start();
        voice = { source, gain };
        this.ambient.set(id, voice);
      }
      voice.gain.gain.setTargetAtTime(
        weight * 0.22 * (this.cues[name]?.gain ?? 1),
        this.ctx.currentTime,
        0.15,
      );
    }
  }
  weapons(sim: Simulation) {
    if (this.weaponSim !== sim) {
      this.weaponSim = sim;
      this.lastWeaponEvent = 0;
      this.lastPlayed.clear();
      this.stop();
    }
    for (const event of sim.weaponEvents) {
      if (event.serial <= this.lastWeaponEvent) continue;
      this.lastWeaponEvent = event.serial;
      if (event.pickup) {
        if (this.buffers.has(`pickup-${event.kind}`))
          this.sample(`pickup-${event.kind}`, event.x, 0.5);
        else this.feedback("ui-pickup", 680, 0.22, 0.05);
        continue;
      }
      const expanded = (GUNS.slice(5) as readonly string[]).includes(
        event.kind,
      );
      const heavy = event.kind === "seeker" || event.kind === "mortar";
      this.sample(
        event.impact
          ? expanded
            ? `impact-${event.kind}`
            : heavy
              ? "detonate"
              : "impact"
          : event.kind,
        event.x,
        event.impact
          ? heavy
            ? 0.46
            : 0.13
          : event.kind === "pulse"
            ? 0.24
            : 0.42,
        0.94 + (event.serial % 7) * 0.015,
      );
    }
  }

  superSim: Simulation | null = null;
  lastSuperCast = 0;
  lastSuperEvent = 0;
  lastChargeSound = -100;
  superMilestones = new Map<SuperId, number>();
  superReadySource: AudioBufferSourceNode | null = null;
  private superReadyBuffer: AudioBuffer | null = null;
  private readyVariants = new WeakMap<AudioBuffer, AudioBuffer>();
  stopSuperReady() {
    if (!this.superReadySource) return;
    const source = this.superReadySource;
    this.superReadySource = null;
    source.stop();
    this.release(source);
    source.disconnect();
  }
  updateSuperReady(sim: Simulation) {
    const ctx = this.ctx;
    if (
      !ctx ||
      !this.bus ||
      this.muted ||
      !this.active ||
      sim.over ||
      !sim.supers.readySlots.length
    ) {
      this.stopSuperReady();
      return;
    }
    if (this.superReadySource) return;
    const cue = this.chooseBuffer("ui-ready");
    let recorded: AudioBuffer | undefined;
    if (cue) {
      recorded = this.readyVariants.get(cue);
      if (!recorded) {
        recorded = ctx.createBuffer(
          cue.numberOfChannels,
          Math.ceil(ctx.sampleRate * Math.max(3, cue.duration + 0.1)),
          ctx.sampleRate,
        );
        for (let c = 0; c < cue.numberOfChannels; c++)
          recorded.getChannelData(c).set(cue.getChannelData(c));
        this.readyVariants.set(cue, recorded);
      }
    }
    if (!recorded && !this.superReadyBuffer) {
      // A repeating three-note signal, with silence between phrases. A dedicated
      // source keeps the alert audible even when the weapon voice pool is full.
      const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * 1.8),
        ctx.sampleRate,
      );
      const data = buffer.getChannelData(0);
      for (const [note, frequency] of [660, 880, 1320].entries()) {
        const start = Math.round(note * 0.19 * ctx.sampleRate);
        const duration = 0.24;
        for (let i = 0; i < duration * ctx.sampleRate; i++) {
          const t = i / ctx.sampleRate;
          const envelope =
            Math.min(1, t / 0.012) * Math.pow(1 - t / duration, 2);
          data[start + i] +=
            0.16 * envelope * Math.sin(2 * Math.PI * frequency * t);
        }
      }
      this.superReadyBuffer = buffer;
    }
    const source = ctx.createBufferSource();
    source.buffer = recorded ?? this.superReadyBuffer;
    source.loop = !recorded;
    source.connect(this.buses.get("ui") ?? this.bus);
    this.superReadySource = source;
    if (recorded)
      source.onended = () => {
        if (this.superReadySource !== source) return;
        this.superReadySource = null;
        source.disconnect();
        this.updateSuperReady(sim);
      };
    source.start();
  }
  supers(sim: Simulation) {
    if (this.superSim !== sim) {
      this.stopSuperReady();
      this.superSim = sim;
      this.lastSuperCast = 0;
      this.lastSuperEvent = 0;
      this.lastChargeSound = -100;
      this.superMilestones.clear();
    }
    this.updateSuperReady(sim);
    for (const cast of sim.supers.archive.values())
      if (cast.serial > this.lastSuperCast) {
        this.lastSuperCast = cast.serial;
        this.superMilestones.set(cast.id, 0);
        this.sample(`super-${cast.id}`, sim.x, 0.72);
      }
    const pending = sim.supers.events.filter(
      (e) => e.serial > this.lastSuperEvent,
    );
    for (const e of pending) {
      this.lastSuperEvent = e.serial;
      if (e.kind === "charge") {
        if (sim.tick - this.lastChargeSound >= 5) {
          this.lastChargeSound = sim.tick;
          this.feedback(
            "ui-charge",
            240 + e.value * 740,
            0.075,
            0.023,
            "triangle",
          );
        }
        const stage = Math.floor(e.value * 4),
          old = this.superMilestones.get(e.id) || 0;
        if (stage > old && stage < 4) {
          this.feedback("ui-milestone", 300 + stage * 170, 0.2, 0.05, "sine");
          if (!this.buffers.has("ui-milestone"))
            this.tone(450 + stage * 240, 0.25, 0.025, "triangle");
        }
        this.superMilestones.set(e.id, stage);
      }
      if (e.kind === "switch")
        this.feedback("ui-switch", 280, 0.065, 0.02, "triangle");
    }
  }
  async previewSuper(id: SuperId) {
    const previous = this.active;
    this.init();
    this.setActive(previous);
    await this.loading;
    if (this.muted || !this.ctx) return;
    this.stop();
    this.sample(`super-${id}`, 0, 0.4, 1, true);
  }

  lastShot = 0;
  lastHit = 0;
  lastKill = 0;
  lastWarning = 0;
  simulation: Simulation | null = null;
  heard = new Set<string>();
  lastCrowd = -300;
  noise: AudioBuffer | null = null;
  init() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.bus = this.ctx.createGain();
      this.weaponBus = this.ctx.createGain();
      this.weaponBus.connect(this.bus);
      this.bus.gain.value = this.muted ? 0 : 0.72;
      for (const name of [
        "weapons",
        "impacts",
        "bosses",
        "ui",
        "ambience",
      ] as AudioBus[]) {
        const gain =
          name === "weapons" ? this.weaponBus : this.ctx.createGain();
        if (name !== "weapons") gain.connect(this.bus);
        this.buses.set(name, gain);
      }
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 6;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.14;
      this.bus.connect(compressor);
      this.previewBus = this.ctx.createGain();
      this.previewBus.gain.value = 0.72;
      this.previewBus.connect(compressor);
      const limiter = this.ctx.createWaveShaper();
      limiter.curve = Float32Array.from(
        { length: 8193 },
        (_, i) => 0.82 * Math.tanh((i / 4096 - 1) / 0.82),
      );
      limiter.oversample = "4x";
      compressor.connect(limiter);
      limiter.connect(this.ctx.destination);
      this.output = limiter;
      this.loading = this.loadSamples();
    }
    this.setActive(true);
    void this.ctx.resume();
  }
  tone(
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType = "triangle",
    bus: AudioBus = "ui",
  ) {
    const priority = bus === "ui" ? 5 : 2;
    if (this.muted || !this.active || !this.ctx || !this.makeRoom(priority))
      return;
    const t = this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(20, freq * 0.3),
      t + duration,
    );
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + Math.min(0.004, duration / 4));
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.buses.get(bus) ?? this.bus!);
    this.track(o, `procedural-${bus}`, priority, [g]);
    o.start(t);
    o.stop(t + duration);
  }
  // Rough, formant-filtered vocalization; no network or prerecorded assets.
  roar(boss = false) {
    if (this.muted || !this.active || !this.ctx) return;
    if (this.buffers.has("creature-roar")) {
      this.sample("creature-roar", 0, boss ? 0.22 : 0.12);
      return;
    }
    const ctx = this.ctx,
      t = ctx.currentTime,
      duration = boss ? 0.8 : 0.55;
    for (const [index, formant] of [480, 1150].entries()) {
      if (!this.makeRoom(2)) break;
      const voice = ctx.createOscillator(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      voice.type = "sawtooth";
      voice.frequency.setValueAtTime(boss ? 58 : 125, t);
      voice.frequency.linearRampToValueAtTime(
        boss ? 88 : 195,
        t + duration * 0.25,
      );
      voice.frequency.exponentialRampToValueAtTime(
        boss ? 40 : 75,
        t + duration,
      );
      voice.detune.value = index * 19;
      filter.type = "bandpass";
      filter.frequency.value = formant;
      filter.Q.value = 3;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(boss ? 0.065 : 0.035, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      voice.connect(filter);
      filter.connect(gain);
      gain.connect(this.buses.get("impacts") ?? this.bus!);
      this.track(voice, "procedural-roar", 2, [filter, gain]);
      voice.start(t);
      voice.stop(t + duration);
    }
  }
  death(e: Effect) {
    if (this.muted || !this.active || !this.ctx || !this.makeRoom(2)) return;
    if (this.buffers.has(`death-${e.style}`)) {
      this.sample(`death-${e.style}`, 0, 0.12);
      return;
    }
    const ctx = this.ctx,
      t = ctx.currentTime;
    const heavy = e.style === "rupture" || e.style === "armor";
    const r = effectRandom(e.seed, 72);
    this.tone(
      heavy ? 42 + r * 22 : 74 + r * 42,
      heavy ? 0.32 : 0.1,
      heavy ? 0.045 : 0.016,
      "triangle",
      "impacts",
    );
    if (!this.makeRoom(2)) return;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = effectRandom(9167, i) * 2 - 1;
    }
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = this.noise;
    source.playbackRate.value = 0.75 + r * 0.5;
    filter.type = "bandpass";
    filter.frequency.value =
      e.style === "armor"
        ? 2400
        : e.style === "acid"
          ? 1400
          : heavy
            ? 320
            : 780;
    filter.Q.value = 0.7;
    const duration = heavy ? 0.28 : 0.1 + r * 0.09;
    gain.gain.setValueAtTime(heavy ? 0.07 : 0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.buses.get("impacts") ?? this.bus!);
    this.track(source, "procedural-death", 2, [filter, gain]);
    source.start(t);
    source.stop(t + duration);
  }
  telegraph(sim: Simulation) {
    if (this.simulation !== sim) {
      this.simulation = sim;
      this.heard.clear();
      this.lastWarning = 0;
      this.lastCrowd = -300;
    }
    let deathSounds = 0;
    for (const e of sim.effects) {
      const key = `death:${e.seed}`;
      if (
        e.active &&
        e.kind === "corpse" &&
        e.age < 0.12 &&
        !this.heard.has(key)
      ) {
        this.heard.add(key);
        if (deathSounds++ < 3) this.death(e);
      }
    }
    for (const enemy of [...sim.enemies, ...sim.bossRemains]) {
      if (!isNewBoss(enemy.kind)) continue;
      const d = bossDefinition(enemy.kind);
      const play = (event: string, eventTick: number, volume = 0.95) => {
        const key = `boss:${enemy.id}:${event}:${eventTick}`;
        if (
          sim.tick < eventTick ||
          sim.tick > eventTick + 8 ||
          this.heard.has(key)
        )
          return;
        this.heard.add(key);
        this.sample(`boss-${d.id}-${event}`, enemy.x, volume);
      };
      if (enemy.age < 0.15 && !enemy.dead)
        play("entrance", sim.tick - Math.round(enemy.age * 60));
      if (enemy.dead) play("death", enemy.deathTick ?? sim.tick);
      else {
        if (enemy.phase > 1) play("phase", enemy.phaseTick);
        for (const motion of enemy.motions) {
          play("windup", motion.start, 0.65);
          play("attack", motion.release ?? motion.strike);
          if (motion.release !== undefined) play("impact", motion.strike);
        }
      }
    }
    for (const enemy of sim.enemies)
      for (const m of enemy.motions) {
        if (isNewBoss(enemy.kind)) continue;
        const key = `${enemy.id}:${m.kind}:${m.strike}`;
        if (
          sim.tick < m.strike ||
          sim.tick > m.strike + 6 ||
          this.heard.has(key)
        )
          continue;
        this.heard.add(key);
        const legacyBoss = enemy.boss
          ? `boss-${enemy.kind.toLowerCase().replaceAll(" ", "-")}-attack`
          : "creature-strike";
        if (this.buffers.has(legacyBoss)) {
          this.sample(legacyBoss, enemy.x, enemy.boss ? 0.6 : 0.15);
          continue;
        }
        if (m.kind === "scream" || m.kind === "summon") this.roar(enemy.boss);
        else if (m.kind === "slam" || m.kind === "strike") {
          this.tone(48, 0.4, 0.1, "triangle", "impacts");
          this.tone(115, 0.12, 0.045, "sawtooth", "impacts");
        }
      }
    if (
      sim.tick - this.lastCrowd > 270 &&
      sim.enemies.some((e) => !e.boss && e.z < 24)
    ) {
      this.lastCrowd = sim.tick;
      this.roar();
    }
    if (this.heard.size > 256) this.heard.clear();
    const h = sim.hazards.find(
      (h) =>
        h.warnAt <= sim.tick &&
        h.strikeAt > sim.tick &&
        h.id > this.lastWarning,
    );
    if (!h) return;
    this.lastWarning = h.id;
    const freq =
      h.kind === "slam"
        ? 62
        : h.kind === "pool"
          ? 180
          : h.kind === "strike"
            ? 340
            : 260;
    this.feedback(`ui-warning-${h.kind}`, freq, 0.38, 0.055, "triangle");
    if (!this.buffers.has(`ui-warning-${h.kind}`))
      this.tone(freq * 2.02, 0.17, 0.018, "sawtooth");
  }
  update(shots: number, hits: number, kills: number) {
    if (hits !== this.lastHit)
      this.feedback("ui-damage", 65, 0.2, 0.08, "square");
    this.lastShot = shots;
    this.lastHit = hits;
    this.lastKill = kills;
  }
}
export const audio = new AudioEngine();
