import fs from "node:fs";
import { chromium } from "playwright";
import { OUTPUT, hash, writeJSON } from "./core.mjs";
const label = process.argv[2] || "current";
if (!["baseline", "current", "pilot"].includes(label))
  throw Error("Expected baseline, current, or pilot");
const out = `${OUTPUT}/${label}/captures`;
fs.mkdirSync(out, { recursive: true });
// Keep a runnable snapshot for future A/B captures; gameplay imports remain unchanged.
if (label === "baseline") {
  const snapshot = `${OUTPUT}/baseline/audio.ts`;
  fs.writeFileSync(
    `${OUTPUT}/baseline/audio-capture.ts`,
    fs
      .readFileSync(snapshot, "utf8")
      .replaceAll('from "./', 'from "/src/game/'),
  );
}
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  const captures = [];
  for (const scenario of [
    "opening",
    "stacked",
    "boss",
    "super",
    "transition",
    "creature-roar",
    "ui-ready",
  ]) {
    const allCandidates =
      label === "pilot"
        ? JSON.parse(fs.readFileSync(`${OUTPUT}/measurements.json`))
        : [];
    const pilot =
      label === "pilot"
        ? allCandidates.filter(
            (r) =>
              Number(r.id.match(/-r(\d+)-\d+$/)?.[1]) ===
              Math.max(
                ...allCandidates
                  .filter((m) => m.cue === r.cue)
                  .map((m) => Number(m.id.match(/-r(\d+)-\d+$/)?.[1]) || 0),
              ),
          )
        : [];
    const data = await page.evaluate(
      async ({ label, scenario, pilot }) => {
        const { AudioEngine } = await import(
          label === "baseline"
            ? "/artifacts/audio-quality/baseline/audio-capture.ts"
            : "/src/game/audio.ts"
        );
        const { Simulation } = await import("/src/game/simulation.ts");
        const { GUNS } = await import("/src/game/projectiles.ts");
        const duration = ["creature-roar", "ui-ready"].includes(scenario)
          ? 3
          : scenario === "transition"
            ? 25
            : 12;
        const context = new OfflineAudioContext(
          2,
          Math.ceil(44100 * duration),
          44100,
        );
        const Native = window.AudioContext;
        Object.defineProperty(context, "resume", {
          value: () => Promise.resolve(),
          configurable: true,
        });
        window.AudioContext = function () {
          return context;
        };
        const a = new AudioEngine();
        if (pilot.length) {
          const { cueDefaults } = await import("/src/game/audioManifest.ts");
          a.cues = { ...a.cues };
          for (const cue of new Set(pilot.map((r) => r.cue)))
            a.cues[cue] = {
              ...cueDefaults(cue),
              variants: pilot
                .filter((r) => r.cue === cue)
                .map((r) => "/" + r.file),
            };
        }
        const nativeFetch = window.fetch;
        if (label === "baseline")
          window.fetch = (url, options) =>
            nativeFetch(
              typeof url === "string" && url.startsWith("/assets/audio/")
                ? url.replace(
                    "/assets/audio/",
                    "/artifacts/audio-quality/baseline/audio/",
                  )
                : url,
              options,
            );
        a.init();
        window.AudioContext = Native;
        await a.loading;
        window.fetch = nativeFetch;
        delete context.resume;
        const sim = new Simulation(
          "audio-quality-fixed",
          "Classic",
          [0, 0, 0],
          ["mortal", "doc"],
        );
        sim.army = 160;
        sim.nextEncounter = 1e9;
        sim.nextBoss = 1e9;
        if (["stacked", "boss", "super"].includes(scenario))
          for (const gun of GUNS) sim.guns[gun] = 2;
        if (scenario === "boss") sim.spawnEnemy("Grave Marshal", 0, 22, true);
        else
          for (let i = 0; i < 20; i++)
            sim.spawnEnemy(
              i % 3 ? "Walker" : "Riot Guard",
              ((i % 3) - 1) * 2.8,
              12 + Math.floor(i / 3) * 4,
            );
        if (scenario === "transition") sim.tick = 59 * 60;
        let frame = 0;
        async function drive() {
          let suspended = context.suspend(0);
          while (frame < duration * 60 - 1) {
            await suspended;
            if (scenario === "creature-roar") {
              if (frame === 0) a.roar();
            } else if (scenario === "ui-ready") {
              sim.supers.charge = sim.supers.quota;
              a.updateSuperReady(sim);
            } else {
              if (scenario === "super" && frame === 120) {
                sim.supers.charge = sim.supers.quota;
                sim.supers.activate();
              }
              sim.update({ x: Math.sin(frame / 120) * 2, aim: 0 });
              if (frame % 120 === 0 && scenario !== "boss")
                sim.spawnEnemy("Riot Guard", 1, 24);
              a.update(sim.shots, sim.damageEvents, sim.kills);
              a.weapons(sim);
              a.telegraph(sim);
              a.supers(sim);
              a.ambience?.(sim);
            }
            frame++;
            if (frame < duration * 60 - 1)
              suspended = context.suspend(frame / 60);
            void context.resume();
          }
        }
        const driving = drive();
        const result = await context.startRendering();
        await driving;
        const pcm = new Int16Array(result.length * 2);
        for (let c = 0; c < 2; c++) {
          const samples = result.getChannelData(c);
          for (let i = 0; i < samples.length; i++)
            pcm[i * 2 + c] = Math.round(
              Math.max(-1, Math.min(1, samples[i])) * 32767,
            );
        }
        const bytes = new Uint8Array(pcm.buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return {
          pcm: btoa(binary),
          duration,
          loaded: a.buffers.size,
          peak: Math.max(
            ...[0, 1].map((c) =>
              result
                .getChannelData(c)
                .reduce((p, v) => Math.max(p, Math.abs(v)), 0),
            ),
          ),
        };
      },
      { label, scenario, pilot },
    );
    const pcm = Buffer.from(data.pcm, "base64");
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(2, 22);
    header.writeUInt32LE(44100, 24);
    header.writeUInt32LE(176400, 28);
    header.writeUInt16LE(4, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    const wav = Buffer.concat([header, pcm]);
    const file = `${out}/${scenario}.wav`;
    fs.writeFileSync(file, wav);
    captures.push({
      scenario,
      file,
      sha256: hash(wav),
      duration: data.duration,
      peak: data.peak,
      loaded: data.loaded,
    });
    console.log(
      `${label}/${scenario}: ${data.duration}s, ${data.loaded} buffers`,
    );
  }
  writeJSON(`${out}/index.json`, {
    sourceHash: hash(
      fs.readFileSync(
        label === "baseline"
          ? `${OUTPUT}/baseline/audio.ts`
          : "src/game/audio.ts",
      ),
    ),
    captures,
  });
} finally {
  await browser.close();
}
