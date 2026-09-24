import test from "node:test";
import assert from "node:assert/strict";
import {
  reserveCost,
  validateAssessment,
  readJSON,
  isAccepted,
} from "./core.mjs";
const price = { unit: "seconds", unit_price: 0.002, currency: "USD" };
const rubric = readJSON("assets/audio-quality/rubric.json");
test("qualitative approval accepts only the exact reviewed masters and assigns no numerical score", () => {
  const item = {
    id: "pulse-r2-1",
    technicalPassed: true,
    metrics: { sha256: "reviewed" },
  };
  const acceptance = {
    decision: "keep-all-variants",
    reviewer: "User",
    statement: "Keep them all",
    assets: { "pulse-r2-1": "reviewed" },
  };
  assert.equal(isAccepted(acceptance, item), true);
  assert.equal(isAccepted(null, item), false);
  assert.equal(
    isAccepted(acceptance, { ...item, metrics: { sha256: "changed" } }),
    false,
  );
  assert.equal(
    isAccepted(acceptance, { ...item, technicalPassed: false }),
    false,
  );
  assert.equal(isAccepted({ ...acceptance, statement: "" }, item), false);
  assert.equal(validateAssessment(null, item, rubric).status, "unreviewed");
});
test("budget counts complete, failed, and ambiguous submissions and never exceeds the user cap", () => {
  const ledger = {
    capUSD: 100,
    jobs: {
      complete: { reserveUSD: 50 },
      uncertain: { reserveUSD: 30 },
      failed: { reserveUSD: 19.99 },
    },
  };
  assert.throws(
    () => reserveCost({ capUSD: NaN, jobs: {} }, 1, price),
    /budget/,
  );
  assert.throws(
    () =>
      reserveCost(
        { capUSD: 100, jobs: { corrupt: { reserveUSD: -50 } } },
        1,
        price,
      ),
    /budget/,
  );
  assert.equal(reserveCost(ledger, 1, price, "correction"), 0.01);
  assert.throws(() => reserveCost(ledger, 22, price, "correction"), /budget/);
  assert.throws(
    () => reserveCost({ ...ledger, capUSD: 500 }, 22, price, "correction"),
    /budget/,
  );
  assert.throws(
    () =>
      reserveCost(
        { capUSD: 100, jobs: { a: { reserveUSD: 20 } } },
        1,
        price,
        "pilot",
      ),
    /budget/,
  );
  assert.throws(
    () =>
      reserveCost({ capUSD: 100, jobs: {} }, 1, { ...price, unit: "request" }),
    /pricing/,
  );
});
test("technical checks alone, stale evidence, omissions and critical defects cannot pass", () => {
  const item = { technicalPassed: true, evidenceHash: "current" };
  const assessment = {
    reviewer: "Listener",
    notes: "Listened in repeated fire and combat.",
    rubric: rubric.version,
    evidenceHash: "current",
    scores: { impact: 25, identity: 20, clarity: 20, variation: 15, space: 10 },
  };
  assert.equal(validateAssessment(null, item, rubric).status, "unreviewed");
  assert.equal(
    validateAssessment({ ...assessment, evidenceHash: "old" }, item, rubric)
      .status,
    "unreviewed",
  );
  assert.equal(
    validateAssessment({ ...assessment, scores: {} }, item, rubric).status,
    "unreviewed",
  );
  assert.equal(
    validateAssessment({ ...assessment, criticalDefect: true }, item, rubric)
      .status,
    "fail",
  );
  assert.equal(
    validateAssessment(assessment, { ...item, technicalPassed: false }, rubric)
      .status,
    "fail",
  );
  assert.equal(
    validateAssessment(
      { ...assessment, scores: { ...assessment.scores, impact: 20 } },
      item,
      rubric,
    ).status,
    "fail",
  );
  assert.deepEqual(validateAssessment(assessment, item, rubric), {
    status: "pass",
    score: 100,
  });
});
