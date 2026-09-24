import fs from "node:fs";
import {
  ROOT,
  OUTPUT,
  readJSON,
  writeJSON,
  validateAssessment,
  isAccepted,
  hash,
} from "./core.mjs";
const review = readJSON(`${OUTPUT}/review.json`);
const staleMix =
  review.engineHash !== hash(fs.readFileSync("src/game/audio.ts")) ||
  review.mixHash !== hash(fs.readFileSync("src/game/audioManifest.ts")) ||
  review.approvedHash !==
    hash(fs.readFileSync("src/game/audioApproved.json")) ||
  hash(JSON.stringify(review.rubric)) !==
    hash(JSON.stringify(readJSON(`${ROOT}/rubric.json`)));
for (const item of review.items) {
  if (
    hash(fs.readFileSync(item.file)) !== item.auditionHash ||
    (item.master && hash(fs.readFileSync(item.master)) !== item.metrics.sha256)
  )
    throw Error(`${item.id}: audio changed since review preparation`);
}
const scores = fs.existsSync(`${ROOT}/assessments.json`)
  ? readJSON(`${ROOT}/assessments.json`)
  : {};
const acceptance = fs.existsSync(`${ROOT}/acceptance.json`)
  ? readJSON(`${ROOT}/acceptance.json`)
  : null;
const report = {
  phase: "pilot",
  status: "awaiting-listening",
  rubric: review.rubric.version,
  numericalQualityVerified: false,
  groups: [],
};
for (const cue of readJSON("scripts/audio-quality/pilot.json")) {
  const items = review.items.filter(
    (i) => i.cue === cue.id && i.kind === "candidate",
  );
  const evaluated = items.map((item) => ({
    id: item.id,
    evidenceHash: item.evidenceHash,
    ...(isAccepted(acceptance, item)
      ? { status: "user-accepted", score: null }
      : staleMix
        ? {
            status: "unreviewed",
            reason: "Mix changed; recapture for numerical assessment",
          }
        : validateAssessment(scores[item.id], item, review.rubric)),
  }));
  const passed = evaluated
    .filter((i) => i.status === "pass" || i.status === "user-accepted")
    .sort((a, b) => b.score - a.score);
  report.groups.push({
    cue: cue.id,
    status: passed.length
      ? passed.some((i) => i.status === "user-accepted")
        ? "user-accepted"
        : "pass"
      : "awaiting-listening-or-revision",
    selected: passed[0]?.id,
    retained: passed.map((i) => i.id),
    candidates: evaluated,
  });
}
if (report.groups.every((g) => g.status === "pass")) {
  report.status = "pilot-approved";
  report.numericalQualityVerified = true;
} else if (
  report.groups.every(
    (g) => g.status === "pass" || g.status === "user-accepted",
  )
)
  report.status = "pilot-accepted";
writeJSON(`${ROOT}/pilot-evaluation.json`, report);
console.log(JSON.stringify(report, null, 2));
if (!["pilot-approved", "pilot-accepted"].includes(report.status))
  process.exitCode = 1;
