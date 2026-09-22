# The Last Fruit: Cupocalypse

A desktop 3D endless runner built with React 19, Vite, TypeScript, React Three Fiber, and Three.js. All six protocols share a deterministic 60 Hz simulation, ten infected enemy classes, the three-boss rotation, and permanent progression.

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

- Shared top-10 distance and kill leaderboards on the front page and results screen, with remembered names and no login.

- Classic, Reverse, Swarm, Fortress, Mirror, and Sudden Death; mode records and shared upgrades.
- Shootable arithmetic gate pairs, barricades, funnels, supply breaks, finite shields, fifteen collectible guns that fire alongside the kinetic rifle, and fourteen permanent, stacking weapon modifiers. Mirrored formations cross mirrored copies of one authoritative gate choice.
- Walker, Runner, Crawler, Riot Guard, Charger, Spitter, Bloater, Screamer, Carrier, and Gunner. Separate body/armor values, committed warnings, prepared Screamer pulses, corpse fragments, blood, and bounded effects.
- Bulwark, Broodmass, and Congregation, with isolated boss stretches, phase changes, alternate pool/summon waves, and previewed strike sequences. Boss contact is survivable and gives no kill reward.
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

Each leaderboard shows ten distinct browser identities, with that player's best run for the selected metric across all protocols. Distance is whole meters; eliminations break distance ties, and distance breaks elimination ties, then earlier submissions win. Names can repeat because no account or unique-name registration is required. A name is requested after the first normal round, stored with the local profile, and used automatically for later submissions. Settings changes the name for future runs; previous entries retain their submitted names. Clearing browser storage creates a new identity. Practice and replay runs are excluded by the client. These are casual, client-reported scores, not server-verified competitive records.

Both lists refresh every 30 seconds and after a successful submission. Failed submissions show a retry button on the result screen; retrying the same round cannot duplicate it. Leaving that screen after a failed submission discards the unsaved result.

## License

Project code is available under the [MIT License](LICENSE). Bundled fonts retain their supplied licenses in `assets/licenses/`; generated asset provenance remains in `assets/`.

## Super weapons — containment-1.9.0

The main-menu armory now offers **27 permanent super weapons**, each with a distinct mechanic, procedural 3D identity, and locally shipped sound. Start with none; buy weapons with credits and equip up to three at base. **Q / E** switches between equipped weapons, **Space** unleashes the selected charged weapon, and **H** shows or hides the controls guide. Equipment stays locked for the operation, while active powers can combine.

Only the selected reactor gains energy from ordinary kills. Each slot retains its own charge when switched away; super-powered kills cannot refill it. Initial requirements are 50 kills, or 90 in Swarm. Later quotas adapt to recent kill rate to target about 75 seconds of focused charging, without a hard timer. A prominent animated reactor, stored-slot meters, milestone sounds, energy motes, and a full-charge transformation make progress visible.

See [SUPER_WEAPONS.md](SUPER_WEAPONS.md) for the complete collection, combat rules, compatibility, and review commands. Existing profile progression is preserved; replays use the new balance version.

## Expanded arsenal — containment-1.8.0

Ten more guns: **Longspike**, **Stormfork**, **Ripsaw**, **Cinderseed**, **Rimefang**, **Undertow**, **Firecracker**, **Moonreaver**, **Stitcher**, and **Bellhammer**. Their rail penetration, lightning chains, redirected saws, burning patches, slowing darts, gravity wells, cluster fragments, returning blades, needle bursts, and sonic waves all operate alongside the existing arsenal.

Ten more run-long modifiers: **Warhead Press**, **Feedstorm**, **Titan Bore**, **Phase Awl**, **Fork Capacitor**, **Ember Jacket**, **Deadeye Prism**, **Breach Teeth**, **Blast Iris**, and **Echo Chamber**. Every gun benefits from shared damage, cadence, collision-size, piercing, chaining, burning, critical-hit, armor, splash, and echo bonuses. Count-limited modifiers continue increasing damage after their physical count limit. Echoes and fragments inherit shot snapshots; secondary effects cannot recursively multiply.

Opening supplies keep their 36/28 m spacing and dependable first three rewards. The larger catalog enters the early supply pool before the first boss. After the first boss encounter, supplies arrive every **16 m**; ordinary kills can drop loot (12% eligible chance, five-second cooldown, ten-miss guarantee). Boss victories award a weapon and a modifier. Equipment-driven enemy scaling is reduced after the first encounter, while baseline distance and crowd difficulty remain.

All twenty additions have original procedural 3D symbols and matching HUD glyphs. Each new gun has its own projectile silhouette and sound family. Thirty original, deterministic synthesized WAV assets are shipped locally; regenerate them with `python3 scripts/generate-arsenal-audio.py`. The complete arsenal and modifier levels are scrollable in the HUD.

See [ARSENAL_PASS.md](ARSENAL_PASS.md) for validation and before/after balance measurements. `node scripts/arsenal-review.mjs` captures symbols, weapons, impacts, the stacked arsenal, and sound/mute/pause checks. `node scripts/arsenal-performance.mjs` measures both quality settings. Existing profiles remain compatible; old replays are rejected because combat rules changed.

## Animation and combat pass

See [ANIMATION_PASS.md](ANIMATION_PASS.md) for the new lateral squad strides, infected gestures, synchronized boss attack animations, denser encounters, and damage rebalance. Formation strength now grows without a gameplay cap; its pyramid footprint creates flank and curb losses. Weapon damage levels use diminishing returns. Replays use `containment-1.7.0`.

## Rounded crowd and escalation pass

Steering pulls the tip of a rounded crowd with a flat rear. The back follows with a short delay and piles up against the sidewalk; compression extends the crowd forward and moves the firing origin with it. About 100 soldiers fit a lane. Small curb losses remain, while most troops stay on the road. The same deformed crowd is used for enemy, barricade, and lane-attack collisions. Gates, recruits, boss rewards, and Sudden Death kills can all grow the army beyond 600.

The opening uses 2–3 enemies per group and roughly 3.4-second gaps. Early supply groups are spaced 36 m apart, later 28 m apart. Multiplier gates are absent before 100 m, occur on roughly 2.5% of panels until 250 m, and 6% afterward. Permanent weapon bonuses retain their full value. After the opening, newly spawned enemies gain health, armor, speed, and group size in response to damage, fire rate, volley coverage, and crowd growth. Existing enemy HP does not change when an upgrade is collected. Mixed armored targets and faster attackers occupy different lanes, preserving target choices. See [BLOB_ESCALATION_PASS.md](BLOB_ESCALATION_PASS.md) for verification and screenshots.

Deaths choose between collapses, tumbling bodies, directional dismemberment, rupture bursts, acid effects, and armor fragmentation. Cosmetic seeds vary body proportions, debris counts, trajectories, bounces, rotation, colors, lifetime, wet stains, mist, and flashes without consuming encounter randomness. Soldier casualties shed uniformed remains at the impact location. Procedural shaders provide torn surfaces, turbulent plumes, soft flashes and shockwaves, irregular wet decals, and contact shadows. Death audio varies with the effect type.

The simulation uses the full troop count, a trailing crowd position, and density-weighted rounded cross sections that follow the same sidewalk confinement as the renderer. Rendering shows up to 1,600 figures per formation; above that, figures represent multiple soldiers across the full growing footprint. This is a rendering budget, not a recruitment limit. `node scripts/prepare-crowd.mjs` regenerates the crowd mesh from the existing soldier asset. See [EFFECTS_PYRAMID_PASS.md](EFFECTS_PYRAMID_PASS.md) for verification and review artifacts.

## Original projectile arsenal pass (historical)

Collect **Hellhound** (homing missiles), **Helix** (twin weaving plasma), **Wildshard** (erratic shards), **Wisp** (mouse-guided orbs), and **Thunder** (arcing explosive shells). All five fire independently alongside the kinetic rifle; collecting a new gun never replaces another. Duplicates increase that gun's damage for the rest of the run. Damage modifiers strengthen every gun and Overclock speeds their independent firing cycles. Split Shot widens the kinetic volley. The HUD lists the equipped arsenal and levels.

Projectiles travel at visible speeds, carry shaped ammunition and trails, and create colored impact flashes, sparks, shockwaves, smoke, and turbulent fireballs. Missiles reacquire live targets; shells and energy payloads deal distance-weighted splash damage. Gates intercept shots. Wisp's road marker shows its steering lane; moving the mouse guides live orbs while keyboard movement remains independent. Replay `containment-1.7.0` records both squad movement and quantized aim.

Eight locally shipped ElevenLabs effects supply six distinct launch sounds, a compact impact, and a heavy detonation. Offline bass/treble mastering, short envelopes, stereo positioning, per-sound voice limits, and a shared compressor control simultaneous fire. The game only fetches local MP3s; it never needs a provider key. Generation provenance is in `assets/originals/weapon-audio/`. `node scripts/generate-weapon-audio.mjs` resumes saved assets without resubmitting completed requests; credentials are read only by this offline script.

See [PROJECTILE_PASS.md](PROJECTILE_PASS.md) for implementation and validation. Run `node scripts/projectile-review.mjs` for browser screenshots, mouse steering, audio decode, mute/pause and error checks; `python3 scripts/analyze-weapon-audio.py` checks the mastered files.

## Weapon and visual quality pass

The four original weapon modifiers also last the entire run. Duplicates add levels: Split Shot expands to three, five, then seven projectiles, with further levels adding damage; Plasma Core and Nova Reactor increase damage, and Overclock increases fire rate toward a bounded ceiling. All pickup orders preserve the full combination: every Split Shot projectile receives Plasma Core and Nova Reactor damage, at the Overclock fire rate. The HUD shows the kinetic volley, damage, fire rate, equipped guns, and permanent levels. Projectiles combine plasma cores with upgrade-colored halos and retain their appearance in flight. A new run starts with the base weapon; shields still absorb a finite amount of damage. Every bullet impact immediately improves a sign and pulses its number; damage upgrades also increase improvement per hit. Multiplier signs can improve past ×1.6. Sudden Death retains its neutral-only gates. Replay version `containment-1.7.0` includes the pyramid collision rules and separates these rules from previous recordings.

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
