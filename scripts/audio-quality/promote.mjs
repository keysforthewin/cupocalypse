// Run with `npx tsx scripts/audio-quality/promote.mjs selection.json`.
// selection.json maps cue IDs to reviewed candidate IDs. Validate the entire
// selection before copying anything; the manifest is replaced atomically last.
import fs from "node:fs";
import { cueDefaults } from "../../src/game/audioManifest.ts";
import {
  ROOT,
  OUTPUT,
  readJSON,
  writeJSON,
  validateAssessment,
  isAccepted,
  hash,
} from "./core.mjs";
if (!process.argv[2]) throw Error("A selection JSON file is required");
const selection = readJSON(process.argv[2]),
  review = readJSON(`${OUTPUT}/review.json`),
  scores = fs.existsSync(`${ROOT}/assessments.json`)
    ? readJSON(`${ROOT}/assessments.json`)
    : {},
  acceptance = fs.existsSync(`${ROOT}/acceptance.json`)
    ? readJSON(`${ROOT}/acceptance.json`)
    : null;
const currentMix =
  review.engineHash === hash(fs.readFileSync("src/game/audio.ts")) &&
  review.mixHash === hash(fs.readFileSync("src/game/audioManifest.ts")) &&
  review.approvedHash ===
    hash(fs.readFileSync("src/game/audioApproved.json")) &&
  hash(JSON.stringify(review.rubric)) ===
    hash(JSON.stringify(readJSON(`${ROOT}/rubric.json`)));
const staged = [];
for (const [cue, ids] of Object.entries(selection)) {
  if (
    !/^[a-z0-9-]+$/.test(cue) ||
    !Array.isArray(ids) ||
    !ids.length ||
    new Set(ids).size !== ids.length
  )
    throw Error("Invalid selection");
  const items = ids.map((id) =>
    review.items.find(
      (item) => item.id === id && item.cue === cue && item.kind === "candidate",
    ),
  );
  if (
    items.some(
      (item) =>
        !item ||
        !item.master ||
        !(
          isAccepted(acceptance, item) ||
          (currentMix &&
            hash(fs.readFileSync(item.file)) === item.auditionHash &&
            validateAssessment(scores[item.id], item, review.rubric).status ===
              "pass")
        ),
    )
  )
    throw Error(
      `${cue}: every selected take needs explicit user acceptance or a current passing listening score`,
    );
  if (
    ["weapons", "impacts", "creatures"].includes(items[0].family) &&
    items.length < 3
  )
    throw Error(`${cue}: repeated combat cues require three reviewed variants`);
  for (const item of items)
    if (hash(fs.readFileSync(item.master)) !== item.metrics.sha256)
      throw Error(`${item.id}: master changed`);
  staged.push({ cue, items });
}
if (!staged.length) throw Error("Empty selection");
const manifest = readJSON("src/game/audioApproved.json");
fs.mkdirSync("public/assets/audio/v2", { recursive: true });
for (const { cue, items } of staged) {
  const variants = [];
  for (const item of items) {
    const file = `public/assets/audio/v2/${item.id}.wav`;
    fs.copyFileSync(item.master, file);
    variants.push("/" + file.slice("public/".length));
  }
  manifest[cue] = { ...cueDefaults(cue), variants };
}
writeJSON(`${ROOT}/last-promotion.json`, {
  selection,
  reviewHash: hash(JSON.stringify(review)),
  acceptanceHash: acceptance ? hash(JSON.stringify(acceptance)) : null,
  promotedAt: new Date().toISOString(),
  note: "Recapture gameplay and obtain final listening scores for the newly installed mix.",
});
writeJSON("src/game/audioApproved.json", manifest);
console.log(
  `Installed ${staged.length} reviewed cues. Final mix review remains required.`,
);
