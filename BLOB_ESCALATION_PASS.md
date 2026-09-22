# Rounded crowd and escalating encounters

The firing tip leads a rounded crowd with a flat rear. The back follows turns with a short delay, banks toward the chosen side, and compresses against the sidewalk. Compression pushes the front forward to create space; bullets, muzzle flashes, pickups, gate crossings, and enemy contact follow that moving front. Most soldiers remain on the road, while the outermost compressed ranks can still be crushed. Recruitment remains uncapped.

## Crowd behavior

- Rounded cross sections replace straight triangular sides. Row populations follow the rounded shape so the front is not artificially sparse; the last rank stays flat.
- The simulation owns the trailing crowd position. Rendering interpolates both the tip and the rear, so pausing, replay, movement, and restart stay deterministic.
- A smooth sidewalk constraint packs soldiers along the curb instead of allowing the whole formation to slide onto the pavement. The resulting density also drives collisions with hazards, enemies, and barricades.
- Lateral compression advances the firing tip while preserving the rear depth. Firing and interaction origins use that same displacement.
- Curb casualties bypass shields and continue at a lower rate than the previous pass. In the recorded 600-soldier left-turn scenario, 489 remained after the approach and 150 settling ticks; the tip moved forward from 0.35 to about −3.10 world units. This is a pressure scenario, not a fixed damage rule.
- Mirror preserves both linked formations, shared troop accounting, and their respective firing tips.

## Encounter pacing

- The opening begins with 2–3 enemies per group and about 3.4 seconds between groups. Supply spacing is 36 m in the opening and 28 m later, retaining the first early weapon reward.
- No multiplication gate panels appear before 100 m. Their probability is 2.5% per panel from 100–250 m and 6% afterward. Shooting still improves all gates normally.
- Weapon damage, fire-rate, and spread bonuses keep their existing values and stacking rules.
- After 60 m, adaptive pressure ramps in over 210 m. It considers weapon damage, firing rate, volley coverage, and army growth. New enemies gain health, armor, movement speed, and group size; stronger runs also receive more frequent groups.
- Later groups mix durable armor, faster attackers, and specialists across occupied lanes. A clear route is retained per generated group. Only the nearest target in each firing corridor (plus bosses) displays its health label, keeping crowded fights readable.
- Existing enemies keep their committed HP and armor after a pickup. Scaling applies to new spawns; it does not secretly heal a target already under fire.
- The reference bot anticipates the wider, advancing front and trailing body when choosing evasive moves. Replay version is now `containment-1.6.0`.

## Verification

- `npm test`: 61 passing tests. Added coverage includes rounded shoulders, flat rear ranks, curb confinement and concentration, leading-tip lag, advanced projectile origins, collision/render density agreement, deterministic crowd replay, power-sensitive enemy stats/group size, unchanged upgrade benefits, and multiplier scarcity. The opening-cadence test now explicitly checks the calmer wave and supply intervals.
- `npm run build`: TypeScript and production build pass.
- `node scripts/browser-tests.mjs`: keyboard/mouse steering, pause, focus loss, payout, upgrades, restart, debug restrictions, Mirror gate rendering, and viewport handling pass without browser errors.
- `node scripts/blob-review.mjs`: six visual states covering 100/600 soldiers, initial turns, both compressed sidewalks, forward tip displacement, and retained curb casualties. No browser/shader errors. [Centered crowd](artifacts/blob-crowd/rounded-center.png), [left compression](artifacts/blob-crowd/compressed-left.png), [right compression](artifacts/blob-crowd/compressed-right.png).
- `node scripts/escalation-review.mjs`: a three-Walker opening compared with a 13-enemy powered encounter containing armored guards, runners, crawlers, and carriers. [Opening](artifacts/blob-crowd/opening.png), [powered encounter](artifacts/blob-crowd/powered-encounter.png). Numeric snapshots are in `artifacts/blob-crowd/escalation-review.json`.
- Two six-seed sweeps across all six modes, one with a fresh profile and one with maximum profile upgrades: 72 reference-bot runs. Full results are in `artifacts/balance-blob-fresh-fresh.json` and `artifacts/balance-blob-upgraded-upgraded.json`. These sample progression and failure behavior; they do not predict a human player's survival time.

Browser captures use Chromium with software rendering; no hardware frame-rate target is claimed.
