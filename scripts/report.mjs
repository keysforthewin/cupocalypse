import fs from "node:fs";
const read = (f) => JSON.parse(fs.readFileSync("artifacts/" + f, "utf8"));
const fixed = read("balance-fixed-fresh.json"),
  holdout = read("balance-holdout-fresh.json"),
  upgraded = read("balance-fixed-upgraded.json"),
  career = read("progression.json"),
  budget = read("generation-budget.json");
const rows = fixed
  .map(
    (r, i) =>
      `| ${r.summary.mode} | ${r.summary.p10} / **${r.summary.median}** / ${r.summary.p90} | ${holdout[i].summary.median} | ${upgraded[i].summary.median} |`,
  )
  .join("\n");
let perf =
  "The hardware available to the Docker browser is Vulkan SwiftShader (software rendering); the host has no `/dev/dri` GPU device. RTX 3060 performance is **not verified**. See `artifacts/performance.json` for measured 1080p intervals. This cannot certify a 60 fps hardware target.";
if (fs.existsSync("artifacts/performance.json")) {
  const data = read("performance.json");
  if (data.reports)
    perf +=
      "\n\n| Setting | Samples | p50 | p95 | p99 |\n| --- | ---: | ---: | ---: | ---: |\n" +
      data.reports
        .map(
          (r) =>
            `| ${r.quality} | ${r.sampleCount} | ${r.p50.toFixed(1)} ms | ${r.p95.toFixed(1)} ms | ${r.p99.toFixed(1)} ms |`,
        )
        .join("\n") +
      "\n\nMeasured after 15 warmup frames in a frozen dense scene of 35 enemies and 72 rendered soldiers, at 1920×1080. These are software-rendered frame intervals, not estimates of discrete-GPU performance.";
}
const content = `# Validation report

Validated in Docker with Node 24, Chromium 153, Blender 3.4.1, and glTF Transform 4.5.0. Balance version: containment-1.0.0. Reports are reproducible through the commands in README.md.

## Simulation and balance

**50 seeds per mode per cohort**: 300 fixed fresh-profile runs, 300 separate holdout runs, and 300 fully upgraded runs. All fresh-profile medians in both cohorts meet the 800–1500 m target. Inputs respect the same 6 units/second steering limit as human controls. Generation never checks army strength to rescue a weak run.

| Mode | Fixed fresh p10 / median / p90 (m) | Holdout median (m) | Upgraded median (m) |
| --- | ---: | ---: | ---: |
${rows}

Each JSON run includes its termination reason. Boss contact dominates this bot's losses: the results demonstrate the specified bot's behavior, not a distribution of human skill. Runs ending at 15 minutes are reported as censored, not deaths. Human playtesting is still needed to assess tactical variety and perceived difficulty.

Career simulation: **${career.hours.toFixed(2)} hours**, ${career.runs} runs to buy all 15 upgrade levels. First purchase after run ${career.firstPurchase.run}. This model includes 35 seconds between runs and follows a fixed purchase order; it is an estimate, not an observed human completion time.

## Verification evidence

- Unit tests cover arithmetic, gate absorption/improvement, neutral Sudden Death gates, Mirror shared results/firepower, finite shields, boost refresh, armor breaks/contact rules, committed warning times, Screamer preparation/cancellation, Bloater chains, Carrier cancellation, boss phases/contact/arena isolation, Fortress movement overrides, deterministic replay, quantization, bounded effects, restart, debug exclusion, and upgrade purchases.
- Route tests traverse a spatial/time grid for boss phases from both road edges in every mode, check specialist and gate-wall reference encounters, and reject an intentionally impossible combined hazard. This is a reference-condition validator, not an exhaustive proof of every possible player state.
- Chromium smoke output: artifacts/browser-smoke.json. UI/input/persistence integration checks: artifacts/browser-tests.json.
- All 13 enemies at the gameplay camera: artifacts/review-*.png; boss phase-two images: artifacts/phase2-*.png; dense encounter: artifacts/dense-combat.png. The gallery artifacts/asset-review.html compares neutral-light silhouettes and the two candidate generation pipelines.
- Primary recording: artifacts/combat-full-ui.webm, including the HTML HUD, enemy numbers, and lane warnings. Chapter timestamps and scenario details are in artifacts/recording-metadata.json. The smaller combat-bulwark / broodmass / congregation / dense clips are earlier canvas-only references. Recordings advance fixed ticks for phase coverage; they are not real-time GPU benchmarks.
- artifacts/security.json scans the complete production directory against local credential values, checks for bundled environment files, and searches for generation API references. Credential values are never printed.

## Presentation and performance

${perf}

Saved generated meshes, authored rig layouts, automated skin weights, locomotion loops, armor-loss variants, chest/sac damage treatments, and pooled corpse/limb effects are implemented. They are a playable generated-art production pass, not an animator-approved AAA asset set. The synthesized audio provides distinct attack cues; it is not a recorded cinematic sound library. High-quality rendering provides shadows, SSAO, bloom, and antialiasing; Performance disables postprocessing.

## Asset budget and reproducibility

**$${budget.reserved.toFixed(2)} conservatively reserved out of $100**, with ${budget.states.complete} completed jobs and ${budget.states.failed} failed job. There are no pending requests. Comparison: $${budget.byBucket.comparison.reserved.toFixed(2)} / $20; production: $${budget.byBucket.production.reserved.toFixed(2)} / $60; corrections: $${budget.byBucket.correction.reserved.toFixed(2)} / $20. Reservations are not provider billing totals. The failed content-check request retains its allowance.

The Meshy soldier and TRELLIS infected comparison led to Meshy for the squad and FLUX → TRELLIS for the infected silhouettes. Original results, prompts, timestamps, and job state are retained. Blender normalizes/rigs/decimates the models; glTF Transform creates web-compressed textures and distant LODs. Gameplay reads only saved local assets.

## Remaining acceptance limits

1. Measure 60 fps at 1080p on an RTX 3060-class physical desktop. Software-renderer results cannot substitute for this.
2. Obtain human playtest and animation/art sign-off, especially nonhumanoid deformation, readability during uncontrolled dense play, and perceived variety beyond the gate bot.
3. Confirm actual generation charges from the provider's billing dashboard if an invoice-level spend total is required.
`;
fs.writeFileSync("VALIDATION.md", content);
console.log("Wrote VALIDATION.md");
