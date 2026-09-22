# Pyramid formation and varied death effects

Historical record of the first pass. The crowd shape and encounter balance are now superseded by [BLOB_ESCALATION_PASS.md](BLOB_ESCALATION_PASS.md); the varied death effects remain.

The squad now forms a widening triangle with a steerable firing tip. About 100 soldiers occupy one lane. Recruitment has no 600-soldier ceiling. Large armies expose rear ranks to adjacent threats and eventually the curbs; casualties reduce the population and automatically rebuild a smaller pyramid.

## Gameplay

- A shared analytic triangle footprint drives lane hazards, enemy contact, barricades, and curb exposure. The renderer follows the same width, depth, and firing origin.
- Barricades remain in the scene after the tip crosses, until they have passed the rear ranks. Enemies that miss the tip can also collide with the widening rear.
- A threat can remove no more than the number of soldiers exposed to its lateral strip. Shifting the tip away from a threat reduces that exposure.
- Curb losses run every 150 ms, bypass shields, and stop when the survivors fit. Small squads can clear a lane without losses; oversized squads can have no lossless route.
- Recruitment, gate multiplication, boss rewards, and Sudden Death rewards retain amounts over 600. The HUD explains wide formations and the intel panel describes the new rules.
- Mirror retains linked control and shared rewards; each half-width copy contributes half the army's collision weight. Both firing tips have markers and muzzle flashes.
- The route checker and reference bot now account for footprint exposure. Old recordings are separated by replay version `containment-1.5.0`.

## Effects and rendering

- Six enemy death families: collapse, tumble, shred, rupture, acid, and armor fragmentation; additional uniformed soldier casualties.
- Seeded body proportions, clothing colors, fragment counts, impulses, angular velocities, lifetime, decal lobes, and mist patterns. Variation is independent of encounter RNG and reproducible on replay.
- Separate torso, limb, head, plate/boot, bone, tissue, and spark batches. Airborne debris follows ballistic trajectories, bounces, and settles; linked bodies collapse or tumble together.
- Procedural shaders add torn and grainy surfaces, wet irregular stains, turbulent mist, transient flashes, expanding shockwaves, and soft ground contact shadows. Armor, cloth, bone, and tissue have different material responses.
- Old death events are retained preferentially over expendable hit puffs under pool pressure. Effects remain bounded to 180 events.
- Crowd LOD: 1,385 triangles per soldier, down from 4,133. At most 1,600 figures per formation represent the complete gameplay footprint, including troop counts beyond that budget. Camera framing keeps the base visible.
- Varied filtered-noise death cues and seeded attack debris replace repeated generic bursts. Infantry materials use diffuse cloth response instead of glTF's default full metallic factor.

## Verification

- `npm run build`: TypeScript and production build pass.
- `npm test`: 54 tests pass, including new growth, footprint, curb convergence, rear-rank collision, Mirror conservation, effect-pool priority, ballistic motion, and deterministic visual replay cases.
- `node scripts/browser-tests.mjs`: 10 normal interaction/progression checks pass, with no browser errors.
- `SEEDS=5 SEED_PREFIX=pyramid npm run validate`: 30 reference-bot runs across all six modes. Detailed outcomes are in `artifacts/balance-pyramid-fresh.json`; this is a balance sample, not a guarantee of a particular survival time.
- `node scripts/effects-review.mjs`: formation captures at 24, 100, 600, and 1,600 soldiers; six death families at four ages; a 2,400-soldier left-edge attrition scenario. See `artifacts/effects-pyramid/`.
- `QUALITY=high node scripts/effects-review.mjs`: effect checks pass with High-quality postprocessing and shadows, with no shader/browser errors; results in `artifacts/effects-pyramid/high/`.
- `node scripts/pyramid-label-review.mjs`: the count stays at the base after steering to the left (anchor `[-3, 0, 4.7]`, label at 905 px in the 1,000 px viewport), with no browser errors. See `steered-pyramid.png`.

Browser checks use Chromium with SwiftShader software rendering. They verify shader compilation, visible composition and interactions; they do not establish a hardware GPU frame-rate target.
