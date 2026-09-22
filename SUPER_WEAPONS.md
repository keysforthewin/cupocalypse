# Super weapons — containment-1.9.0

The permanent armory contains all 27 named super weapons. Buy each once for 300, 600, or 900 credits. Equip up to three different weapons at base; their order and membership are locked for the operation. New and migrated profiles own none.

**Q / E** select the previous / next reactor, **Space** activates it, and **H** toggles the controls guide. The selected reactor receives eligible kills; switching preserves stored charge. Powers already running continue after switching, so different weapons can combine. A power cannot reactivate until its current effect ends. Controls stay visible beside the reactor even with the guide hidden.

## Charging

All slots begin empty, with a requirement of 50 kills (90 in Swarm). There is no passive fill. On activation, the fired slot's next requirement is the greater of its starting requirement or 75 times the eligible kill rate over the preceding 60 simulation seconds, rounded up to five kills. Requirements stay fixed while filling. Fast runs can charge in under 60 seconds; 75 seconds is a pacing target, not a minimum timer.

Each eligible enemy counts once, including bosses and summoned enemies. Super kills, amplified arsenal kills, and their chain reactions still award ordinary rewards but do not fuel any reactor. Escapes, contact despawns, and boss cleanup do not count. Excess charge on a full selected reactor is discarded. Pause freezes the authoritative state; charge never carries between operations.

Charge feedback includes moving energy motes, per-kill impact pulses, a numerical meter, milestone audio, escalating textures, a full-charge transformation, and a release animation. Inactive slot meters and active-effect durations remain visible. Reduced-motion presentation removes camera kicks and moving motes.

## Collection

| Name | Weapon | Credits | Role |
| --- | --- | ---: | --- |
| Mortal | Last Rites | 900 | Screen execution |
| Keys | Skeleton Key | 600 | Armor stripping and one-hit vulnerability |
| Sybex | Clockbreak | 600 | Enemy and attack stasis |
| Tuna | Broadside Tide | 600 | Tidal displacement |
| Nitro | Redline | 300 | Arsenal overdrive |
| Baezil | Infernal Garden | 600 | Persistent burning sigils |
| Pauly | Protection Racket | 300 | Reduction and retaliation |
| MachineGunQueen | Royal Fusillade | 900 | Crown turret |
| Meesh | Ghostwalk | 300 | Temporary intangibility |
| Zunneh | Storm Parliament | 600 | Linked lightning |
| Rae | Daybreak Lance | 900 | Mouse-aimed solar beam |
| Doc | Second Opinion | 300 | Casualty recovery and temporary shield |
| Kismet | Loaded Fate | 300 | Favorable gate outcomes |
| Mmiguel | Dos Amigos | 600 | Two spectral arsenals |
| Strawberry | Sweet Rot | 600 | Seed contagion and recruitment |
| Nemesis | Personal Matter | 900 | Focused bonus damage |
| Bronze Leopard | Six Pounces | 300 | Six targeted executions |
| Five10 | Ten Count | 900 | Ten-column bombardment |
| Shannondoa | River’s Mercy | 300 | Safe center corridor |
| Kuttula | Below the Asphalt | 600 | Six grappling tentacles |
| Gimmy | Mine, Mine, Mine | 300 | Doubled salvage and recruitment |
| Haut Carl | Special Delivery | 600 | Sticky cluster artillery |
| Hondo | Hold the Line | 600 | Three defensive barricades |
| Panda | Gentle Giant | 900 | Absorb damage and release a shockwave |
| Pokey | Keep Your Distance | 300 | Proximity quills |
| Platypus | Wrong-Way Warfare | 600 | Reverse hostile hazards |
| So1ician | Final Objection | 600 | Cancel and punish attacks |

The armory shows exact descriptions, duration, boss adaptations, procedural 3D previews, and sound auditions for every entry. `src/game/superWeapons.ts` is the catalog's source of truth.

## Combat and compatibility

Powers operate on the road up to 48 m ahead. Damage expressed as a fraction of durability uses maximum HP plus maximum armor. A boss can lose at most 35% of maximum HP to one power activation's direct or bonus damage; underlying normal arsenal damage remains separate. Multiple powers can combine to finish a boss.

Protection order is immunity / hazard conversion, Pauly's reduction, Panda's absorption, Doc's temporary shield, ordinary shield, then casualties. Barricades intercept contact first. Curbs and gate arithmetic bypass combat protection unless specifically affected by Meesh or Kismet. Mirror shares authoritative charge and damage. Kismet preserves Sudden Death's gate neutrality and awards shield instead.

Temporary powers do not change permanent upgrades or equipment-driven enemy scaling. Companion arsenals snapshot ordinary weapon statistics, excluding other supers. Delayed payloads retain their originating activation for charge exclusion and boss caps. Cosmetic budgets are independent of gameplay effects.

Profiles retain the original storage key and existing currency, upgrades, settings and records. Replays now record the starting loadout and tick-level selection/fire commands; old balance versions are rejected. Replay playback is practice-only and never unlocks an imported weapon for normal play.

## Assets and review

All 27 silhouettes are authored procedural geometry. All 27 activation sounds are original deterministic layered synthesis, shipped as local WAV files. Gameplay makes no generation requests. Regenerate audio with `python3 scripts/generate-super-audio.py`; provenance and levels are in `assets/super-audio.json`.

- `npm test` includes focused super-weapon tests plus all existing regression tests.
- `npm run build` checks TypeScript and produces the application bundle.
- `node scripts/super-review.mjs` exercises purchases, equipment, controls, help, combinations, pause and sound. It captures all weapon identities, charge stages and combined effects at 900, 1280 and 1920 pixels in both quality settings.
- `npx tsx scripts/super-balance.ts` measures 60 runs across six modes and fresh / upgraded profiles. The existing legal-speed bot switches after activation; runs end at defeat or five minutes.
- Review artifacts are in `artifacts/supers/`, including the balance JSON, browser report, images and browser recording. These practice scenarios never award currency.

The five-seed balance sample is a pacing check, not human playtesting. Fresh-profile survival varies substantially by mode; some runs end before earning a first super. Stronger profiles often earn their initial 50 kills in less than a minute, consistent with the selected kill-driven rules.
