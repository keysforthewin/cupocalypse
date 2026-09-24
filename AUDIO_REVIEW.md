# Audio quality pass

The user accepted all 24 generated pilot takes after listening and requested randomized playback. All 24 are now installed across eight cues. Effects and ambience use a grounded cinematic direction; music is excluded. The comparison workbench remains at **http://localhost:5174**.

## Current result

- Baseline production readiness: **F**. The baseline has no environmental ambience, no independent recorded variants, fixed playback truncation, and excessive blanket filtering. This is an engineering assessment, not a fabricated numerical listening score.
- Fresh measurements of all 95 shipped recordings found six technical failures: unfaded boundaries in cluster, impact-cluster, impact-needle and needle; true peaks above the −1 dBTP gate in needle, super-gimmy and super-pokey.
- Generated and mastered 24 pilot candidates: three each for rifle, missile launch, ballistic impact, creature vocalization, Grave Marshal attack, Last Rites, ready notification, and city ambience. All 24 pass the automated asset gate. One additional initial rifle take is archived.
- Total conservative cost reservation: **$0.32 / $100**. This includes the failed overlength prompt. The account-specific price quote was $0.002 per generated second; reservations include headroom and are not a provider invoice. The ledger retains every submission, including the failure.
- All 24 auditioned candidates are installed in `public/assets/audio/v2/`, with three variants for each of the eight cues. Effects choose a different take on each accepted trigger, ready reminders choose again every phrase, and ambience chooses on entry/restart while keeping its loop stable. Each selection excludes the last-used take. The remaining original cues retain their existing assets.
- Explicit qualitative approval is recorded in `assets/audio-quality/acceptance.json` against each accepted master's hash. No numerical scores have been assigned or inferred. Keeping all takes needs no further generation; the reservation remains $0.32.

## Listening and scoring

The frozen rubric is in `assets/audio-quality/rubric.json`: impact/texture 25, identity 20, combat clarity 20, variation/fatigue 15, space/cohesion 10, and measured technical integrity 10. A pass requires **strictly more than 95**, valid evidence, and no critical defect. Baseline files that pass the technical checks retain those points; their score is not forced to fail.

The review page provides randomized, level-matched comparisons, eight repetitions, source reveal, and five gameplay scenarios rendered from real simulation events through Web Audio. These are deterministic-scene audio captures, not video recordings. The pilot transition includes city ambience only; the remaining four biome beds are part of the remaining collection work. Playback choices within a multi-variant mix are cosmetic and may differ between captures.

Enter your name, listen, open **Score this take**, and save observations and scores for preferred takes. Review all eight pilot groups before evaluating. Scores persist in `assets/audio-quality/assessments.json`; the Export button also saves a copy. A numerical rating for an isolated sound should consider its repeated playback and its role in the gameplay recordings. Gameplay technical points remain pending full mix measurement and final collection review.

The pilot evaluator accepts explicit user approval of the exact masters as `pilot-accepted`, separately from a numerical `pilot-approved` result. The user's approval retains all three variants in every group. Changes to a master invalidate that acceptance for the changed file. A verified numerical final result would additionally require all seven families, all five gameplay scenarios, and every promoted variant to pass in the complete installed mix. **Qualitative acceptance does not invent a 95+ score.**

## Runtime changes

`AudioEngine` now loads a cue manifest with variant banks, routing, gain, cooldown, priority and playback boundaries. The five buses cover weapons, impacts/creatures, bosses/supers, UI and ambience. The master no longer applies a global 5.2 kHz low-pass. It uses gentler compression and a bounded output stage. Existing source files retain their earlier mastering until replaced.

Playback preserves source tails. Important events can evict lesser voices. Overlapping important events keep ducking active until the last event ends. Procedural oscillators and noise are tracked and disconnected on pause/mute. Armory previews use the same master processing. Variant selection avoids immediate repetition without touching simulation RNG.

Ambience follows the same seeded biome timeline as the visual atmosphere with equal-power transitions. It activates when approved biome assets exist. New sample hooks cover UI feedback, creature and death sounds while retaining current fallbacks. Existing ready-signal semantics are preserved.

## Commands and continuation

Run the game development server on port 5173, then:

```sh
# Resume the existing pilot; never repeat completed submissions.
npm run audio:generate
npm run audio:measure

# Capture the actual shipping mix and the staged pilot bank.
node scripts/audio-quality/capture.mjs current
node scripts/audio-quality/capture.mjs pilot

# Prepare the comparison files and open the review server on port 5174.
npm run audio:review

# Accepts explicit qualitative user approval or current numerical passing scores.
npm run audio:evaluate

# Prepare targeted correction prompts from actual failed listening reviews.
node scripts/audio-quality/revise.mjs
node scripts/audio-quality/generate.mjs assets/audio-quality/correction-batch.json r3
npm run audio:measure

# Reinstall all 24 accepted candidates. Master hashes must still match approval.
npx tsx scripts/audio-quality/promote.mjs assets/audio-quality/selection.json

npm test
npm run build
npm run audio:browser
```

After corrections, recapture and prepare a new review. Before expanding coverage, use the pilot observations to author the remaining cue briefs and pass them as the generator's config argument with `AUDIO_STAGE=coverage`. The generator enforces cumulative $20 pilot, $80 coverage, and $100 correction limits; unused allocations carry forward. The full $100 authorization never expands automatically. No generation happens during gameplay.

The generation ledger uses an exclusive lock, atomic updates and reservations written before submission. Network ambiguity never triggers an automatic resubmission. Only read-only provider calls receive transient-error backoff. Failed or uncertain reservations remain charged against the ceiling until reconciled. The generator validates the provider's 450-character prompt limit before submission. Do not remove an active generation lock.

Source masters and provenance are in `assets/audio-quality/`; local baseline copies, measurements, gameplay recordings, the audition page data and test logs are in `artifacts/audio-quality/`. Candidate generation supports a fresh `rN` for each revision. Preserve the baseline snapshot instead of overwriting it after making changes.

## Verification

The implementation passed 178 repository tests, three scoring/budget/acceptance tests, the TypeScript/Vite production build, and browser checks for all 46 audition recordings, source lifecycle, preview, missing assets, ready behavior and rejection of stale scores. Asset measurements inspect decoded samples, true peaks, onset, boundaries and loop continuity. Tests and successful decoding do not establish perceived sound quality.

The pilot listening checkpoint is complete through explicit user acceptance. Remaining collection work includes other weapons, bosses and supers, four more biome beds, and final family/scenario assessment. The installed 24 takes use the requested randomization now. No 95+ or AAA-quality completion claim is made.
