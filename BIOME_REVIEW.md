# Biome visual acceptance

Historical status: the earlier whole-biome pass was accepted after nine refinement iterations. Its scores do not establish building topology quality and its asset hashes are superseded by the architectural pass. See [BUILDING_REVIEW.md](BUILDING_REVIEW.md) for current building-specific validation; the historical evidence below is retained for provenance.

Each biome must exceed 95/100 independently on three fixed seeds (`BIOME-A`, `BIOME-B`, `BIOME-C`) in High and Performance. The minimum of those six assessments is its acceptance score. Scores are visual judgments, not objective AAA certification.

## Frozen rubric

Five dimensions, 0–20 each: identity, model craftsmanship, materials, composition/readability, temporal integration. 10–12 is a functional prototype; 13–15 has conspicuous unfinished work; 16–18 is polished with visible shortcomings; 19 has only minor shortcomings; 20 means no defect observed in the required evidence. Exactly 95 does not pass.

Evidence must show shipping geometry/materials in the gameplay camera, model close-ups, three seeds, both quality settings, and all twenty directed transitions. Menu art is a static existing illustration and remains unchanged. A passing build cannot increase visual scores.

Floating/intersecting geometry, terrain gaps, visible recycling or LOD changes, combat occlusion, missing assets, shader/runtime errors, and unbounded resource growth block acceptance and cap an affected assessment at 89. Missing or stale evidence prevents acceptance. Source and asset hashes must match captures. Scores require written observations and image references; the evaluator never invents visual scores.

## Initial inspection

Baseline captures: `artifacts/biomes/baseline/`. Partial assets, one seed, High only; therefore provisional and ineligible for acceptance.

| Biome | Identity | Craft | Materials | Composition | Temporal | Provisional total |
|---|---:|---:|---:|---:|---:|---:|
| Iron District | 18 | 16 | 16 | 16 | unreviewed | pending |
| Haven Estates | 18 | 14 | 14 | 16 | unreviewed | pending |
| Golden Hinterlands | 17 | 13 | 14 | 13 | unreviewed | pending |
| Blackpine Wilds | 17 | 11 | 12 | 15 | unreviewed | pending |
| Ashfall Expanse | 18 | 12 | 13 | 15 | unreviewed | pending |

Observed issues: primitive pine cones and deciduous crowns; repetitive layouts; stretched ground textures; agricultural emptiness; overly regular ruins; inappropriate ground placement of rooftop tanks. Iteration two replaces foliage, fixes world-scale terrain UVs, corrects tank placement, and introduces refined generated scenery.

## Refinement history

- Iteration 2 replaced solid cone/ball foliage with branching alpha-tested canopy clusters, corrected terrain UV scale, and repaired cracked rock geometry.
- Iteration 3 introduced the first twelve refined/authored assets and all-pair transition captures. Inspection found vehicle/fence intersections, overly bright apocalypse materials, and ground-contact issues; these captures were not accepted.
- Iteration 4 corrected vehicle orientation and density, anchored structures, desaturated burned assets in Blender, and added smoke-free drifting ash. The first runtime sweep overlapped an HMR material change and failed a texture-count comparison; it does not count as passing evidence.
- Iteration 5 added incremental section preparation and verified geometry equivalence and foliage clearance. Procedural near-field buildings still fell short of the art target.
- Iteration 6 added detailed brick and limestone city buildings, a brick cottage, a stone barn, a log cabin, and a second ruin. Neutral model renders inspected all eighteen assets.
- Iteration 7 caught a bright, elevated woodland boulder. Its material and placement were corrected. The capture harness correctly rejected the overlapping capture run as stale; its images remain under `iteration-7-stale/`.
- Iteration 8 corrected exposed conifer trunk tips. The expanded live test found a repeating 150 ms forest preparation hitch, despite stable average frame rates; `final-v2/` is therefore not accepted.
- Iteration 9 reuses four detailed conifer prototypes per quality, instancing their wood and foliage geometry instead of rebuilding it during streaming. Road-clearance checks now transform every instanced foliage vertex. Live motion is evaluated separately from forced review jumps, with 600 frames per biome and quality, including normal recycling. The additional timing gate requires p95 ≤34 ms, p99 ≤51 ms and no sampled frame >100 ms on the recorded GPU.

## Final assessment

Evidence: [review gallery](artifacts/biomes/final/index.html), [written assessments](artifacts/biomes/final/assessment.json), [acceptance result](artifacts/biomes/final/acceptance.json), [runtime measurements](artifacts/biomes/final/runtime.json). The gallery is also available through the development server at `/artifacts/biomes/final/index.html`.

| Biome | Lowest score across six cases | Distinctive features |
|---|---:|---|
| Iron District | 97 | Brick tenements, limestone offices, fire escapes, copper kiosks, rooftop tanks |
| Haven Estates | 96 | Gabled homes, brick cottages, porches, leafy lawns, fences and parked cars |
| Golden Hinterlands | 96 | Ochre fields, red and stone barns, tractors, crop rows and hay bales |
| Blackpine Wilds | 96 | Layered conifers, mossy boulders, stumps, log cabins and a timber lookout |
| Ashfall Expanse | 97 | Fractured ruins, rusted wrecks, bare trees, damaged pylons and drifting embers |

All thirty assessments score identity 20, craft 19, materials 19 and temporal integration 19. Composition is 20 for city and ash, 19 for suburb and forest, and 20/20/19 across the three country seeds. Minor limitations are documented in each assessment: the repeated architectural vocabulary, simpler distant field dressing, visible foliage cards in close-ups, and the incoming environment becoming prominent mostly in the latter half of the transition. No listed blocking defect was observed in the required evidence. These are Codex visual judgments for the game's camera and art direction, not independent AAA certification.

Validation includes 150 gameplay captures (30 biome cases and 120 transition frames), five gameplay close-ups, eighteen neutral model renders, and a 505-frame transition recording. The recording samples five 20-second timelines at 5 fps; it does not represent realtime frame-rate measurements. All twenty directed transitions were checked in both quality settings. Source and runtime GLB hashes match the evidence.

Live timing used Windows Chrome with ANGLE D3D11 on an NVIDIA RTX 5070 Ti at 1600×1000. Each biome and quality has 600 sampled moving frames after 90 warm-up frames, including normal section recycling. All medians were about 16.7 ms, all p95 values were at most 17 ms, and the largest sampled frame was 50 ms. Geometry and texture counts stabilized over three complete biome cycles; pausing froze section transforms and particle time. These measurements apply to that machine and test scenario.

The production build and 135 tests pass. Eight evaluator checks confirm that complete evidence passes while exactly 95, blocking defects, missing cases, unreviewed dimensions, missing evidence, stale hashes and missing recording metadata fail. Previous rejected evidence is retained separately, including `final-before-crown/` and `final-v2/`.

Sixteen Meshy jobs completed; two further assets were authored in Blender. The separate biome ledger reserves $32 of the authorized $100; reservations are conservative estimates, not a provider invoice. No generation requests remain pending.
