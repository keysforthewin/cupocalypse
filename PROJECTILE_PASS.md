# Projectile arsenal — September 22, 2026

The kinetic rifle now supports five additional permanent guns. Each has an independent cooldown and keeps firing when another gun is collected. Duplicate pickups increase the corresponding gun's damage. New runs reset the arsenal. The existing damage and rate modifiers still apply, and Split Shot still widens the kinetic volley.

| Gun | Flight and shape | Impact |
| --- | --- | --- |
| Kinetic | Small gold darts, shortened tracer, 29 m/s | Compact flash and fragments |
| Hellhound | Finned missiles, target acquisition/reacquisition, amber exhaust and smoke, 17 m/s | Fireball and 1.8 m splash |
| Helix | Paired cyan toroidal cores weaving in opposition, 20 m/s | Plasma burst and 0.8 m splash |
| Wildshard | Three faceted lime shards with seeded changes of direction, 23 m/s | Crystal fragments |
| Wisp | Violet caged orb, orbiting sparks, live mouse steering, 15 m/s | Energy burst and 1.4 m splash |
| Thunder | Red heavy capsule following an elevated arc, 13 m/s | Fireball, smoke, debris, shockwave, 2.7 m splash |

Move the mouse over the road to guide live Wisp projectiles. A/D or arrows move the squad independently; drag steering remains available. The lane marker shows the guidance target. The HUD displays equipped guns and levels, and each new pickup has its own three-dimensional icon and description. All eleven pickup types participate in the supply rotation; Swarm starts with Helix and other modes start with Hellhound.

## Simulation and rendering

Flight runs in the fixed-tick simulation. Curved bullets use swept lateral positions for enemy and gate collisions. Gates intercept explosive shots without passing splash through to enemies behind them. Explosions apply direct damage plus distance-weighted splash. Shells also detonate at the end of their arc. Target selection excludes dead enemies and reacquires after a target dies. Cosmetic shot hashing does not consume encounter randomness.

Replay version is `containment-1.7.0`. Records include separate quantized aim samples. Older balance versions are rejected. Arsenal strength contributes to newly spawned enemy escalation.

The pool holds 1,536 projectiles, with 96 reusable impact events and 64 recent audio events. Batched geometry handles six silhouettes, luminous cores, tapered trajectory trails, orbiting sparks, smoke, turbulent fireballs, fragments, and expanding ground shockwaves. Effects freeze with simulation time. No generation service is contacted during gameplay.

## Audio

Eight sounds were generated using the [ElevenLabs sound-effects API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert) with ElevenLabs `eleven_text_to_sound_v2`: one launch per gun, a compact impact, and a heavy explosion. Original MP3s and request provenance, SHA-256 hashes, completion timestamps, and provider character-cost headers are saved in `assets/originals/weapon-audio/`. The delivered files are in `public/assets/audio/`.

Mastering trims leading silence, removes subsonic rumble, strengthens Wildshard's low end, normalizes, applies two low-pass stages, fades edges, and limits peaks. The runtime mixer adds stereo placement, small pitch variations, short fade envelopes, two voices per sound, a 16-voice ceiling, low-pass filtering, and compression. Mute and pause silence the bus and stop sample voices. The generation script reuses completed originals; it refuses to automatically resubmit an ambiguous request.

Decoded asset measurements are in `artifacts/projectiles/audio-analysis.json`. All eight files are finite and non-silent; peak levels remain below −5 dBFS. Filtered energy above 5 kHz is at most 2.8%. These are engineering checks, not a substitute for listening on the player's speakers.

## Verification

- `npm test`: 68 tests pass, including 120 acquisition orders, all six modes, live homing retargeting, weaving, deterministic erratic motion, independent mouse aim, shell arcs, splash falloff, gate interception, maximum upgraded Mirror pool capacity, and exact replay of guns, bullets, impacts, RNG, and kills.
- `npm run build`: TypeScript and production build pass.
- `node scripts/browser-tests.mjs`: all ten existing browser checks pass, including keyboard/drag movement, focus-loss pause, restart, progression, and Mirror gates.
- `node scripts/security.mjs`: no credentials, environment files, or generation API references in the production bundle.
- `python3 scripts/analyze-weapon-audio.py`: all eight delivered samples pass decoded peak, frequency, and finite-value checks.
- `node scripts/projectile-review.mjs`: High-quality visual review; individual gun, combined arsenal, and impact screenshots are in `artifacts/projectiles/`.
- `QUALITY=performance SKIP_CAPTURES=1 node scripts/projectile-review.mjs`: focused browser check of local audio decoding, pointer steering independent of squad motion, all sound families within the voice budget, mute, pause, and runtime errors. Results are in `artifacts/projectiles/review.json`.

Browser rendering uses software WebGL in this environment; screenshots prove appearance and functional rendering, not a desktop GPU frame-rate target.
