import { SUPER_IDS, SUPERS, type SuperId } from "./superWeapons";
import { GUNS } from "./projectiles";
import { BOOSTS } from "./types";
import { NEW_BOSSES, bossDefinition, isNewBoss } from "./bosses";
import { effectRandom } from "./deaths";
import type { Effect } from "./types";
import type { Simulation } from "./simulation";
export class AudioEngine {
  ctx: AudioContext | null = null;
  private isMuted = false;
  bus: GainNode | null = null;
  weaponBus: GainNode | null = null;
  buffers = new Map<string, AudioBuffer>();
  loading: Promise<void> | null = null;
  voices = new Set<AudioBufferSourceNode>();
  voiceNames = new Map<AudioBufferSourceNode, string>();
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
  stop() {
    this.stopSuperReady();
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    this.voiceNames.clear();
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
  async loadSamples() {
    if (!this.ctx) return;
    await Promise.all(
      [
        ...NEW_BOSSES.flatMap((k) =>
          ["entrance", "windup", "attack", "impact", "phase", "death"].map(
            (event) => `boss-${bossDefinition(k).id}-${event}`,
          ),
        ),
        ...SUPER_IDS.map((id) => `super-${id}`),
        "pulse",
        "seeker",
        "helix",
        "scatter",
        "cursor",
        "mortar",
        "impact",
        "detonate",
        ...GUNS.slice(5),
        ...GUNS.slice(5).map((k) => `impact-${k}`),
        ...BOOSTS.slice(4).map((k) => `pickup-${k}`),
      ].map(async (name) => {
        try {
          const legacy = [
            "pulse",
            "seeker",
            "helix",
            "scatter",
            "cursor",
            "mortar",
            "impact",
            "detonate",
          ].includes(name);
          const response = await fetch(
            name.startsWith("boss-")
              ? `/assets/audio/bosses/${name.slice(5)}.ogg`
              : `/assets/audio/${name}.${legacy ? "mp3" : "wav"}`,
          );
          if (!response.ok) throw Error("Audio asset missing");
          const buffer = await this.ctx!.decodeAudioData(
            await response.arrayBuffer(),
          );
          this.buffers.set(name, buffer);
        } catch {
          console.warn(`Sound unavailable: ${name}`);
        }
      }),
    );
  }
  sample(name: string, x: number, volume: number, pitch = 1) {
    const ctx = this.ctx,
      buffer = this.buffers.get(name);
    const bossSound = name.startsWith("boss-");
    const priority = name.startsWith("super-") || bossSound;
    if (
      !ctx ||
      !buffer ||
      this.muted ||
      !this.active ||
      this.voices.size >= (priority ? 22 : 16) ||
      [...this.voiceNames.values()].filter((value) => value === name).length >=
        2
    )
      return;
    const now = ctx.currentTime,
      interval =
        name === "pulse"
          ? 0.16
          : name === "impact"
            ? 0.12
            : name === "detonate"
              ? 0.2
              : 0.15;
    if (now - (this.lastPlayed.get(name) ?? -100) < interval) return;
    this.lastPlayed.set(name, now);
    const source = ctx.createBufferSource(),
      gain = ctx.createGain(),
      pan = ctx.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    const duration = Math.min(
      buffer.duration / pitch,
      (
        {
          pulse: 0.24,
          impact: 0.28,
          scatter: 0.45,
          helix: 0.5,
          seeker: 0.7,
          cursor: 0.7,
          mortar: 0.85,
          detonate: 1.65,
        } as Record<string, number>
      )[name] ?? (bossSound ? buffer.duration / pitch : priority ? 2.4 : 1),
    );
    gain.gain.setValueAtTime(volume, now);
    gain.gain.setValueAtTime(volume, now + duration * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    pan.pan.value = Math.max(-0.7, Math.min(0.7, x / 7));
    source.connect(gain);
    gain.connect(pan);
    pan.connect(bossSound ? this.bus! : (this.weaponBus ?? this.bus!));
    if (bossSound && this.weaponBus) {
      this.weaponBus.gain.cancelScheduledValues(now);
      this.weaponBus.gain.setTargetAtTime(0.45, now, 0.04);
      this.weaponBus.gain.setTargetAtTime(
        1,
        now + Math.min(duration, 2.5),
        0.25,
      );
    }
    this.voices.add(source);
    this.voiceNames.set(source, name);
    source.onended = () => {
      this.voices.delete(source);
      this.voiceNames.delete(source);
      source.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
    source.start();
    source.stop(now + duration);
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
        else this.tone(680, 0.22, 0.05);
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
  stopSuperReady() {
    if (!this.superReadySource) return;
    this.superReadySource.stop();
    this.superReadySource.disconnect();
    this.superReadySource = null;
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
    if (!this.superReadyBuffer) {
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
    source.buffer = this.superReadyBuffer;
    source.loop = true;
    source.connect(this.bus);
    this.superReadySource = source;
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
          this.tone(240 + e.value * 740, 0.075, 0.023, "triangle");
        }
        const stage = Math.floor(e.value * 4),
          old = this.superMilestones.get(e.id) || 0;
        if (stage > old && stage < 4) {
          this.tone(300 + stage * 170, 0.2, 0.05, "sine");
          this.tone(450 + stage * 240, 0.25, 0.025, "triangle");
        }
        this.superMilestones.set(e.id, stage);
      }
      if (e.kind === "switch") this.tone(280, 0.065, 0.02, "triangle");
    }
  }
  async previewSuper(id: SuperId) {
    const previous = this.active;
    this.init();
    this.setActive(previous);
    await this.loading;
    if (this.muted || !this.ctx) return;
    const buffer = this.buffers.get(`super-${id}`);
    if (!buffer) return;
    this.stop();
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.4;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    this.voices.add(source);
    this.voiceNames.set(source, `preview-${id}`);
    source.onended = () => {
      this.voices.delete(source);
      this.voiceNames.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    source.stop(this.ctx.currentTime + buffer.duration);
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
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 5200;
      filter.Q.value = 0.5;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      this.bus.connect(filter);
      filter.connect(compressor);
      const limiter = this.ctx.createWaveShaper();
      limiter.curve = Float32Array.from(
        { length: 8193 },
        (_, i) => 0.89 * Math.tanh((i / 4096 - 1) / 0.89),
      );
      limiter.oversample = "4x";
      compressor.connect(limiter);
      limiter.connect(this.ctx.destination);
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
  ) {
    if (this.muted || !this.active || !this.ctx) return;
    const t = this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(20, freq * 0.3),
      t + duration,
    );
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.bus!);
    o.start(t);
    o.stop(t + duration);
  }
  // Rough, formant-filtered vocalization; no network or prerecorded assets.
  roar(boss = false) {
    if (this.muted || !this.active || !this.ctx) return;
    const ctx = this.ctx,
      t = ctx.currentTime,
      duration = boss ? 0.8 : 0.55;
    for (const [index, formant] of [480, 1150].entries()) {
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
      gain.connect(this.bus!);
      voice.start(t);
      voice.stop(t + duration);
    }
  }
  death(e: Effect) {
    if (this.muted || !this.active || !this.ctx) return;
    const ctx = this.ctx,
      t = ctx.currentTime;
    const heavy = e.style === "rupture" || e.style === "armor";
    const r = effectRandom(e.seed, 72);
    this.tone(
      heavy ? 42 + r * 22 : 74 + r * 42,
      heavy ? 0.32 : 0.1,
      heavy ? 0.045 : 0.016,
    );
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
    gain.connect(this.bus!);
    source.start(t);
    source.stop(t + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
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
        if (m.kind === "scream" || m.kind === "summon") this.roar(enemy.boss);
        else if (m.kind === "slam" || m.kind === "strike") {
          this.tone(48, 0.4, 0.1, "triangle");
          this.tone(115, 0.12, 0.045, "sawtooth");
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
    this.tone(freq, 0.38, 0.055, "triangle");
    this.tone(freq * 2.02, 0.17, 0.018, "sawtooth");
  }
  update(shots: number, hits: number, kills: number) {
    if (hits !== this.lastHit) this.tone(65, 0.2, 0.08, "square");
    this.lastShot = shots;
    this.lastHit = hits;
    this.lastKill = kills;
  }
}
export const audio = new AudioEngine();
