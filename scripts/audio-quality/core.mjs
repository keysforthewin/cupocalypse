import fs from "node:fs";
import crypto from "node:crypto";

export const ROOT = "assets/audio-quality";
export const OUTPUT = "artifacts/audio-quality";
export const MODEL = "fal-ai/elevenlabs/sound-effects/v2";
export const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
export function writeJSON(file, value) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(`${file}.tmp`, file);
}
export function reserveCost(ledger, seconds, price, stage = "pilot") {
  if (
    !Number.isFinite(ledger.capUSD) ||
    ledger.capUSD <= 0 ||
    Object.values(ledger.jobs).some(
      (job) => !Number.isFinite(job.reserveUSD) || job.reserveUSD < 0,
    )
  )
    throw Error("Invalid generation budget ledger");
  if (
    price.currency !== "USD" ||
    price.unit !== "seconds" ||
    !Number.isFinite(price.unit_price) ||
    price.unit_price <= 0
  )
    throw Error("Unrecognized provider pricing; do not submit");
  if (!Number.isFinite(seconds) || seconds < 0.5 || seconds > 22)
    throw Error("Invalid duration");
  // Reserve 25% headroom, rounded upward to whole cents, minimum one cent.
  const reserve = Math.max(
    0.01,
    Math.ceil(seconds * price.unit_price * 1.25 * 100) / 100,
  );
  const spent = Object.values(ledger.jobs).reduce(
    (sum, job) => sum + job.reserveUSD,
    0,
  );
  const stageLimit = { pilot: 20, coverage: 80, correction: 100 }[stage];
  if (
    !stageLimit ||
    !Number.isFinite(spent) ||
    spent + reserve > Math.min(100, ledger.capUSD, stageLimit) + 1e-8
  )
    throw Error("Generation budget reached");
  return reserve;
}
export function validateAssessment(assessment, item, rubric) {
  if (
    !assessment ||
    assessment.evidenceHash !== item.evidenceHash ||
    assessment.rubric !== rubric.version
  )
    return {
      status: "unreviewed",
      reason: "Missing or stale listening evidence",
    };
  if (!assessment.reviewer?.trim() || !assessment.notes?.trim())
    return {
      status: "unreviewed",
      reason: "Reviewer and listening observations required",
    };
  let score = item.technicalPassed ? rubric.technicalMax : 0;
  for (const d of rubric.dimensions) {
    const n = assessment.scores?.[d.id];
    if (!Number.isFinite(n) || n < 0 || n > d.max)
      return {
        status: "unreviewed",
        reason: `Missing or invalid ${d.id} score`,
      };
    score += n;
  }
  return {
    status:
      item.technicalPassed &&
      !assessment.criticalDefect &&
      score > rubric.thresholdExclusive
        ? "pass"
        : "fail",
    score,
  };
}
// Qualitative user acceptance authorizes shipping a specific master, without
// manufacturing a numerical rubric score or certifying the final mix.
export function isAccepted(acceptance, item) {
  return Boolean(
    acceptance?.decision === "keep-all-variants" &&
    acceptance.reviewer?.trim() &&
    acceptance.statement?.trim() &&
    item.technicalPassed &&
    item.metrics?.sha256 &&
    acceptance.assets?.[item.id] === item.metrics.sha256,
  );
}
export function envKey() {
  const fromFile = fs.existsSync(".env")
    ? Object.fromEntries(
        fs
          .readFileSync(".env", "utf8")
          .split("\n")
          .filter((line) => line.includes("=") && !line.startsWith("#"))
          .map((line) => {
            const i = line.indexOf("=");
            return [
              line.slice(0, i).trim(),
              line
                .slice(i + 1)
                .trim()
                .replace(/^['"]|['"]$/g, ""),
            ];
          }),
      )
    : {};
  const key = process.env.FAL_KEY || fromFile.FAL_KEY;
  if (!key) throw Error("FAL_KEY is required for offline generation");
  return key;
}
