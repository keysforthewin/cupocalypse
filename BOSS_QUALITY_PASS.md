# Boss model quality pass 2

Five revised bosses are integrated into both rendering tiers. Four use newly generated Meshy v6 meshes from selected fal.ai FLUX 2 Pro concepts; the Witness combines its original armored body with three copies of a new detailed ceramic mask. Blender refinement includes material response, anatomy proportions, rigging, weight correction, animation, visible mask supports and LOD export.

**Closer to the target, still below AAA acceptance.** Provisional weighted scores improve from 74.8–79.0 to 79.0–81.8. The rubric and 92/95 acceptance thresholds are unchanged. These are editorial judgments based on the evidence below, not a claim of independent artist approval.

## Review loops

1. Archived the previous raw meshes, processed exports, runtime assets, source blends, review captures, pipeline and scorecards under `artifacts/boss-quality/baseline/`.
2. Generated and compared concept variants. Rejected generic Ossuary variants and cropped Seraph wings; accepted a wider Seraph concept. Full-body Witness requests failed provider checks, so the final approach generates an isolated mask prop and assembles it in Blender. Provider checks stayed enabled; failed attempts remain in the budget ledger.
3. Rebuilt the first four models at about 200k source polygons. Removed the excessive generated metallic response while retaining base-color/normal detail. The new spans preserve the selected concepts' proportions and increase monotonically: 11, 22, 26, 97, 130 m; heights remain 11, 18, 28, 44, 70 m.
4. Reviewed attack, phase and death poses. Fixed Marshal boot vertices receiving hand weights, attached its door blade to the grip, protected the Ossuary bed frame, and changed its death to a heavy rigid-frame topple. Corrected Widow barrel weighting/death deformation and Seraph foot/hand/wing contamination. Smoothed weights across adjacent surfaces and UV seams, then normalized the four exported influences.
5. Added separate Seraph talon/wing-finger bones, attack anticipation and settling, barrel recoil, and staggered Witness fingers. Assembled three rigid ceramic masks with articulated bronze supports. Replaced the luminous placeholder spheres with recessed layered apertures and corrected runtime group visibility so they appear only after phase one.
6. Re-exported all ten GLBs and five editable Blender sources. Recorded fresh High-rig attack films, neutral front/side renders, deformation diagnostics and in-game captures. Validated actual shipped assets and quality switching.

## Scores and remaining work

| Boss | Before | After /100 | Evidence and remaining defects |
|---|---:|---:|---|
| Grave Marshal | 75.4 | **79.0** | New detailed armor, concrete and door sculpt; attached rigid blade, clean boots, sharper anticipation/recovery. Remaining: shoulder mass transfer, close-up wrist deformation and convincing melee contact. |
| Widow of the Salvo | 76.5 | **80.2** | Cleaner six-leg carapace and three-barrel sculpt; differentiated recoil and repaired barrel death deformation. Remaining: authored foot planting/IK, abdomen dynamics and mechanical joint cleanup. |
| Ossuary Engine | 74.8 | **79.5** | Rebuilt bed/rib architecture, corrected bed weights and a rigid-frame death topple. Remaining: small surgical-joint stretches, thin cables and more complex tool articulation. |
| Seraph of the Wound | 79.0 | **81.8** | Full-width bone/membrane wings, separate wing fingers and arm talons, repaired foot-to-hand contamination. Remaining: talon/wing-root deformation outliers and stronger aerodynamic follow-through. |
| The Last Witness | 75.3 | **81.4** | Three detailed independently articulated ceramic masks with bronze supports on the original armored body; matte materials, recessed aperture and staggered fingers. Remaining: repetitive underlying armor, finger contacts and more substantial three-phase silhouette changes. |

Art/animation improved; unchanged combat and audio scores receive no automatic uplift. Hardware profiling and full-mix listening remain open. The largest remaining barrier is authored motion and clean joint topology, so additional whole-model generation alone would have diminishing value.

## Visual evidence

| Boss | Baseline | Revised | Oblique assembly check | Revised attack |
|---|---|---|---|---|
| Grave Marshal | [Before](artifacts/boss-quality/baseline/review/grave-marshal-front.png) | [After](assets/bosses/review/grave-marshal-front.png) | [Side](assets/bosses/review/grave-marshal-side.png) | [Motion](assets/bosses/review/grave-marshal-motion.mp4) |
| Widow of the Salvo | [Before](artifacts/boss-quality/baseline/review/widow-of-the-salvo-front.png) | [After](assets/bosses/review/widow-of-the-salvo-front.png) | [Side](assets/bosses/review/widow-of-the-salvo-side.png) | [Motion](assets/bosses/review/widow-of-the-salvo-motion.mp4) |
| Ossuary Engine | [Before](artifacts/boss-quality/baseline/review/ossuary-engine-front.png) | [After](assets/bosses/review/ossuary-engine-front.png) | [Side](assets/bosses/review/ossuary-engine-side.png) | [Motion](assets/bosses/review/ossuary-engine-motion.mp4) |
| Seraph of the Wound | [Before](artifacts/boss-quality/baseline/review/seraph-of-the-wound-front.png) | [After](assets/bosses/review/seraph-of-the-wound-front.png) | [Side](assets/bosses/review/seraph-of-the-wound-side.png) | [Motion](assets/bosses/review/seraph-of-the-wound-motion.mp4) |
| The Last Witness | [Before](artifacts/boss-quality/baseline/review/the-last-witness-front.png) | [After](assets/bosses/review/the-last-witness-front.png) | [Side](assets/bosses/review/the-last-witness-side.png) | [Motion](assets/bosses/review/the-last-witness-motion.mp4) |

The baseline renders used the earlier Performance meshes; revised studio renders and films use High. Camera framing also changed to accommodate wider silhouettes. This is an iteration comparison, not an isolated same-settings benchmark. Motion previews are sampled at 10 fps and do not measure game performance. [New arena captures](artifacts/boss-quality/runtime) show the assets in the game; [Witness transformation](assets/bosses/review/the-last-witness-front-transform.png) shows the articulated masks and aperture.

Deformation reports under `assets/bosses/review/*-deformation.json` inspect 12 poses per boss. Edge-length ratios identify possible skinning defects; they are diagnostic measurements, not pass/fail AAA scores. Extreme ratios on tiny edges remain, particularly at Seraph talon/wing roots and armor joints. Close-up corrective shapes/retopology and better contact animation remain necessary.

## Cost and runtime tradeoffs

The ledger reserves **$58.15 / $100 total**, including failed attempts: **$23.85 added in this pass**, **$41.85 unreserved**. Reservations are conservative estimates, not provider invoices. Selected candidates, prompts and job provenance are retained in [quality-selection.json](assets/bosses/quality-selection.json), [quality-designs.json](assets/bosses/quality-designs.json) and [ledger.json](assets/bosses/ledger.json).

High meshes are approximately 209–211k triangles for the first four and 291k for the Witness. Performance meshes remain about 40.6k; texture limits stay 2048/1024. Total shipped model size is about 105.6 MiB, up from 69 MiB. High therefore has a material loading/memory cost; representative GPU frame-time and memory profiling are still required. Source-only generation and bridge code are absent from the game bundle.

## Validation

- 154 automated tests passed; production build passed.
- All ten shipped GLBs pass eight-clip, moving-channel, skin-weight and geometry-budget validation.
- High → Performance → High selects 209,262 → 40,592 → 209,262 Marshal triangles. Injected Widow 404 is recorded as expected; fallback remains playable and no unexpected error is accepted.
- New High arena captures cover all five bosses with no unexpected browser errors. Final Marshal/Witness captures also assert hidden phase-one aperture groups and count the loaded triangles. Review scripts fail on unexpected errors.
- Original Blender `Scene` still contains its Cube, Camera and Light. The viewport screenshot tool failed; explicit Blender renders provide visual evidence instead.

The Witness visual offset increased from 90 to 120 m to keep the forward-projecting masks inside the frame. Arena distance and damage timing are unchanged. The camera regression check now includes the mask depth.

Existing audio/victory/pacing evidence remains in [BOSS_REVIEW.md](BOSS_REVIEW.md); audio and combat behavior were not changed in this pass.

## Reproduce

Run the dev server, then:

```sh
npm test
npm run build
node scripts/validate-boss-assets.mjs
node scripts/boss-quality-review.mjs
BOSS_RENDER_QUALITY=high BOSS_REVIEW_OUT=artifacts/boss-quality/runtime BOSS_STILL_ONLY=1 node scripts/boss-review.mjs
```

`process_boss(index)` in [blender_pipeline.py](assets/bosses/blender_pipeline.py) now defaults to the accepted sources. It exports the High source, derives the bounded Performance mesh, and restores High geometry in the live scene for review. Run `node scripts/optimize-bosses.mjs` after exports and `python3 scripts/encode-boss-review.py` after films. Generation is versioned and protected by an exclusive ledger lock; no paid calls are required for builds or reviews.
