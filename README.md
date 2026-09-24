# The Last Fruit: Cupocalypse

A desktop 3D combat runner built with React 19, Vite, TypeScript, React Three Fiber, and Three.js. All six protocols share a deterministic 60 Hz simulation, ten infected enemy classes, an eight-boss campaign, and permanent progression.

## Run

Docker is the only required host tool. Source, dependencies, assets, and reports stay on the host through bind mounts; the tools image contains no project code or dependencies.

```sh
mkdir -p node_modules
docker compose run --rm game npm ci
docker compose up -d game
```

Open **http://localhost:5173** in a desktop browser. If Docker created `node_modules` as root, repair it with `docker compose run --rm --user root game chown -R 1000:1000 /app/node_modules`. The default development user is UID/GID 1000; adjust `compose.yaml` for another host user.

Use A/D, arrow keys, or horizontal mouse drag to steer. Firing is automatic. New gun pickups stay equipped and fire together. Move the mouse without dragging to guide Wisp orbs; A/D steers the squad independently. Escape/P pauses; focus loss pauses automatically. Backtick opens the debug inspector and permanently disqualifies that run from progression and records. The game requires WebGL 2 and a viewport at least 900 pixels wide.

## Implemented

The audio overhaul now ships all 24 user-approved pilot takes across eight cues, with randomized variation that avoids consecutive repeats. See [audio review status, scoring, and commands](AUDIO_REVIEW.md) for the listening workbench and remaining collection coverage.

- Shared top-10 distance leaderboards for each mission protocol on the front page and results screen, with remembered names and no login.

- Classic, Reverse, Swarm, Fortress, Mirror, and Sudden Death; mode records and shared upgrades.
- Shootable arithmetic gate pairs, barricades, funnels, supply breaks, finite shields, fifteen collectible guns that fire alongside the kinetic rifle, and fourteen permanent, stacking weapon modifiers. Mirrored formations cross mirrored copies of one authoritative gate choice.
- Walker, Runner, Crawler, Riot Guard, Charger, Spitter, Bloater, Screamer, Carrier, and Gunner. Separate body/armor values, committed warnings, prepared Screamer pulses, corpse fragments, blood, and bounded effects.
- Eight mandatory bosses: Bulwark, Broodmass, Congregation, Grave Marshal, Widow of the Salvo, Ossuary Engine, Seraph of the Wound, and The Last Witness. Distance pauses in each arena; the eighth kill ends the campaign at 1,200 m with a victory sequence. The five new bosses use Meshy models refined and animated in Blender, distinct melee/projectile patterns, escalating sound, and protected phase transformations. See [boss designs, quality rubric, and review evidence](BOSS_REVIEW.md).
- Local profile storage, upgrade purchases, seed entry, pause/restart, mute, quality settings, replay export/import, and last-operation playback.
- Saved generated meshes with skeletons and animation, separate distant LODs, instanced squad rendering, batched scenery, weathered materials, extended shadow coverage, restrained bloom, generated ElevenLabs weapon sounds, and synthesized enemy combat cues. Gameplay never calls a generation API.

## Shared leaderboards and production server

The development server includes the score API. For production, use Node 22.13+ (Node 24 recommended):

```sh
npm ci
npm run build
npm start
```

Open `http://localhost:3000`. `PORT` overrides the port. The server serves both `dist/` and the score API; a static-only host cannot save shared scores. Run one application instance with a persistent disk. `SCORES_DB` sets the SQLite path (default `data/scores.sqlite`); preserve this directory across deployments and back up the database. Local databases, credentials, dependencies, builds, and generated review artifacts are excluded from Git.

Alternatively, `docker compose --profile production up -d --build production` serves port 3000 and stores scores in the `scores` Docker volume.

Each mission protocol has its own distance leaderboard showing ten distinct browser identities, with each player's furthest run in that protocol. Changing the mission protocol selector updates the front-page list; the results screen shows the completed run's protocol. Distance is whole meters; eliminations break distance ties, then earlier submissions win. Existing scores retain their recorded protocols. The leaderboard API requires a valid `mode` query parameter (for example, `/api/leaderboards?mode=Classic`). Names can repeat because no account or unique-name registration is required. A name is requested after the first normal round, stored with the local profile, and used automatically for later submissions. Settings changes the name for future runs; previous entries retain their submitted names. Clearing browser storage creates a new identity. Practice and replay runs are excluded by the client. These are casual, client-reported scores, not server-verified competitive records.

The list refreshes every 30 seconds, when the selected protocol changes, and after a successful submission. Failed submissions show a retry button on the result screen; retrying the same round cannot duplicate it. Leaving that screen after a failed submission discards the unsaved result.

## Asset caching and releases

Production serves versioned models, sounds, images, fonts, JavaScript and CSS with `Cache-Control: public, max-age=31536000, immutable` (one year). Returning browsers and shared caches reuse their stored copies without rechecking every asset. Browsers can still evict cached files when storage is low or the player clears their cache.

Every build hashes each file in `public/` and writes `dist/asset-manifest.json`. Runtime requests, CSS artwork and HTML icons use `?v=<content hash>`; Vite fingerprints the generated bundles and bundled fonts. Unchanged files retain the same URL across builds and deployments, regardless of timestamps. Changing an asset automatically changes its URL. Publish the entire `dist/` together with the server; the manifest is required by `npm start`.

HTML and unversioned files use `no-cache` with content-based ETags, so a normal visit discovers the current release while unchanged responses can return 304. Leaderboards and score submissions remain `no-store`. A request using an outdated asset version redirects without caching to the current version, including behind a subpath proxy.

Usually no manual version bump is needed. To force every public asset to refresh, change `ASSET_CACHE_VERSION` from its default `1`, then rebuild and deploy:

```sh
ASSET_CACHE_VERSION=2 npm run build
# Or build and deploy in one step:
ASSET_CACHE_VERSION=2 ./deploy.sh
```

`deploy.sh` also reads this setting from `.env`; the production Docker build accepts it through Compose or `--build-arg ASSET_CACHE_VERSION=2`. Keep the value stable between releases to preserve unchanged downloads. Proxies/CDNs should preserve origin Cache-Control headers and include the query string in their cache key. Development mode keeps assets unversioned for hot reload.

Validation: `npm test` covers content changes, manual resets, headers, conditional requests, stale versions and API freshness. After a production build, `npx tsx scripts/cache-check.ts` verifies that a returning browser transfers zero bytes for representative assets.

## License

Project code is available under the [MIT License](LICENSE). Bundled fonts retain their supplied licenses in `assets/licenses/`; generated asset provenance remains in `assets/`.

## Performance pass — containment-2.2.0

Late runs used to stutter once several modifiers stacked: thousands of projectiles per second, each drawn with a body, core, halo and up to eight trail segments, plus per-tick allocations that kept the garbage collector busy. This pass keeps damage per second and enemy escalation where they were while putting far fewer objects on screen and through the simulation.

- **Fewer, heavier projectiles.** Overclock and Feedstorm now raise the firing cadence by at most 1.8× and 1.4× (formerly 3× and 2×); the rest of their bonus is applied to each projectile's damage and gate power, so damage per second is unchanged. Split Shot stops widening at five projectiles and pays later levels as damage. Echo Chamber fires at most two echoes at 0.45× instead of three at 0.3×. Stitcher fires three needles at 0.9× instead of five at 0.55×. Enemy escalation still uses the old damage-per-second and volley-coverage terms, so difficulty curves are unchanged.
- **Memory leak.** Each enemy attached its wound and boss-phase markers through a react-three-fiber `createPortal`. A portal mirrors the root store, subscribes to it for the life of the canvas without ever unsubscribing, and rebuilds its state on every root update with a `setEvents` closure that captures the previous state, so every enemy that had ever spawned kept an ever-growing chain of state copies alive. In the user's own replay the GC-settled heap climbed from 108 MB to 2.2 GB in seven minutes. The markers are now plain meshes added to the spine bone.
- **Simulation churn.** Shot slots reuse their trail and hit lists, trail points are recycled instead of allocated every tick, swept-contact lists come from a scratch pool, piercing decrements the shot's own payload, enemy motions, burns and lightning arcs compact in place, and the crowd envelope is memoized per tick. The pool ceiling is 4,096 shots.
- **Rendering.** Instanced projectile, debris and squad buffers upload only the instances in use instead of every slot every frame, pulse halos and trails are shorter and dimmer, at most 80 projectiles of a kind draw per frame, and debris poses are written into a scratch object. Lane warnings, gate highlights and buff auras animate in `useFrame` instead of React renders, and the canvas subtree only reconciles when entities change or every 100 ms while the HUD keeps its 20 Hz refresh.
- **Measurement.** `NODE_OPTIONS=--expose-gc npx tsx scripts/perf-sim.ts <label>` plays the deterministic simulation with the bot (`AUTOLOOT=12 ARMY_FLOOR=250` models a strong player) and reports tick cost, GC counts, heap, and pool sizes per 30 s window into `artifacts/perf/`. `node scripts/perf-trace-summary.mjs <trace.json.gz>` aggregates CPU self time from a Chrome performance trace, `node scripts/perf-heap-summary.mjs a.heapsnapshot b.heapsnapshot` diffs heap snapshots by constructor, and `node scripts/perf-browser-compare.mjs artifacts/perf/browser-before-bot.json artifacts/perf/browser-after-bot.json` tabulates in-browser sampler runs (fps, frame p95/max, simulation ms per tick, settled heap, live projectiles) side by side. A `VITE_PERF_HOOKS=1` build exposes the `window.__gateRunner` hooks (`autopilot`, `stats`) in a production bundle. Replays from `containment-2.1.0` are rejected because combat rules changed.
- **Results.** Same eight-minute assisted-bot scenario (seed `QA-SEED`, loot every 12 s, army floor 250, reaching boss 4 with 20 gun levels) on production bundles of the previous and current code in desktop Chrome: settled heap growth 1,376 MB → 42 MB, worst frame 1,683 ms → 483 ms (217 ms after the first shader compile), longest simulation tick 52.8 ms → 2.8 ms, mean simulation cost 0.40 → 0.24 ms per tick, lowest ten-second average 46 → 57 fps. Dev-server heap snapshots at 90 s went from 75,703 live `setEvents` closures and 17,703 `PerformanceMeasure` entries to 1 and 156. Sample files live in `artifacts/perf/browser-*.json`.

## Super weapons — containment-1.9.0

The armory offers **27 permanent super weapons**, each with a distinct mechanic, procedural 3D identity, and locally shipped sound. Start with none; buy weapons with credits and equip up to three anytime, including during a run or from the death screen. Opening the Armory pauses combat and makes credits earned so far available to spend. **Q / E** switches between equipped weapons, **Space** unleashes the selected charged weapon, and **H** shows or hides the controls guide. Loadout changes apply immediately during a run and carry into your next deployment. New weapons start uncharged; swapping preserves each weapon’s charge and active powers finish normally.

Only the selected reactor gains energy from ordinary kills. Each slot retains its own charge when switched away; super-powered kills cannot refill it. Initial requirements are 17 kills, or 30 in Swarm. Later quotas adapt to recent kill rate to target about 25 seconds of focused charging, without a hard timer—roughly three times faster than before. The compact combat display shows just the selected weapon's charge bar and its name underneath; the bar glows when ready. Q / E switches weapons and Space activates them.

See [SUPER_WEAPONS.md](SUPER_WEAPONS.md) for the complete collection, combat rules, compatibility, and review commands. Existing profile progression is preserved; replays use the new balance version.

## Expanded arsenal — containment-1.8.0

Ten more guns: **Longspike**, **Stormfork**, **Ripsaw**, **Cinderseed**, **Rimefang**, **Undertow**, **Firecracker**, **Moonreaver**, **Stitcher**, and **Bellhammer**. Their rail penetration, lightning chains, redirected saws, burning patches, slowing darts, gravity wells, cluster fragments, returning blades, needle bursts, and sonic waves all operate alongside the existing arsenal.

Ten more run-long modifiers: **Warhead Press**, **Feedstorm**, **Titan Bore**, **Phase Awl**, **Fork Capacitor**, **Ember Jacket**, **Deadeye Prism**, **Breach Teeth**, **Blast Iris**, and **Echo Chamber**. Every gun benefits from shared damage, cadence, collision-size, piercing, chaining, burning, critical-hit, armor, splash, and echo bonuses. Count-limited modifiers continue increasing damage after their physical count limit. Echoes and fragments inherit shot snapshots; secondary effects cannot recursively multiply.

Power-up availability is reduced by roughly 50%: opening supplies use 72/56 m spacing and retain their dependable first three rewards. After the first boss encounter, supplies arrive every **32 m**; ordinary kills can drop loot (6% eligible chance, ten-second cooldown, twenty-miss guarantee). Boss victories award one pickup, alternating weapons and modifiers. Equipment-driven enemy scaling is reduced after the first encounter, while baseline distance and crowd difficulty remain.

All twenty additions have original procedural 3D symbols and matching HUD glyphs. Each new gun has its own projectile silhouette and sound family. Thirty original, deterministic synthesized WAV assets are shipped locally; regenerate them with `python3 scripts/generate-arsenal-audio.py`. The complete arsenal and modifier levels are scrollable in the HUD.

See [ARSENAL_PASS.md](ARSENAL_PASS.md) for validation and before/after balance measurements. `node scripts/arsenal-review.mjs` captures symbols, weapons, impacts, the stacked arsenal, and sound/mute/pause checks. `node scripts/arsenal-performance.mjs` measures both quality settings. Existing profiles remain compatible; old replays are rejected because combat rules changed.

## Animation and combat pass

See [ANIMATION_PASS.md](ANIMATION_PASS.md) for the new lateral squad strides, infected gestures, synchronized boss attack animations, denser encounters, and damage rebalance. Formation strength now grows without a gameplay cap; its pyramid footprint creates flank and curb losses. Weapon damage levels use diminishing returns. Replays use `containment-1.7.0`.

## Rounded crowd and escalation pass

The current balance (`containment-2.3.0`) halves every fire rate: the kinetic gun starts at 3 shots per second (up to 6 with a large army, previously 6 to 12) and every pickup gun's interval is doubled. It preserves the first 60 m, then increases distance-based strength by 1.25 per meter and brings equipment-driven durability to full strength by 270 m. Attack damage gains an additional multiplier of ×1.75 at the first boss and ×3 at the second, on top of distance scaling. Warning times, spawn spacing, group-size rules, movement speed, and boss scheduling retain their existing curves. Permanent upgrade levels now grant +20% starting army, +12% weapon damage, and +8% kinetic fire rate. Runs award one credit per 4 m and 100 credits times the boss's level for each defeated boss (100, then 200, then 300). Signs now improve at a quarter of the previous rate, and a single hit never adds more than 2 soldiers to a sign, so gates no longer balloon into four-digit reinforcements. Earlier balance-version replays are incompatible; saved purchases remain intact. See [BALANCE_REVIEW.md](BALANCE_REVIEW.md) for the paired automated runs and their limits.

Steering pulls the tip of a rounded crowd with a flat rear. The back follows sideways with a short delay, while its road position stays fixed just above the super-weapon charge bar. Recruitment and sidewalk compression extend the crowd forward and move the firing origin with it; losses pull the front back without moving the rear. Camera framing keeps that rear alignment on window resize. About 100 soldiers fit a lane. Small curb losses remain, while most troops stay on the road. The same deformed crowd is used for enemy, barricade, and lane-attack collisions. Gates, recruits, boss rewards, and Sudden Death kills can all grow the army beyond 600.

The opening uses 2–3 enemies per group and roughly 3.4-second gaps. Early supply groups are spaced 72 m apart, later 56 m apart. Multiplier gates are absent before 100 m, occur on roughly 2.5% of panels until 250 m, and 6% afterward. Permanent weapon bonuses retain their full value. After the opening, newly spawned enemies gain health, armor, speed, and group size in response to damage, fire rate, volley coverage, and crowd growth. Existing enemy HP does not change when an upgrade is collected. Mixed armored targets and faster attackers occupy different lanes, preserving target choices. See [BLOB_ESCALATION_PASS.md](BLOB_ESCALATION_PASS.md) for verification and screenshots.

Deaths choose between collapses, tumbling bodies, directional dismemberment, rupture bursts, acid effects, and armor fragmentation. Cosmetic seeds vary body proportions, debris counts, trajectories, bounces, rotation, colors, lifetime, wet stains, mist, and flashes without consuming encounter randomness. Soldier casualties shed uniformed remains at the impact location. Procedural shaders provide torn surfaces, turbulent plumes, soft flashes and shockwaves, irregular wet decals, and contact shadows. Death audio varies with the effect type.

The simulation uses the full troop count, a trailing crowd position, and density-weighted rounded cross sections that follow the same sidewalk confinement as the renderer. Rendering shows up to 1,600 figures per formation; above that, figures represent multiple soldiers across the full growing footprint. This is a rendering budget, not a recruitment limit. `node scripts/prepare-crowd.mjs` regenerates the crowd mesh from the existing soldier asset. See [EFFECTS_PYRAMID_PASS.md](EFFECTS_PYRAMID_PASS.md) for verification and review artifacts.

## Original projectile arsenal pass (historical)

Collect **Hellhound** (homing missiles), **Helix** (twin weaving plasma), **Wildshard** (erratic shards), **Wisp** (mouse-guided orbs), and **Thunder** (arcing explosive shells). All five fire independently alongside the kinetic rifle; collecting a new gun never replaces another. Duplicates increase that gun's damage for the rest of the run. Damage modifiers strengthen every gun and Overclock speeds their independent firing cycles. Split Shot widens the kinetic volley. The HUD lists the equipped arsenal and levels.

Projectiles travel at visible speeds, carry shaped ammunition and trails, and create colored impact flashes, sparks, shockwaves, smoke, and turbulent fireballs. Missiles reacquire live targets; shells and energy payloads deal distance-weighted splash damage. Shots improve each gate once and continue through to damage enemies behind it. Wisp's road marker shows its steering lane; moving the mouse guides live orbs while keyboard movement remains independent. Replay `containment-1.7.0` records both squad movement and quantized aim.

Eight locally shipped ElevenLabs effects supply six distinct launch sounds, a compact impact, and a heavy detonation. Offline bass/treble mastering, short envelopes, stereo positioning, per-sound voice limits, and a shared compressor control simultaneous fire. The game only fetches local MP3s; it never needs a provider key. Generation provenance is in `assets/originals/weapon-audio/`. `node scripts/generate-weapon-audio.mjs` resumes saved assets without resubmitting completed requests; credentials are read only by this offline script.

See [PROJECTILE_PASS.md](PROJECTILE_PASS.md) for implementation and validation. Run `node scripts/projectile-review.mjs` for browser screenshots, mouse steering, audio decode, mute/pause and error checks; `python3 scripts/analyze-weapon-audio.py` checks the mastered files.

## Weapon and visual quality pass

The four original weapon modifiers also last the entire run. Duplicates add levels: Split Shot expands to three, then five projectiles, with further levels adding damage (the performance pass below folded the former seven-shot volley into per-shot damage); Plasma Core and Nova Reactor increase damage, and Overclock increases fire rate toward a bounded ceiling. All pickup orders preserve the full combination: every Split Shot projectile receives Plasma Core and Nova Reactor damage, at the Overclock fire rate. The HUD shows the kinetic volley, damage, fire rate, equipped guns, and permanent levels. Projectiles combine plasma cores with upgrade-colored halos and retain their appearance in flight. A new run starts with the base weapon; shields still absorb a finite amount of damage. Every bullet impact immediately improves a sign and pulses its number; damage upgrades also increase improvement per hit. Multiplier signs can improve past ×1.6. Sudden Death retains its neutral-only gates. Replay version `containment-1.7.0` includes the pyramid collision rules and separates these rules from previous recordings.

Eleven distinct spinning 3D pickups use metallic housings, emissive inlays, floating animation, ground halos and local lighting. The street uses asphalt wear, masonry, framed glazing, storefronts, paving, drainage, service covers, tapered barriers and street furniture. Fifteen prebuilt 20 m chunks recycle from 70 m behind the origin to 230 m ahead; the sun frustum includes off-screen shadow casters, with 4096 px shadows on High and 2048 px on Performance.

Run `node scripts/quality-review.mjs` against the local dev server for the pickup, weapon and recycling screenshots and browser report in `artifacts/quality/`. Set `GAME_URL` for another server address. The script uses Playwright's installed Chromium.

## Validate

```sh
docker compose run --rm game npm run build
docker compose run --rm game npm test
docker compose run --rm game sh scripts/final-validation.sh

docker compose build tooling
docker compose run --rm tooling npx playwright install ffmpeg
docker compose run --rm tooling npm run capture
docker compose run --rm tooling node scripts/browser-tests.mjs
docker compose run --rm tooling node scripts/review.mjs
docker compose run --rm tooling node scripts/record.mjs
docker compose run --rm tooling node scripts/performance.mjs
docker compose run --rm game node scripts/security.mjs
```

`final-validation.sh` runs 50 fixed fresh-profile seeds per mode, a separate 50-seed holdout set per mode, 50 fully upgraded seeds per mode, and a career progression simulation. The bot uses the same movement speed and tick function as the browser; it prefers higher-value gates, aims at threats, and leaves warned lanes. Runs are censored at 15 simulated minutes and explicitly report that termination reason. The generated JSON files contain every seed, distance, duration, peak army, kill count, and termination reason.

Read [VALIDATION.md](VALIDATION.md) for measured results and remaining acceptance limits. Screenshots, the full-page `artifacts/combat-full-ui.webm` recording with chapter timestamps, build/test output, frame-time measurements, and complete run distributions are in `artifacts/`. The video includes DOM-rendered numbers and warnings as well as the 3D canvas.

## Architecture

| Area                                                | Source                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| Fixed-tick rules, encounters, collisions, entities  | `src/game/simulation.ts`, `types.ts`                                  |
| Seeded RNG, legal-speed bot, route validation       | `src/game/rng.ts`, `bot.ts`, `fairness.ts`                            |
| Profile validation, upgrades, rewards               | `src/game/persistence.ts`                                             |
| Generated weapon audio and procedural enemy cues    | `src/game/audio.ts`                                                   |
| Three.js composition, batching, instancing, effects | `src/render/Scene.tsx`                                                |
| Generated character animation and damage treatment  | `src/render/Character.tsx`                                            |
| UI, input, pause lifecycle, replay controls         | `src/App.tsx`, `src/style.css`                                        |
| Generation and asset tooling                        | `scripts/generate.mjs`, `process-assets.py`, `rig.py`, `optimize.mjs` |

Replay files preserve balance version, seed, mode, starting upgrades, debug status, and quantized tick inputs. Incompatible versions are rejected. Renderer state and wall-clock timing do not influence simulation RNG. Simulation tests compare reconstructed enemy, hazard, projectile, and RNG state. Cosmetic render counts never modify authoritative army strength.

## Asset pipeline and budget

Runtime assets are included; no credentials are needed to play, install, build, or test. Optional generation uses `FAL_KEY` only in the `generation` service. `.env` is ignored, Vite does not load it, and the production bundle is scanned for credentials and generation API references.

```sh
# Resume existing ledger entries without repeating paid submissions.
docker compose run --rm generation node scripts/generate.mjs all
# Regenerate a new asset only with a new, explicitly budgeted job name.

docker compose run --rm tooling node scripts/prepare-roster.mjs
docker compose run --rm tooling node scripts/optimize.mjs
```

The ledger reserves against the $20 comparison / $60 production / $20 correction buckets before submission. Exclusive locking protects concurrent updates. Ambiguous submissions are not automatically retried. Originals, prompts, provider outputs, and provenance live in `assets/originals/` and `assets/ledger.json`; Blender exports and comparison renders are in `assets/processed/`; optimized web assets are in `public/assets/runtime/`.

The comparison used a Meshy V6 soldier with provider rigging and a FLUX-to-TRELLIS infected character. Meshy supplied the equipped squad model; TRELLIS preserved the infected silhouettes and material detail more effectively for this camera. The roster uses shared authored humanoid bone layouts and role-specific low-body / multi-head rigs. The rigging is automated from those layouts and merits further animator review before a commercial art sign-off.

The conservative reservation total is **$41.60**, including the rejected Meshy request; this is **not a provider invoice**. No requests remain pending. See `artifacts/generation-budget.json`. The first legacy comparison ledger had a concurrent-write defect; its completed TRELLIS result was recovered from the original response without resubmission. The supported generator now uses an exclusive ledger lock.

Provider references: [FAL queue documentation](https://docs.fal.ai/model-apis/model-endpoints/queue), [Meshy generation and rigging schema](https://fal.ai/models/fal-ai/meshy/v6-preview/text-to-3d/api), [TRELLIS schema](https://fal.ai/models/fal-ai/trellis/api). Fonts are locally hosted Barlow Condensed and IBM Plex Mono under their supplied open font licenses.

## Procedural biome scenery

Each unpinned deployment uses a fresh random seed, including **Deploy Again**. The displayed seed is used for the next deployment; pin it to repeat the same map across runs and reloads. Replays always use their recorded seed.

The seed chooses the starting biome and the route through **Iron District**, **Haven Estates**, **Golden Hinterlands**, **Blackpine Wilds**, and **Ashfall Expanse** in shuffled groups. Each group covers all five environments without consecutive repeats. Transitions begin every 60 gameplay seconds and travel through mixed scenery for roughly 20 seconds. Pausing freezes the journey; cosmetic randomness does not affect combat or replays.

Scenery combines procedural architecture, terrain, and vegetation with Blender-refined Meshy assets and authored landmarks. High and Performance use the same route with different foliage density and asset LODs. The next road section is prepared incrementally before recycling.

Visual review commands (against the development server):

```sh
CDP=http://127.0.0.1:9222 FULL=1 OUTPUT=artifacts/biomes/final node scripts/biome-review.mjs
node scripts/biome-runtime.mjs artifacts/biomes/final
node scripts/biome-film.mjs artifacts/biomes/final
node scripts/biome-evaluate.mjs artifacts/biomes/final
node scripts/biome-evaluator-check.mjs artifacts/biomes/final
```

The capture script also supports local Playwright without `CDP`. The evaluator fails until each biome has six complete visual assessments above 95, all transition evidence, matching source/asset hashes, and passing runtime checks. Scores require actual visual inspection and written observations; they are not synthesized from test results. See [BIOME_REVIEW.md](BIOME_REVIEW.md) and [asset provenance](assets/biomes/README.md).

The completed [review gallery](artifacts/biomes/final/index.html) contains the five biome sets, model inspections, all directed transition pairs and a transition film. Lowest reviewed scores: city 97, suburb 96, country 96, forest 96, ash 97. These are subjective scores under the documented rubric. During capture, keep source and tooling files unchanged to avoid development-server reloads.
