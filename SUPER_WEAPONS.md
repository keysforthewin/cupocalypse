# Super weapons — containment-2.10.0

The permanent armory contains all 27 named super weapons. Buy each once for 50, 500, or 1000 credits. Equip up to three different weapons anytime through the Armory, including during an operation or from the death screen. Opening it pauses combat and banks credits earned so far; settlement awards only the remainder. Live loadout changes preserve the universal charge meter and its quota, including when all weapons are removed. Newly equipped weapons use that same charge, and active powers finish normally. Death-screen changes apply to the next deployment. New and migrated profiles own none.

**Q / E** select the previous / next weapon, **Space** spends the shared charge to activate it, and **H** toggles the controls guide. Eligible kills fill one universal meter; switching weapons preserves it. Powers already running continue after switching, so different weapons can combine. A power cannot reactivate until its current effect ends. Controls stay visible beside the reactor even with the guide hidden.

## Extended activation timers

| Duration | Weapons |
| --- | --- |
| 60 seconds | Gimmy, Doc, Meesh, Kismet |
| 15 seconds | Pauly, Nitro, Pokey |
| 30 seconds | Shannondoa, Bronze Leopard, Panda, Nemesis, MachineGunQueen, Rae, Mortal, Five10 |

Existing per-activation limits still apply: Gimmy grants recruitment up to five times, Kismet affects three gates, Bronze Leopard makes six pounces, Pokey has 24 quills, Mortal executes once after its windup, Nemesis marks up to three targets, Panda releases early if its absorption is depleted, and Doc's shield can be depleted. Five10 repeats its five paired strikes every five seconds throughout its 30-second activation, retaining one shared boss-damage cap. The replay balance version is now `containment-2.10.0`; earlier replays are rejected because encounter generation, activation timing and shared charging changed. Saved credits, purchases and loadouts remain compatible.

## Charging

The shared meter begins empty each run and needs 17 kills (30 in Swarm) for its first activation. Eligible kills charge it even with no weapon equipped. There is no passive fill. On activation, the meter is consumed once and its next requirement becomes the greater of the starting requirement or 25 times the eligible kill rate over the preceding 60 simulation seconds, rounded up. The requirement stays fixed while filling and follows the shared meter when weapons are switched or replaced.

Each eligible enemy counts once, including bosses and summoned enemies. Super kills, amplified arsenal kills, and their chain reactions still award ordinary rewards but do not charge the meter. Escapes, contact despawns, and boss cleanup do not count. Excess charge on a full meter is discarded. Pause freezes charge, and charge never carries between operations.

A full meter makes every equipped, inactive weapon available. Q / E selects which one to fire. Firing any weapon resets the shared meter to zero; switching cannot grant another free activation. Attempting to fire an already-active weapon or an empty loadout preserves charge. Recharge while powers are active to combine them.

The HUD shows one shared charge percentage and the selected weapon. Charge feedback includes energy motes, per-kill pulses, audio and a ready prompt. The ready reminder follows the shared meter and stops after any weapon fires. Reduced-motion presentation removes camera kicks and moving motes.

## Collection

| Name | Weapon | Credits | Role |
| --- | --- | ---: | --- |
| Mortal | Last Rites | 1000 | Screen execution |
| Keys | Skeleton Key | 500 | Armor stripping and one-hit vulnerability |
| Sybex | Clockbreak | 500 | Enemy and attack stasis |
| Tuna | Broadside Tide | 500 | Tidal displacement |
| Nitro | Redline | 50 | Arsenal overdrive |
| Baezil | Infernal Garden | 500 | Persistent burning sigils |
| Pauly | Protection Racket | 50 | Reduction and retaliation |
| MachineGunQueen | Royal Fusillade | 1000 | Crown turret |
| Meesh | Ghostwalk | 50 | Temporary intangibility |
| Zunneh | Storm Parliament | 500 | Linked lightning |
| Rae | Daybreak Lance | 1000 | Mouse-aimed solar beam |
| Doc | Second Opinion | 50 | Casualty recovery and temporary shield |
| Kismet | Loaded Fate | 50 | Favorable gate outcomes |
| Mmiguel | Dos Amigos | 500 | Two spectral arsenals |
| Strawberry | Sweet Rot | 500 | Seed contagion and recruitment |
| Nemesis | Personal Matter | 1000 | Focused bonus damage |
| Bronze Leopard | Six Pounces | 50 | Six targeted executions |
| Five10 | Ten Count | 1000 | Ten-column bombardment |
| Shannondoa | River’s Mercy | 50 | Safe center corridor |
| Kuttula | Below the Asphalt | 500 | Six grappling tentacles |
| Gimmy | Mine, Mine, Mine | 50 | Doubled salvage and recruitment |
| Haut Carl | Special Delivery | 500 | Sticky cluster artillery |
| Hondo | Hold the Line | 500 | Three defensive barricades |
| Panda | Gentle Giant | 1000 | Absorb damage and release a shockwave |
| Pokey | Keep Your Distance | 50 | Proximity quills |
| Platypus | Wrong-Way Warfare | 500 | Reverse hostile hazards |
| So1ician | Final Objection | 500 | Cancel and punish attacks |

The armory shows exact descriptions, duration, boss adaptations, procedural 3D previews, and sound auditions for every entry. `src/game/superWeapons.ts` is the catalog's source of truth.

## Combat and compatibility

Powers operate on the road up to 48 m ahead. Damage expressed as a fraction of durability uses maximum HP plus maximum armor. A boss can lose at most 35% of maximum HP to one power activation's direct or bonus damage; underlying normal arsenal damage remains separate. Multiple powers can combine to finish a boss.

Protection order is immunity / hazard conversion, Pauly's reduction, Panda's absorption, Doc's temporary shield, ordinary shield, then casualties. Barricades intercept contact first. Curbs and gate arithmetic bypass combat protection unless specifically affected by Meesh or Kismet. Mirror shares authoritative charge and damage. Kismet preserves Sudden Death's gate neutrality and awards shield instead.

Temporary powers do not change permanent upgrades or equipment-driven enemy scaling. Companion arsenals snapshot ordinary weapon statistics, excluding other supers. Delayed payloads retain their originating activation for charge exclusion and boss caps. Cosmetic budgets are independent of gameplay effects.

Profiles retain the original storage key and existing currency, upgrades, settings and records. Replays now record the starting loadout, ordered loadout changes, and tick-level selection/fire commands; old balance versions are rejected. Replay playback is practice-only and never unlocks an imported weapon for normal play.

## Assets and review

All 27 silhouettes are authored procedural geometry. All 27 activation sounds are original deterministic layered synthesis, shipped as local WAV files. Gameplay makes no generation requests. Regenerate audio with `python3 scripts/generate-super-audio.py`; provenance and levels are in `assets/super-audio.json`.

- `npm test` includes focused super-weapon tests plus all existing regression tests.
- `npm run build` checks TypeScript and produces the application bundle.
- `node scripts/super-review.mjs` exercises purchases, equipment, controls, help, combinations, pause and sound. It captures all weapon identities, charge stages and combined effects at 900, 1280 and 1920 pixels in both quality settings.
- `npx tsx scripts/super-balance.ts` measures 60 runs across six modes and fresh / upgraded profiles. The existing legal-speed bot switches after activation; runs end at defeat or five minutes.
- Review artifacts are in `artifacts/supers/`, including the balance JSON, browser report, images and browser recording. These practice scenarios never award currency.

The five-seed balance sample is a pacing check, not human playtesting. Fresh-profile survival varies substantially by mode; some runs end before earning a first super. Stronger profiles often earn their initial 50 kills in less than a minute, consistent with the selected kill-driven rules.
