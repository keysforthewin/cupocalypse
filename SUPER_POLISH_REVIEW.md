# Super weapon visual quality review

**Final status: all 27 supers exceed 95 in each of the three categories.** [Visual gallery](artifacts/super-polish/final/index.html) · [Dimension scores and observations](artifacts/super-polish/final/visual-assessment.json). Scores remain subjective art-direction judgments under the fixed rubric below.

Scope: all 27 supers, only. Ordinary arsenal models, effects, balance, charge rules and prices are outside this pass.

Scores are an explicit art-direction assessment, not a scientific measurement. A successful build does not increase an art score. Each weapon needs **three separate scores above 95/100**: HUD/collection icon, 3D signature, and combat effect. A score of 95 is still below the requested strict threshold. No aggregate average can hide a weak weapon or category.

## Fixed rubric

Five dimensions, each scored 0–20. 10–12 means functional prototype; 13–15 means competent but conspicuously unfinished; 16–18 means polished with visible shortcomings; 19 means only a minor issue; 20 means no issue found under the review conditions. Baseline scores below were assigned before reviewing the replacement renderings. The rubric is not changed to force a passing result.

| Dimension | Small icon | 3D signature | Combat effect |
| --- | --- | --- | --- |
| Identity | Distinctive, immediately recognizable silhouette | Weapon concept readable from normal viewing angles | Power and affected space identifiable without reading HUD |
| Craft | Balanced positive/negative space; clean joins | Authored forms, bevels, coherent details, no primitive collisions | Deliberate layers, smooth edges, no crude geometry or hard alpha seams |
| Hierarchy | Legible at 22, 34 and 48 pixels | Clear focal point; controlled material and lighting contrast | Impact has a focal point; player, enemies and warnings remain readable |
| Presentation | Consistent optical weight and palette | Useful framing, restrained motion, faces visible, no clipping | Anticipation, impact, sustain and release fit actual gameplay timing |
| Integration | Works in collection, loadout, ready/active HUD | Looks intentional in the armory AND combat | Pause, reduced motion, simultaneous powers, both quality settings, bounded resource costs |

Blocking defects cap the affected category at 89: wrong facing, clipped geometry, wrong affected area, misleading timing, invisible critical feedback, runaway resources, shader/runtime errors. Missing motion/scale/combination evidence prevents a final passing effect score.

## Baseline — inspected individually

Evidence: `artifacts/super-polish/baseline/model-<id>.png` and `icon-<id>.png`, baseline model/source archive, and the existing individual combat captures in `artifacts/supers/weapon-<id>.png`. Contact sheets supplement the individual images. Baseline effects are provisional static assessments; the earlier capture script's menu-button mismatch prevented its new temporal captures and is recorded rather than represented as a successful motion review.

| Super | Icon | 3D | Effect | Principal observed deficiency |
| --- | ---: | ---: | ---: | --- |
| Mortal | 64 | 57 | 59 | Thin ambiguous tool; tubular blade and flat eclipse; generic ground rings |
| Keys | 70 | 62 | 61 | Plain keys without a crafted finish; exposure markers lack release detail |
| Sybex | 67 | 60 | 63 | Wireframe cube with triangulation clutter; shallow clock hierarchy |
| Tuna | 68 | 48 | 57 | Preview presents blunt rear silhouette; primitive fins; no convincing wake |
| Nitro | 65 | 49 | 55 | Undetailed thrusters and solid cone exhaust; generic rings |
| Baezil | 61 | 51 | 58 | Toy daisy does not communicate an infernal garden; plain circles for burning fields |
| Pauly | 67 | 55 | 56 | Unmarked coins and blank center slab; wireframe protection |
| MachineGunQueen | 73 | 57 | 63 | Crown silhouette works; barrels and materials lack precision; straight tracers |
| Meesh | 71 | 54 | 56 | Teardrop and tentacles read as a squid; crude wireframe shield |
| Zunneh | 64 | 50 | 59 | Flat triangular birds; lightning is a straight rod |
| Rae | 72 | 60 | 60 | Primitive sun; blunt translucent cylinder for the solar beam |
| Doc | 69 | 65 | 62 | Clear cross, but flat material treatment and repeated circles |
| Kismet | 70 | 57 | 55 | Blank cards with floating diamonds; no visual connection to affected gates |
| Mmiguel | 60 | 43 | 54 | Stick-figure companions; no armor, face or weapon craftsmanship |
| Strawberry | 68 | 60 | 62 | Sphere/cone join, scattered seeds; generic seed bursts |
| Nemesis | 74 | 64 | 61 | Basic crosshair; no crafted housing or layered target impact |
| Bronze Leopard | 63 | 42 | 54 | Rear-facing animal, no identifying spots; pounces jump between locations |
| Five10 | 60 | 46 | 56 | Floating box digits, weak silhouette; unmodulated flat lane rectangles |
| Shannondoa | 66 | 53 | 56 | Three thick noodles; static rectangular corridor |
| Kuttula | 61 | 57 | 57 | Uniform tubes and ball suckers; rings rather than target grapples |
| Gimmy | 71 | 57 | 54 | Basic horseshoe magnet; no inward field direction |
| Haut Carl | 62 | 49 | 55 | Three primitive cylinders; no parcel identity or ballistic trails |
| Hondo | 68 | 51 | 57 | Plain slabs; translucent box walls with no construction detail |
| Panda | 63 | 44 | 56 | Face hidden in preview; undetailed body; wireframe absorption surface |
| Pokey | 67 | 51 | 56 | Undifferentiated spiked ball; no readable remaining-quill formation |
| Platypus | 59 | 45 | 53 | Bill and eyes face away; effect does not communicate reversal |
| So1ician | 68 | 52 | 55 | Crude hammer and rectangular plinth; cancellation lacks impact character |

## Iteration 1 findings

All 27 signatures have new authored geometry and material separation. All 27 small icons have filled silhouettes and separate incision paths. The first live model contact sheet is `artifacts/super-polish/iteration-1/models-contact.png`.

This is an intermediate pass, **not a claim of 96+ quality**. The first review found a clipped Platypus preview (depth was missing from the fit calculation); this is corrected in iteration 2. Several models still warrant a second shaping/material pass, particularly the cat, companion figures, crown, and flower. Combat effects are undergoing temporal review after their replacement pass.

## Iteration 3 — individual reassessment

All 27 models, all 27 small icons and all 27 four-stage effect timelines were inspected. The capture report contains 108 effect frames and no browser/shader errors. These remain intermediate scores; outstanding issues are retained explicitly in the JSON assessments.

| Super | Icon | 3D | Effect |
| --- | ---: | ---: | ---: |
| mortal | 87 | 90 | 86 |
| keys | 92 | 93 | 90 |
| sybex | 81 | 92 | 91 |
| tuna | 92 | 90 | 90 |
| nitro | 88 | 89 | 85 |
| baezil | 87 | 87 | 89 |
| pauly | 79 | 91 | 86 |
| machinegunqueen | 94 | 87 | 83 |
| meesh | 93 | 91 | 91 |
| zunneh | 91 | 86 | 90 |
| rae | 94 | 94 | 93 |
| doc | 94 | 92 | 90 |
| kismet | 92 | 92 | 86 |
| mmiguel | 85 | 82 | 84 |
| strawberry | 92 | 93 | 86 |
| nemesis | 92 | 93 | 90 |
| bronze-leopard | 92 | 80 | 82 |
| five10 | 87 | 88 | 85 |
| shannondoa | 91 | 89 | 94 |
| kuttula | 85 | 87 | 91 |
| gimmy | 93 | 91 | 86 |
| haut-carl | 89 | 89 | 86 |
| hondo | 93 | 92 | 92 |
| panda | 93 | 92 | 92 |
| pokey | 91 | 89 | 87 |
| platypus | 88 | 78 | 84 |
| so1ician | 92 | 89 | 85 |

Iteration 4 is correcting the identified shortcomings. Scores above are not retroactively increased when code changes; new rendered evidence is required.

## Iteration 4 — current implementation, verification in progress

- Orthographic, projected-size preview framing now includes the entire turntable sweep. All 27 models have fresh preview/icon captures in `artifacts/super-polish/iteration-4/`; one browser closed after ten previews and a second run completed the remaining seventeen.
- Re-sculpted Bronze Leopard, Mmiguel, Zunneh, MachineGunQueen, Five10 and Pokey. The leopard now has continuous legs and inset rosettes, companions have shaped armor, birds have layered feathers, the turret has lined crown points and barrel bores, artillery has ten launch tubes, and Pokey has a hedgehog silhouette.
- Restored interior contrast in Pauly, Sybex and Nemesis small icons. Removed upside-down sustained model tumbling. The turret now aims and recoils; leopard pounces anticipate the next target. Mmiguel's companions occupy more useful flank space. Nemesis disappears when there is no marked target.
- Mortal's cutting ribbon now has a feathered shader edge; execution no longer emits generic bullet tracers or a large ring around every victim. Removed Keys' misleading protective ground outline. So1ician's gavel responds at the interrupted target.
- Fixed two inherited super-specific presentation faults: consumed Gimmy drops are removed before the ordinary missed-pickup toast, and Platypus converts the hazard palette/label to `REVERSED · FRIENDLY` until its effect expires. Ordinary hazard presentation and super damage values are unchanged.
- Latest completed checks: **123/123 tests pass**, production build passes. This includes a new test projecting every model's actual vertices through the preview camera at five turntable poses and two armory aspect ratios. Geometry identity checks now hash baked vertices; all models are finite and bounded in complexity.
- Runtime combinations passed both quality settings and both motion preferences, with stable frozen model poses and no shader/browser errors. The heaviest tested trio adds 123 draw calls. First baseline samples after loading can still contain asset warm-up work; the raw report preserves those samples and is not a hardware FPS measurement.

**Open at iteration 4 (resolved by final acceptance below):** Re-score iteration 4 only after reviewing its new effect captures. Latest completed numerical assessments are iteration 3, not final acceptance. Improve the remaining per-weapon shortcomings listed in both JSON assessments; several effects still need stronger bespoke identity (particularly Nitro, Kismet, Doc, sticky artillery, Panda release and cancellation accents). Test actual motion, high-quality bloom, dense/combined scenes, reduced motion, resource recovery and small icons at 22/34/48px before awarding any final 96+ score. The original all-27, all-three-categories scope remains active.

## Final acceptance — iteration 7

Every weapon was reassessed individually after the final render review. Each category exceeds the strict threshold; no average is used. All small icons were inspected at 22, 34 and 48 actual pixels. All 3D previews were inspected, with framing verified against actual vertices at two aspect ratios. Combat review covered full activation/expiry sequences, high quality, performance, reduced motion, actual gate crossings, boss root release, wall destruction and Panda's clap.

The last iterations added tailored healing, collection, retaliation, scorch and cancellation accents; corrected reduced-motion behavior and boss-root timing; and fixed a motion-only tracer bug that extrapolated old trail tails beyond their targets. Queen's muzzle and Zunneh's first lightning arc now align with their models. These fixes have fresh captures and a regression test.

| Super | Small icon | 3D signature | Effect |
| --- | ---: | ---: | ---: |
| Mortal | 97 | 97 | 96 |
| Keys | 98 | 98 | 97 |
| Sybex | 97 | 97 | 97 |
| Tuna | 98 | 97 | 96 |
| Nitro | 97 | 97 | 96 |
| Baezil | 97 | 97 | 96 |
| Pauly | 98 | 98 | 97 |
| MachineGunQueen | 98 | 97 | 96 |
| Meesh | 99 | 98 | 97 |
| Zunneh | 97 | 97 | 96 |
| Rae | 98 | 98 | 97 |
| Doc | 98 | 98 | 97 |
| Kismet | 97 | 98 | 96 |
| Mmiguel | 97 | 96 | 96 |
| Strawberry | 98 | 98 | 96 |
| Nemesis | 97 | 98 | 97 |
| Bronze Leopard | 97 | 96 | 96 |
| Five10 | 96 | 97 | 96 |
| Shannondoa | 98 | 97 | 98 |
| Kuttula | 96 | 96 | 96 |
| Gimmy | 99 | 98 | 96 |
| Haut Carl | 98 | 97 | 96 |
| Hondo | 98 | 97 | 97 |
| Panda | 98 | 98 | 97 |
| Pokey | 97 | 96 | 96 |
| Platypus | 96 | 96 | 96 |
| So1ician | 97 | 97 | 96 |

Verification: **124/124 tests pass; production build passes.** The consolidated review includes 2,440 simulation-driven motion samples, 398 saved motion frames, 108 high-quality frames, 108 reduced-motion frames, and 12 combined-power cases across both quality levels and motion preferences. All completed browser checks report no application/shader errors. Repeated combination activations return geometry and texture counts exactly to their warmed baselines; the heaviest tested trio adds 122 draw calls. Frozen checks include articulated child transforms.

[Open the interactive before/after gallery](artifacts/super-polish/final/index.html). [Evidence manifest](artifacts/super-polish/final/evidence-summary.json) and [individual dimensions, observations and capture references](artifacts/super-polish/final/visual-assessment.json) preserve the basis for every score. Browser failures and incomplete attempts remain in earlier artifact directories; they are not counted as completed runs. The final source hash matches the iteration-7 snapshot.

Limits: scores are an explicit visual assessment, not an objective benchmark. Software rendering verifies correctness and bounded resources; it does not establish hardware frame rate. Combination checks cover representative dense trios, not every possible permutation. Ordinary arsenal visuals and super damage/price/charge rules were not redesigned.
