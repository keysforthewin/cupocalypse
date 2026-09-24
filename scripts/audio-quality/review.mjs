import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { ROOT, OUTPUT, readJSON, writeJSON, hash, isAccepted } from "./core.mjs";
const rubric = readJSON(`${ROOT}/rubric.json`),
  cues = readJSON("scripts/audio-quality/pilot.json");
const measured = readJSON(`${OUTPUT}/measurements.json`);
const baselineMeasurements = readJSON(`${OUTPUT}/baseline-measurements.json`);
const engineHash = hash(fs.readFileSync("src/game/audio.ts"));
const mixHash = hash(fs.readFileSync("src/game/audioManifest.ts"));
const items = [];
const normalize = (input, output) => {
  // Comparison normalization only; never use these files as shipping masters.
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    input,
    "-af",
    "loudnorm=I=-23:TP=-2:LRA=11",
    "-ar",
    "44100",
    "-c:a",
    "pcm_s16le",
    output,
  ]);
};
fs.mkdirSync(`${OUTPUT}/audition`, { recursive: true });
for (const cue of cues) {
  for (const record of measured.filter(
    (r) =>
      r.cue === cue.id &&
      Number(r.id.match(/-r(\d+)-\d+$/)?.[1]) ===
        Math.max(
          ...measured
            .filter((m) => m.cue === cue.id)
            .map((m) => Number(m.id.match(/-r(\d+)-\d+$/)?.[1]) || 0),
        ),
  )) {
    const file = `${OUTPUT}/audition/${record.id}.wav`;
    normalize(record.file, file);
    items.push({
      id: record.id,
      cue: cue.id,
      label: cue.label,
      family: cue.family,
      kind: "candidate",
      file,
      master: record.file,
      metrics: record.metrics,
      technicalPassed: record.metrics.passed,
      evidenceHash: hash(
        JSON.stringify({
          audio: record.metrics.sha256,
          engineHash,
          mixHash,
          rubric,
        }),
      ),
    });
  }
  const baseline = cue.baseline
    ? `${OUTPUT}/baseline/audio/${cue.baseline}`
    : `${OUTPUT}/baseline/captures/${cue.id}.wav`;
  if (fs.existsSync(baseline)) {
    const file = `${OUTPUT}/audition/${cue.id}-baseline.wav`;
    normalize(baseline, file);
    const metrics = baselineMeasurements.find(
      (r) => r.file === `public/assets/audio/${cue.baseline}`,
    )?.metrics;
    items.push({
      id: `${cue.id}-baseline`,
      cue: cue.id,
      label: cue.label,
      family: cue.family,
      kind: "baseline",
      file,
      metrics,
      technicalPassed: metrics?.passed ?? false,
      evidenceHash: hash(fs.readFileSync(baseline)),
    });
  }
}
for (const label of ["baseline", "current", "pilot"]) {
  const index = `${OUTPUT}/${label}/captures/index.json`;
  if (!fs.existsSync(index)) continue;
  if (label !== "baseline" && readJSON(index).sourceHash !== engineHash)
    throw Error(`${label} captures are stale; recapture before review`);
  for (const capture of readJSON(index).captures.filter((c) =>
    rubric.scenes.includes(c.scenario),
  )) {
    const id = `mix-${label}-${capture.scenario}`,
      file = `${OUTPUT}/audition/${id}.wav`;
    normalize(capture.file, file);
    items.push({
      id,
      cue: `mix-${capture.scenario}`,
      label: `Gameplay: ${capture.scenario}`,
      family: "mix",
      scene: capture.scenario,
      kind: label === "baseline" ? "baseline" : "candidate",
      file,
      technicalPassed: false,
      evidenceHash: hash(
        JSON.stringify({ capture, engineHash, mixHash, rubric }),
      ),
      note: `${label} mix. Actual simulation events rendered through Web Audio. Mix technical gate requires browser validation.`,
    });
  }
}
const approvedHash = hash(fs.readFileSync("src/game/audioApproved.json"));
const acceptance=fs.existsSync(`${ROOT}/acceptance.json`)?readJSON(`${ROOT}/acceptance.json`):null;
for (const item of items) {
  item.auditionHash = hash(fs.readFileSync(item.file));
  item.accepted = isAccepted(acceptance,item);
}
writeJSON(`${OUTPUT}/review.json`, {
  rubric,
  engineHash,
  mixHash,
  approvedHash,
  items,
});
console.log(
  `Prepared ${items.length} blind audition entries. No listening scores assigned.`,
);
