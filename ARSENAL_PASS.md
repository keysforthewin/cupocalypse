# Expanded arsenal — containment-1.8.0

The kinetic rifle now supports fifteen simultaneously equipped collectible guns and fourteen run-long modifiers. This pass adds ten of each, twenty original symbols, and thirty original audio assets. Existing profile upgrades and currency remain compatible. Combat replays use a new version and reject older rules.

## New equipment

| Weapon | Distinct behavior |
| --- | --- |
| Longspike | Fast rail dart penetrates three targets before modifier bonuses. |
| Stormfork | Electrical bolt chains to two additional nearby enemies. |
| Ripsaw | Spinning disc redirects into moving targets after each of its first two hits. |
| Cinderseed | Incendiary capsule creates a two-second damaging ground patch. |
| Rimefang | Three fanned frost darts slow ordinary enemies for two seconds. |
| Undertow | Slow orb forms a two-second damaging gravity well that pulls ordinary enemies across lanes. |
| Firecracker | Shell separates into five forward-moving bomblets. Fragments cannot split again. |
| Moonreaver | Curved blade returns, with separate target histories for its outward and returning legs. |
| Stitcher | Five tightly grouped needles launch over twelve simulation ticks. |
| Bellhammer | Broad piercing sonic wave briefly reduces ordinary enemy movement. |

| Modifier | Benefit |
| --- | --- |
| Warhead Press | +18% shared damage per level, multiplied with existing damage upgrades. |
| Feedstorm | Additional firing-speed multiplier approaching 2×, on top of Overclock. |
| Titan Bore | Larger rendered projectiles and authoritative hit coverage; size approaches 1.8×. |
| Phase Awl | Up to six extra penetrations; additional levels add damage. |
| Fork Capacitor | Up to four additional chain jumps; additional levels strengthen arcs. |
| Ember Jacket | Repeated hits add independent two-second burns. |
| Deadeye Prism | +8 percentage points of critical chance per level, to 60%; subsequent levels increase critical damage. |
| Breach Teeth | +35% armor damage and +5% unarmored damage per level. |
| Blast Iris | Adds splash to direct projectiles and increases existing blast coverage. |
| Echo Chamber | Up to three delayed repeat volleys; subsequent levels strengthen echoes. |

All ten new modifiers compose across every gun. Existing Split Shot continues to widen the kinetic volley. Native capabilities add to modifier capabilities. Projectiles and queued echoes snapshot earned bonuses when fired. Critical rolls derive from shot serials without consuming encounter randomness. Secondary splash, chain arcs, burns, and fields cannot recursively trigger additional effects. Armor amplification applies only to the shot portion used against armor. Gates intercept ordnance and block secondary damage traveling through their panels. Bosses resist displacement and slowing; committed warnings are preserved.

## Supplies and progression

- Opening spacing remains 36 m before 150 m, then 28 m. The first three supplies retain dependable guns and Plasma Core; the seventh retains Split Shot. Other early supplies draw from the expanded catalog. This prevents the larger pool from diluting the opening's basic firepower.
- After the first boss encounter, road supplies arrive every 16 m independently of wave scheduling. Supply spawning pauses during boss containment.
- Subsequent ordinary kills have a 12% eligible loot chance, a five-second cooldown after a drop, and a guaranteed drop after ten eligible misses.
- Boss victories award one weapon and one modifier, placed ahead of a collecting formation, including Mirror. Surviving boss contact advances the encounter but awards neither item.
- Regular loot uses 40% weapon / 50% modifier / 10% shield-or-recruit categories. Seeded shuffle bags expose every item; a separate 25% duplicate draw levels collected equipment. Loot has its own RNG stream.
- After the first encounter, the equipment-derived strength term in adaptive enemy scaling is halved. Base enemy stats, distance progression, and crowd pressure retain their existing rules.

## Presentation and resource bounds

All twenty additions have custom extruded metallic/emissive symbols with matching vector HUD silhouettes. Every new gun has a separate projectile mesh, flight pattern, launch sound, and impact sound. Chains draw connecting arcs; fields show persistent burning or inward-moving gravity effects. Pickup descriptions wrap, and the complete arsenal scrolls within the viewport.

`python3 scripts/generate-arsenal-audio.py` regenerates thirty deterministic, original WAV assets using the Python standard library. Their synthesis provenance, durations, peak levels, and RMS measurements are in `assets/arsenal-audio.json`. The runtime fetches local audio only. Original weapon samples remain in use.

Projectile storage grows in chunks from 512 to a maximum of 12,288. Delayed burst/echo storage is limited to 4,096 entries. Fields, chain arcs, impacts, sound events, and audible voices have independent limits. Extreme projectile counts are sampled per weapon family for rendering, preserving simulated shots and every weapon silhouette. No projectile or scheduled volley was dropped in the maximum-profile, level-50 Mirror stress test.

## Validation

- **84 tests passed**, including new behavior-specific coverage for all weapons, cumulative modifier snapshots, critical/count ceilings, overflow benefits, piercing counts, collision growth, chain barriers, armor/burn damage, boss immunity, returning target histories, fragment termination, spaced bursts, loot bags/cooldowns/pity, boss-victory versus contact rewards, all-mode reward collection, and fully stacked Mirror storage.
- Existing all-mode replay tests now compare loot state, queued shots, fields, arcs, enemies/statuses, damage totals, and shot payload serials as well as bullets and impacts.
- Production TypeScript/Vite build passed. Ten existing browser integration checks passed with no errors: controls, pause/focus, records/rewards, upgrades, restart, debug exclusion, Mirror gates, and viewport restrictions.
- Browser review decoded **38 sounds** (eight existing plus thirty additions), confirmed non-silent audio without sample clipping, and checked voice limits, mute, pause, all symbols, weapon flight, impact families, and the full HUD. Evidence: `artifacts/arsenal/` and `artifacts/arsenal-browser.log`.

### Paired progression checks

Both versions use the same deterministic, legal-speed, supply-aware steering controller, fresh profiles, and the same seeds. Each run ends on death, completion of the second boss encounter, or a five-minute cutoff. Boss contact is counted separately from actual victories. These are small bot samples, not estimates of human success rates.

| Cohort | First encounter survivors, before → after | Second boss victories among survivors, before → after | Median distance, before → after | Mean pickups, before → after |
| --- | --- | --- | --- | --- |
| 20 fixed seeds | 18 → 19 | 0/18 → 5/19 (0% → 26.3%) | 380 m → 473 m | 6.85 → 13.00 |
| 20 separate holdout seeds | 19 → 19 | 0/19 → 5/19 (0% → 26.3%) | 370 m → 449 m | 7.40 → 12.25 |

Both cohorts exceed the planned 20-percentage-point improvement in second-boss victories. Reports include each seed, actual kills, contact escapes, collected pickups, damage dealt, survival after the first encounter, and termination reason: `artifacts/arsenal/balance-*-before.json` and `balance-*-after.json`.

Reproduce a cohort with `SEEDS=20 SEED_PREFIX=arsenal-fixed npx tsx scripts/arsenal-balance.ts`. Set `BASELINE_SOURCE` to a checkout of the previous version to measure it with the same controller. A broader ten-seed-per-mode sweep was also used during tuning; the paired final reports above are the final progression evidence.

`node scripts/arsenal-performance.mjs` records both quality settings at 1600×1000 with all equipment at levels 1 and 50 in Mirror. The available browser uses SwiftShader software rendering; its frame intervals do not establish a hardware FPS target. Raw results, simulation timings, active/queued projectiles, and dropped-shot counters are in `artifacts/arsenal/performance.json`.

The software performance samples were collected alongside visual capture, so they are workload observations rather than isolated quality-mode comparisons. All four scenarios retained every simulated shot and queued volley; the level-50 sample held 9,316 active projectiles and 1,398 queued shots. Simulation p95 ranged from 2.1–12.4 ms in these short samples. Software-rendered frame p95 ranged from 2.9–6.4 seconds; a physical GPU remains necessary for meaningful gameplay frame-rate validation.
