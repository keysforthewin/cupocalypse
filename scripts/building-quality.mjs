import fs from "node:fs";
import { createHash } from "node:crypto";
import { sourceHash } from "./biome-evidence.mjs";
export const catalog = JSON.parse(
  fs.readFileSync("assets/biomes/building_catalog.json"),
);
export const buildingIds = [
  ...catalog.assets,
  ...catalog.procedural.flatMap((k) =>
    catalog.variants.map((v) => `procedural-${k}-${v}`),
  ),
];
export const hashFile = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export function buildingHash() {
  const files = [
    "assets/biomes/building_catalog.json",
    "assets/biomes/blender_architecture.py",
    "assets/biomes/blender_buildings.py",
    "scripts/building-materials.py",
    "scripts/optimize-biomes.mjs",
    "scripts/building-quality.mjs",
    "scripts/building-review.mjs",
    "scripts/building-geometry.mjs",
  ];
  return createHash("sha256")
    .update(sourceHash() + files.map(hashFile).join(""))
    .digest("hex");
}
export { auditGeometry, planeDeviation } from "./building-geometry.mjs";
export function evaluateBuildings(
  report,
  assessment,
  {
    currentHash,
    exists = fs.existsSync,
    ids = buildingIds,
    seeds = catalog.seeds,
    qualities = catalog.qualities,
  } = {},
) {
  const failures = [],
    scores = {};
  if (
    !currentHash ||
    report.sourceHash !== currentHash ||
    assessment.sourceHash !== currentHash
  )
    failures.push("Stale source evidence");
  if (report.errors?.length) failures.push(...report.errors);
  if (
    !report.runtime?.passed ||
    report.runtime.sourceHash !== report.biomeSourceHash
  )
    failures.push("Missing or stale passing runtime evidence");
  for (const id of ids) {
    const totals = [];
    for (const quality of qualities)
      for (const seed of seeds) {
        const key = `${id}/${seed}/${quality}`;
        const row = assessment.rows?.find(
          (r) => r.id === id && r.seed === seed && r.quality === quality,
        );
        const capture = report.captures?.find(
          (r) => r.id === id && r.seed === seed && r.quality === quality,
        );
        if (!row || !capture) {
          failures.push(`${key}: missing case`);
          continue;
        }
        if (
          !row.observations?.trim() ||
          !row.evidence?.length ||
          row.evidence.some((f) => !exists(f)) ||
          !row.evidence.includes(capture.file) ||
          !exists(capture.file)
        )
          failures.push(`${key}: missing observations/evidence`);
        if (capture.orientations?.join(",") !== "0,90,180,270")
          failures.push(`${key}: incomplete exterior coverage`);
        if (capture.hash !== report.assetHashes?.[`${id}/${quality}`])
          failures.push(`${key}: stale asset capture`);
        if (row.blockers?.length)
          failures.push(`${key}: ${row.blockers.join("; ")}`);
        let total = 0;
        let valid = true;
        for (const [dimension, weight] of Object.entries(catalog.weights)) {
          const value = row.scores?.[dimension];
          if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 100
          ) {
            valid = false;
            failures.push(`${key}: unreviewed ${dimension}`);
            continue;
          }
          if (value < catalog.categoryFloor)
            failures.push(
              `${key}: ${dimension} below ${catalog.categoryFloor}`,
            );
          total += (value * weight) / 100;
        }
        const checks = capture.audit;
        if (
          !checks ||
          [
            "degenerate",
            "windingConflicts",
            "inwardComponents",
            "normalDisagreements",
            "missingUV",
          ].some((k) => checks[k] !== 0)
        )
          failures.push(`${key}: geometry diagnostic failure`);
        // Annotated openings and joints are reviewed visually, never silently counted as repairs.
        if (valid) {
          totals.push(total);
          if (total < catalog.threshold)
            failures.push(
              `${key}: ${total.toFixed(2)} below ${catalog.threshold}`,
            );
        }
      }
    scores[id] =
      totals.length === qualities.length * seeds.length
        ? Math.min(...totals)
        : null;
  }
  return {
    accepted: failures.length === 0,
    scores,
    failures,
    sourceHash: currentHash,
  };
}
