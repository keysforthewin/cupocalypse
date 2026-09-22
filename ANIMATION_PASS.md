# Character animation and combat pass — containment-1.4.0

The squad now articulates hips, knees and shoulders in an instanced GPU animation. Steering blends into lateral strides and a directional lean; mirrored formations move in opposite directions. Each soldier has an independent stride phase. Support-foot compensation, matching animated shadows, and simulation-time uniforms prevent floating, static shadows, and movement while paused.

All ten infected classes use deterministic, independently phased skeletal poses. Slow shambles, fast runner strides, crawling, arm waving, head movement and howls replace the shared walk loop. Screamer calls, Charger preparation, Spitter release, Gunner recoil and Carrier spawning have distinct actions. Skin and cloth no longer inherit glTF's fully metallic default, which obscured the anatomy.

Boss motion is driven by committed simulation attack timelines:

- **Bulwark:** plants, raises both fists, arches back, drops into a deep crouch and drives both arms down, then recovers. Phase II retains the complete rig after armor breaks and attacks both warned lanes.
- **Broodmass:** inflates its sacs and draws back before spitting; the projectile travels to the marked lane and arrives at the damage tick. Its alternate summon visibly contracts and releases four crawlers, or six in phase II. Killing it during preparation cancels the release.
- **Congregation:** alternates arms through three strikes, or four in phase II, with shoulder windup, torso rotation, follow-through and independent head movement. Each strike follows its own committed lane and deadline.

Impacts add ground rings and debris. Calls and heavy impacts have synthesized audio cues. Recovery continues after the damage warning expires. Interrupted casts cancel unreleased hazards; pools already released persist. Rendering does not consume simulation RNG.

## Balance and pacing

- Encounters arrive every 7.5 m (2.35 seconds), or 6 m in Swarm (1.88 seconds), instead of every 22 m (6.88 seconds).
- Combat starts immediately, with three to five enemies in opening packs. Later packs contain four to nine enemies, or eight to thirteen in Swarm, mixing a specialist with basic infected. New classes unlock every 26 m.
- Enemies spawn at 29 m and supplies at 24 m. Gates and supplies accompany combat instead of replacing it with empty stretches. All six supply types rotate; Swarm starts with Split Shot.
- The first gate offers reinforcements, and a new squad has 20 shield, giving players room to learn the denser opening.
- Enemy health grows with distance to power 1.65. Boss base health is higher. Threat damage grows with distance and also threatens large armies; damage is fixed when a warning is committed.
- Weapon levels remain permanent and stack in every order, with diminishing damage returns instead of multiplying several unlimited bonuses together.
- The HUD explicitly shows a **600-soldier formation capacity**. Arithmetic gates still improve on every hit. The capacity prevents exponential growth into millions or trillions of soldiers.
- Replay version changed to `containment-1.4.0`; old recordings are rejected rather than replayed with different rules.

## Verification

Run `npm run build` and `npm test`. The tests cover all boss attack deadlines and phases, summon timing/cancellation, recoil on each burst round, deterministic locomotion and recovery, cadence, formation capacity, weapon composition, replay equality, movement and reachable boss warnings.

Browser tools use Playwright's installed Chromium. Set `GAME_URL` to change the default `http://localhost:5173`:

```sh
node scripts/animation-review.mjs
node scripts/motion-closeup.mjs
node scripts/animation-film.mjs
node scripts/browser-tests.mjs
node scripts/performance.mjs
```

The gameplay-view pose captures are in `artifacts/animation-review/`; the final close-up captures cover both sidestep directions and phase-II boss strikes in `artifacts/motion-closeup/`. The continuous recording is `artifacts/animation-pass.webm`, with chapter timestamps and ground-contact measurements in `artifacts/animation-film.json`. Browser report JSON files record runtime errors.

Balance artifacts include a 12-seed-per-mode baseline before rebalance (`artifacts/balance-before-animation-pass.json`), matching final seeds (`artifacts/balance-animation-baseline-fresh.json`), 25 holdout seeds per mode, and 12 fully upgraded seeds per mode. These are bot simulations, not human playtest ratings. Hardware performance numbers from these browser tools use software WebGL and should not be read as desktop GPU frame-rate guarantees.

Current measured results: **44 tests pass**, the production build succeeds, and the browser interaction suite passes all **10 checks with zero errors**. Among the same 72 fresh-profile bot runs, 15-minute survivors fell from **69 before** to **2 after**. In 150 holdout runs, 8 reached the cutoff; in 72 fully upgraded runs, 16 did. Every final run stayed at or below the 600-soldier capacity. Full seed distributions, rather than just these totals, are retained in the JSON reports.

`node scripts/ground-contact-review.mjs` additionally measures the actual deformed Bulwark mesh: both fist surfaces and both boots land within 4 cm of the road at impact. This guards against an apparent slam that only rotates the torso, or a crouch that hides the boots under the pavement. See `artifacts/ground-contact.json` and `artifacts/motion-closeup/bulwark-ground-contact.png`.
