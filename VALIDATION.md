> The animation and combat changes in `containment-1.4.0` supersede the older balance results below. See [ANIMATION_PASS.md](ANIMATION_PASS.md) and the `artifacts/animation-*` reports for current verification.

# Validation report

## September 22 weapon and street quality pass — containment-1.2.0

- Weapon upgrades are permanent for the run and duplicates add levels. Damage, fire rate, spread and reactor power stack; spread has seven physical rays at level three and adds damage after that. New runs reset upgrades. Shields remain consumable. Replay version changed to prevent old timed-boost recordings playing under different rules.
- Six distinct 3D pickup silhouettes, emissive details, metal housings, animated rotation/bobbing, ground rings and local lights. Weapon colors and projectile weight reflect upgrades; HUD/reward/intel text describes permanent levels.
- City buffer increased from 180 m to 300 m, with recycling safely beyond the maximum building shadow projection. A fixed expanded sun frustum includes the visible receiver corridor and off-screen rooftop casters. Tests project caster-volume corners through the actual orthographic camera constants and check recycling margins.
- Road and architecture now include deterministic asphalt aggregate/wear, bump detail, masonry, framed/partially illuminated glazing, shopfronts, paving joints, drain grilles, service covers, tapered barriers, reflectors, utility cabinets and bollards. Geometry remains batched by full material/shadow identity.
- `npm test`: 29 passing tests, including three minutes of actual upgraded firing in all six modes, repeated pickups through level 50, bounded Mirror projectiles, and a replay that actually collects a weapon.
- Thirty fresh-profile bot runs (`SEEDS=5 SEED_PREFIX=quality npm run validate`) completed across all six modes. 26 reached the 15-minute observation cutoff and four ended on boss contact. This deliberately stronger progression invalidates the historical survival distributions below; it is a smoke sample, not a fresh balance certification.
- Final production build passes. The browser review renders all six pickups at two rotation phases, upgraded volleys, real pickup collision/HUD level changes, the revised in-lane barricade, and two recycling boundaries without console errors. Screenshots and the report are under `artifacts/quality/`.
- Shadow-boundary road crops differ by less than 0.37/255 per RGB channel on average, with fewer than 0.17% of pixels changing luminance by more than 16/255, across a 0.02-world-unit scroll. This matches ordinary subpixel movement; there is no large newly appearing road shadow in these captures (`shadow-seams.json`).
- Connected Chrome on **RTX 5070 Ti**, 1920×945: live dense combat with level-three weapons measured p50/p95/p99 **16.7 / 16.8 / 33.3 ms** over 600 frames (612 simulation ticks advanced). Frozen dense High measured **16.7 / 33.0 / 33.4 ms**; frozen dense Performance measured **16.7 / 16.8 / 33.4 ms**, each over 300 frames. Both quality modes displayed the new pickups without console errors. See `artifacts/quality/hardware.json` and `hardware-performance-pickups.png`. These are development-build frame intervals, not GPU timings; the previously specified RTX 3070 Ti remains unmeasured.
- The separate software-renderer report in `artifacts/quality/review.json` is useful for reproducibility and rendering errors, not hardware FPS acceptance. This pass is not a claim of commercial AAA art certification.

## Road, city and control quality pass — 2026-09-22

Previous pass: **containment-1.1.0**. Rebuilt the environment as solid, material-preserving street chunks: asphalt, markings, sidewalks, grounded debris, wrecks and articulated building facades scroll together. Removed the old partial-material batching and aggressive SSAO pass. Section recycling occurs behind the camera or beyond fog. Steering now has 100 ms acceleration and 80 ms braking, with render interpolation between simulation ticks. The squad count is a small number below the formation. Gates occupy the two outer lanes with a clear center gap; the formation center chooses one gate, and the center lane grants neither. Bullet absorption follows the same gate bounds, including Mirror. This rule change increments the replay version; older replay inputs are rejected rather than played under different rules.

Docker production build and **25 tests pass**, including new scrolling continuity, steering, interpolation and reward-selection regressions. All **10 browser integration checks** pass. Connected Chrome reported no console warnings or errors. Saved evidence: `artifacts/quality-pass-before.png`, `quality-pass-final.png`, `quality-pass-dense.png`, and `quality-pass-motion.webm` (12 seconds of real-time canvas capture showing steering and road movement; HTML overlays are absent from this canvas-only recording).

The user-specified hardware target is **RTX 3070 Ti**. Connected Chrome reports **RTX 5070 Ti**, so 3070 Ti performance remains unverified. High-quality live dense combat at 1920×945 measured p50/p95/p99 **16.7 / 16.8 / 33.4 ms** over 15 seconds. A frozen dense scene at 1921×1081 measured **16.7 / 16.8 / 16.8 ms** over 10 seconds. These are short, refresh-limited frame interval samples in a development build, not GPU timer measurements. Full details: `artifacts/quality-pass-performance.json`.

The balance distributions and software-rendering results below are **historical 1.0.0 results**, not acceptance evidence for the current weapon progression, gate geometry or visual quality. They have not been recalibrated for 1.2.0.

Validated in Docker with Node 24, Chromium 153, Blender 3.4.1, and glTF Transform 4.5.0. Balance version: containment-1.0.0. Reports are reproducible through the commands in README.md.

## Simulation and balance

**50 seeds per mode per cohort**: 300 fixed fresh-profile runs, 300 separate holdout runs, and 300 fully upgraded runs. All fresh-profile medians in both cohorts meet the 800–1500 m target. Inputs respect the same 6 units/second steering limit as human controls. Generation never checks army strength to rescue a weak run.

| Mode         | Fixed fresh p10 / median / p90 (m) | Holdout median (m) | Upgraded median (m) |
| ------------ | ---------------------------------: | -----------------: | ------------------: |
| Classic      |               654 / **911** / 1171 |               1154 |                1661 |
| Reverse      |               654 / **913** / 1170 |               1154 |                1655 |
| Swarm        |             1154 / **1169** / 1906 |               1179 |                1922 |
| Fortress     |               654 / **918** / 1166 |               1154 |                1666 |
| Mirror       |              666 / **1157** / 1404 |               1156 |                1911 |
| Sudden Death |              662 / **1154** / 1168 |               1154 |                1161 |

Each JSON run includes its termination reason. Boss contact dominates this bot's losses: the results demonstrate the specified bot's behavior, not a distribution of human skill. Runs ending at 15 minutes are reported as censored, not deaths. Human playtesting is still needed to assess tactical variety and perceived difficulty.

Career simulation: **9.73 hours**, 74 runs to buy all 15 upgrade levels. First purchase after run 1. This model includes 35 seconds between runs and follows a fixed purchase order; it is an estimate, not an observed human completion time.

## Verification evidence

- Unit tests cover arithmetic, gate absorption/improvement, neutral Sudden Death gates, Mirror shared results/firepower, finite shields, permanent weapon levels, armor breaks/contact rules, committed warning times, Screamer preparation/cancellation, Bloater chains, Carrier cancellation, boss phases/contact/arena isolation, Fortress movement overrides, deterministic replay, quantization, bounded effects, restart, debug exclusion, and upgrade purchases.
- Route tests traverse a spatial/time grid for boss phases from both road edges in every mode, check specialist and gate-wall reference encounters, and reject an intentionally impossible combined hazard. This is a reference-condition validator, not an exhaustive proof of every possible player state.
- Chromium smoke output: artifacts/browser-smoke.json. UI/input/persistence integration checks: artifacts/browser-tests.json.
- All 13 enemies at the gameplay camera: artifacts/review-_.png; boss phase-two images: artifacts/phase2-_.png; dense encounter: artifacts/dense-combat.png. The gallery artifacts/asset-review.html compares neutral-light silhouettes and the two candidate generation pipelines.
- Primary recording: artifacts/combat-full-ui.webm, including the HTML HUD, enemy numbers, and lane warnings. Chapter timestamps and scenario details are in artifacts/recording-metadata.json. The smaller combat-bulwark / broodmass / congregation / dense clips are earlier canvas-only references. Recordings advance fixed ticks for phase coverage; they are not real-time GPU benchmarks.
- artifacts/security.json scans the complete production directory against local credential values, checks for bundled environment files, and searches for generation API references. Credential values are never printed.

## Presentation and performance

The hardware available to the Docker browser is Vulkan SwiftShader (software rendering); the host has no `/dev/dri` GPU device. RTX 3060 performance is **not verified**. See `artifacts/performance.json` for measured 1080p intervals. This cannot certify a 60 fps hardware target.

| Setting     | Samples |      p50 |       p95 |       p99 |
| ----------- | ------: | -------: | --------: | --------: |
| high        |     120 | 900.0 ms | 1049.9 ms | 1599.9 ms |
| performance |     120 | 450.0 ms |  549.9 ms |  733.3 ms |

Measured after 15 warmup frames in a frozen dense scene of 35 enemies and 72 rendered soldiers, at 1920×1080. These are software-rendered frame intervals, not estimates of discrete-GPU performance.

Saved generated meshes, authored rig layouts, automated skin weights, locomotion loops, armor-loss variants, chest/sac damage treatments, and pooled corpse/limb effects are implemented. They are a playable generated-art production pass, not an animator-approved AAA asset set. The synthesized audio provides distinct attack cues; it is not a recorded cinematic sound library. The original high-quality rendering provided shadows, SSAO, bloom, and antialiasing (SSAO was removed in the quality pass); Performance disables postprocessing.

## Asset budget and reproducibility

**$41.60 conservatively reserved out of $100**, with 32 completed jobs and 1 failed job. There are no pending requests. Comparison: $12.10 / $20; production: $29.50 / $60; corrections: $0.00 / $20. Reservations are not provider billing totals. The failed content-check request retains its allowance.

The Meshy soldier and TRELLIS infected comparison led to Meshy for the squad and FLUX → TRELLIS for the infected silhouettes. Original results, prompts, timestamps, and job state are retained. Blender normalizes/rigs/decimates the models; glTF Transform creates web-compressed textures and distant LODs. Gameplay reads only saved local assets.

## Remaining acceptance limits

1. Measure 60 fps at 1080p on an RTX 3060-class physical desktop. Software-renderer results cannot substitute for this.
2. Obtain human playtest and animation/art sign-off, especially nonhumanoid deformation, readability during uncontrolled dense play, and perceived variety beyond the gate bot.
3. Confirm actual generation charges from the provider's billing dashboard if an invoice-level spend total is required.
