// Exercise acceptance failures against an isolated copy of a reviewed evidence
// set. Never alters the real assessment, captures, or acceptance result.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const original = path.resolve(process.argv[2] || "artifacts/biomes/final");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "biome-evaluator-"));
const baseline = JSON.parse(
  fs.readFileSync(path.join(original, "assessment.json")),
);
try {
  for (const name of fs.readdirSync(original)) {
    if (["assessment.json", "acceptance.json", "index.html"].includes(name))
      continue;
    fs.symlinkSync(path.join(original, name), path.join(temp, name));
  }
  function run(edit, expected, reason) {
    const data = structuredClone(baseline);
    edit(data);
    fs.writeFileSync(path.join(temp, "assessment.json"), JSON.stringify(data));
    const child = spawnSync(
      process.execPath,
      ["scripts/biome-evaluate.mjs", temp],
      { encoding: "utf8" },
    );
    assert.equal(child.status, expected ? 0 : 1, child.stderr || child.stdout);
    const result = JSON.parse(
      fs.readFileSync(path.join(temp, "acceptance.json")),
    );
    assert.equal(result.accepted, expected, reason);
    return result;
  }
  run(() => {}, true, "Complete reviewed evidence passes");
  run(
    (a) => {
      a.rows[0].dimensions = {
        identity: 19,
        craft: 19,
        materials: 19,
        composition: 19,
        temporal: 19,
      };
    },
    false,
    "Exactly 95 fails",
  );
  const blocked = run(
    (a) => {
      a.rows[0].blockers = ["Fixture: floating geometry"];
    },
    false,
    "A blocker fails even above 95",
  );
  assert.equal(blocked.scores[baseline.rows[0].biome], 89);
  run(
    (a) => {
      a.rows.pop();
    },
    false,
    "Missing seed/quality case fails",
  );
  run(
    (a) => {
      a.rows[0].dimensions.materials = null;
    },
    false,
    "Unreviewed dimension fails",
  );
  run(
    (a) => {
      a.rows[0].evidence = ["missing.png"];
    },
    false,
    "Missing evidence fails",
  );
  run(
    (a) => {
      a.sourceHash = "stale";
    },
    false,
    "Stale assessment fails",
  );
  fs.unlinkSync(path.join(temp, "film.json"));
  run(() => {}, false, "Missing recording metadata fails");
  console.log("8 evaluator acceptance/rejection checks passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
