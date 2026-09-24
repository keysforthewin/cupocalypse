// Prepare a concrete correction batch from listening observations; never invent
// scores or submit paid requests as a side effect of inspecting a report.
import fs from "node:fs";
import {
  ROOT,
  OUTPUT,
  readJSON,
  writeJSON,
  validateAssessment,
} from "./core.mjs";
const review = readJSON(`${OUTPUT}/review.json`),
  scores = fs.existsSync(`${ROOT}/assessments.json`)
    ? readJSON(`${ROOT}/assessments.json`)
    : {};
const cues = readJSON("scripts/audio-quality/pilot.json"),
  batch = [];
for (const cue of cues) {
  const candidates = review.items.filter(
    (i) => i.cue === cue.id && i.kind === "candidate",
  );
  if (
    candidates.some(
      (i) =>
        validateAssessment(scores[i.id], i, review.rubric).status === "pass",
    )
  )
    continue;
  const rejected = candidates.filter(
    (i) => validateAssessment(scores[i.id], i, review.rubric).status === "fail",
  );
  if (!rejected.length) continue;
  const feedback = rejected
    .map((i) => scores[i.id].notes)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  batch.push({
    ...cue,
    prompt: `${cue.prompt.slice(0, 220)} Correction from listening: ${feedback.slice(0, 100)}`,
    feedbackSource: rejected.map((i) => ({
      id: i.id,
      evidenceHash: i.evidenceHash,
      notes: scores[i.id].notes,
    })),
  });
}
if (!batch.length)
  throw Error(
    "No reviewed failures need a correction batch; await listening instead of generating blindly",
  );
writeJSON(`${ROOT}/correction-batch.json`, batch);
console.log(
  `Prepared ${batch.length} corrections. Generate with a new rN revision; inspect full feedbackSource before submission.`,
);
