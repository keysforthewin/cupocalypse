# Eight-boss campaign — implementation and review

The playable campaign is implemented. **Quality pass 2 is integrated; see [the iteration review](BOSS_QUALITY_PASS.md) for comparisons and remaining defects.** **The visual assets are not yet accepted as AAA quality.** The scorecards below deliberately remain below the approved 92/100 target (95 for the final boss). Generated surface quality, creature deformation, and animation weight still need an artist-led polish pass. Automated tests establish functional behavior; they cannot certify Souls/Elden Ring-level art direction.

## Complete roster

All eight encounters are mandatory. Travel stops at each 150 m milestone until the boss dies. Boss body contact cannot bypass the encounter. The Last Witness ends the run at 1,200 m; its death animation precedes a dedicated victory/results flow. Existing distance leaderboards and historical endless scores remain intact. Replay version is now `containment-2.0.0`; earlier simulation-version replays remain subject to the existing version check.

| Order | Boss | Height / span | Distinct identity and combat |
|---|---|---|---|
| 1 | Bulwark | Existing asset | Armored breach; armor break and slam patterns. |
| 2 | Broodmass | Existing asset | Infected mother; pools and summons. |
| 3 | Congregation | Existing asset | Fused crowd; alternating attack sequences. |
| 4 | Grave Marshal | 11 / 11 m | Headless concrete commander with blast-door cleaver. Cleave, overhead execution, traveling heel shockwave; second-phase follow-up strikes. |
| 5 | Widow of the Salvo | 18 / 22 m | Six-legged artillery creature with three thorax barrels. Arcing mortars, needle volleys, shells that branch into two warned lanes; longer phase-two barrages. |
| 6 | Ossuary Engine | 28 / 26 m | Walking rib-cage hospital with suspended beds and surgical arms. Surgical sweeps, lingering restraints, rivet projectiles; alternating second-phase strikes. |
| 7 | Seraph of the Wound | 44 / 97 m | Three-winged parasite with a crown wing and exposed membranes. Spear sequences, successive beam lanes, talon strikes; expanded second-phase volleys. |
| 8 | The Last Witness | 70 / 130 m | Kneeling armored colossus with nested masks and enormous hands. Palm impacts, eye beams, rib projectiles; three phases at 65% and 30%, ending in a multi-attack sequence. |

New bosses expose three tethered road-level damage anchors. Their giant bodies are staged farther back so the squad, warning lanes, and boss silhouette remain visible together. Projectiles sample a deterministic path from release to the scheduled lane impact; damage resolves through the existing lane-exposure system, not continuous mid-air mesh collisions. Large damage bursts stop at phase thresholds, and the two-second transformations suspend further health damage.

The final design changed to a fully armored ceramic/machine colossus after provider rejection of the earlier organic concept. Safety checks were left enabled. Quality pass 2 adds three separately generated ceramic funeral masks with authored supports and independent articulation. The underlying armored body remains, so organic horror and phase silhouette changes are still limited.

## Asset production

- **fal.ai FLUX 2 Pro:** original creature concepts; selected variants in [selection.json](assets/bosses/selection.json).
- **Meshy v6 through fal.ai:** textured image-to-3D source meshes. Job IDs, prompts, outputs, failures, and cost reservations are in [ledger.json](assets/bosses/ledger.json).
- **Blender 5.2:** separate task scenes, scale normalization, PBR/normal adjustments, custom non-humanoid skeletons, semantic skin weighting, eight authored clips per boss, and a decimated Performance mesh. Marshal blade weights and Witness knee weights received additional corrections.
- **ElevenLabs through fal.ai:** six cues per boss—entrance, windup, attack, impact, phase, death. FFmpeg performs two-pass loudness mastering into locally shipped Ogg assets.
- **Runtime exports:** four High GLBs at roughly 209–211k triangles, a 291k Witness, and five Performance GLBs at roughly 40.6k triangles. High textures are limited to 2,048 px and Performance textures to 1,024 px. The ten files total about 105.6 MiB; only the active quality and upcoming encounter are loaded. Creature materials and asset caches are released on unmount.

Editable sources are in [assets/bosses/source](assets/bosses/source), raw generations in [originals](assets/bosses/originals), and shipped models in [public/assets/bosses](public/assets/bosses). The original live Blender scene still contains its Cube, Camera, and Light. Blender viewport capture failed in the connected tool, so review uses explicit rendered images and videos.

**Budget:** conservative ledger reservations total **$58.15 of the authorized $100 cap**, including failed attempts. This is not a provider invoice. Paid generation is offline only; the game does not call Meshy, fal.ai, or ElevenLabs.

## Quality rubric and current scores

Scores use a 0–10 scale, weighted to 100. A 9–10 means production-ready work supported by visual, motion, gameplay, listening, and performance evidence. These are provisional editorial judgments, not automatic approvals. Audio scores reflect design and engineering checks; a listening-panel review remains open.

| Criterion | Weight | Acceptance evidence |
|---|---:|---|
| Artwork | 20% | Strong silhouette, coherent anatomy, convincing PBR, close-up surface detail, no obvious generation artifacts. |
| Animation | 20% | Weight, anticipation, contact, recovery, secondary motion, clean skin deformation and phase/death transitions. |
| Originality | 15% | Recognizable anatomy, motif and behavior; escalating scale without merely resizing a previous boss. |
| Combat | 15% | Distinct patterns, readable warnings, reachable responses in all six protocols, fair phases and damage. |
| Audio | 10% | Distinct identity, escalating perceived intensity, audible warnings, unclipped mix, working pause/mute. |
| Staging | 10% | Full silhouette and readable squad, lighting, attack VFX, entrance/phase/death presentation. |
| Technical | 10% | Valid rigs/clips, bounded loading and disposal, quality fallback, deterministic gameplay, hardware frame-time budget. |

| Boss | Art | Animation | Originality | Combat | Audio | Staging | Technical | Weighted /100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Grave Marshal | 8.3 | 7.4 | 8.0 | 8.2 | 8.0 | 7.3 | 8.0 | **79.0** |
| Widow of the Salvo | 8.4 | 7.4 | 8.3 | 8.4 | 8.1 | 7.5 | 8.0 | **80.2** |
| Ossuary Engine | 8.2 | 7.2 | 8.8 | 8.1 | 8.2 | 7.1 | 8.0 | **79.5** |
| Seraph of the Wound | 8.7 | 7.6 | 8.4 | 8.3 | 8.3 | 7.8 | 8.0 | **81.8** |
| The Last Witness | 8.4 | 7.6 | 8.2 | 8.4 | 8.5 | 8.0 | 8.0 | **81.4** |

The [machine-readable scorecards](assets/bosses/scorecards.json) include each boss's specific remaining defects. The largest gaps are animation weight and follow-through, rigid architectural deformation on Ossuary, Widow foot planting, detailed hand/mask motion on Witness, and more authored melee-contact VFX. The protected transformations currently combine additive skeletal poses and exposed cores; they do not include full mesh-swapping transformations or cinematic cutscenes.

Motion review videos: [Marshal](assets/bosses/review/grave-marshal-motion.mp4), [Widow](assets/bosses/review/widow-of-the-salvo-motion.mp4), [Ossuary](assets/bosses/review/ossuary-engine-motion.mp4), [Seraph](assets/bosses/review/seraph-of-the-wound-motion.mp4), [Witness](assets/bosses/review/the-last-witness-motion.mp4). These show a 2.5-second attack sequence on the revised High rig at 10 fps, not measured game performance. Neutral studio renders hide the aperture; transformation renders expose it. The original Performance review is archived in `artifacts/boss-quality/baseline/`.

## Verification evidence

- **154 automated tests pass**, including mandatory arenas, all eight kills, terminal victory, damage-gated phases, released-projectile preservation, deterministic replay, camera framing, and every new pattern/phase across all six protocols from both road edges. Existing weapon, super, leaderboard and formation tests also pass.
- **Production build passes.** Built-output credential scan finds no environment files, secret matches, or generation API references.
- **All 10 shipped models pass asset validation:** eight distinct moving clips, skeletons, normalized weights, and geometry budgets. See [assets.json](artifacts/boss-review/assets.json).
- **Browser runtime checks pass:** victory reveal and results, terminal simulation, pause, all 30 audio decodes, mute and active-voice cleanup. See [runtime.json](artifacts/boss-review/runtime.json) and [victory capture](artifacts/boss-review/victory.png).
- **Quality/fallback checks pass:** High → Performance → High reloads the correct geometry (209,262 / 40,592 / 209,262 Marshal triangles) without runtime errors. A deliberately missing Widow GLB displays the fallback while its encounter remains playable. Its expected injected 404 is recorded separately from unexpected browser errors. See [quality.json](artifacts/boss-review/quality.json).
- **Audio:** measured entrance loudness progresses −24.93, −22.46, −19.96, −18.18, −16.64 LUFS. All 30 mastered files remain below −1 dBTP; the highest is −1.69 dBTP. Boss cues duck weapon audio, and the output chain includes a compressor and soft limiter. See [audio.json](artifacts/boss-review/audio.json). Source measurements do not replace a full-mix listening test.
- **Pacing:** reproducible seed `boss-campaign-000`, Mirror, upgrades `[5,5,5]`, built-in bot, finishes all eight bosses in **720 seconds / 12 minutes**. New fights last approximately 29, 45, 45, 64, and 105 seconds. See [pacing.json](artifacts/boss-review/pacing.json). This validates one successful benchmark, not a universal duration or human difficulty balance. Earlier cross-mode bot runs showed substantial deaths between arenas; broader human playtesting remains necessary.
- **Browser rendering:** captures and error reports are under [artifacts/boss-review](artifacts/boss-review). Headless SwiftShader verifies rendering/functionality, not a target GPU's frame rate. A hardware performance gate remains open; no 60 fps claim is made.

Review artifacts under `artifacts/` are ignored by Git. The source scorecards and motion films are retained under `assets/bosses/`.

## Reproduce checks and exports

Run the dev server before browser checks (`npm run dev`).

```sh
npm test
npm run build
node scripts/validate-boss-assets.mjs
python3 scripts/analyze-boss-audio.py
npx tsx scripts/boss-pacing.ts
node scripts/boss-review.mjs
node scripts/boss-runtime-review.mjs
node scripts/boss-quality-review.mjs
node scripts/security.mjs
```

For asset updates, [generate-bosses.mjs](scripts/generate-bosses.mjs) uses the offline `FAL_KEY`, persistent queue ledger and remaining budget. Run only one generator process at a time. `concepts`, `models`, `audio`, or `produce` accept an optional boss ID; completed jobs are reused. Review pending/uncertain ledger submissions before rerunning to avoid duplicate billing. Do not clear the ledger to bypass the cap.

[blender_pipeline.py](assets/bosses/blender_pipeline.py) creates the task scenes and exports through the restricted local transfer bridge. Its `BRIDGE` address must match the development host reachable from Blender. After Blender exports, run `node scripts/optimize-bosses.mjs`; review frames can be encoded with `python3 scripts/encode-boss-review.py`; after audio changes, run `python3 scripts/master-boss-audio.py` and the audio analyzer. No paid regeneration is necessary to run or build the game.
