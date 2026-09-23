# Building surface quality

Status: accepted. All 29 assets and procedural variants score 96.70–98.20 under
the gameplay-camera rubric below, with current matching evidence and no blockers.

This pass covers 13 architectural assets and every variant of the four procedural
building families (16 variants). It excludes vehicles, vegetation, terrain, and
combat models. Architectural identity, footprints, height envelopes, and ground
anchors are retained; heavily distorted generated structures are reconstructed.
Materials on reconstructed buildings reuse sampled wear and the original palette,
with newly aligned architectural courses. Ornamentation is simplified in places.

## Frozen rubric

| Category | Weight | Review standard |
|---|---:|---|
| Structural consistency | 30% | Flat intended planes; straight rooflines, corners, openings, and repeated elements |
| Surface integrity | 25% | Correct winding; no unintended tears, missing faces, or visible intersections |
| Shading consistency | 20% | Stable planes, crisp architectural corners, and smooth intended curves |
| UV consistency | 15% | Upright wall courses, roof-aligned courses, consistent scale, no visible distortion |
| Runtime fidelity | 10% | Consistent silhouettes and surfaces in both quality modes and moving scenery |

Each category is judged from 0–100. Anchors: 50 conspicuous recurring defects;
75 functional with obvious defects; 90 polished but visibly imperfect; 95 only
minor imperfections at gameplay distance; 100 no defect observed in required views.
Each asset/variant needs a weighted total **≥95**, no category below 90, and no
blocking defect. The minimum across three seeds and both quality modes is its
score. These are visual judgments about structural scenery quality at the game
camera, not an independent AAA certification or a walk-up detail rating.

Visible inverted faces, unintended holes, warped intended planes, UV reversals,
and surface flicker block acceptance. Tests do not award visual points. Missing
observations, cases, captures, current hashes, full-building diagnostic views,
geometry checks, or passing runtime measurements prevent acceptance.

## Iterations

1. Archived the original source scenes, processed meshes, runtime GLBs, and model
   renders under `artifacts/buildings/baseline`. Audited all 13 source structures.
   Ten generated assets had winding conflicts. No unsupported baseline total was
   assigned; the earlier whole-biome scores were not reused.
2. Tried conservative normal correction and planarization. The office lost its
   winding conflicts but retained distorted openings and cornices; this approach
   was rejected as insufficient. Its change log remains under
   `assets/biomes/quality/repair`.
3. Reconstructed eleven generated architectural assets as closed structural solids.
   Retained the existing authored lookout and pylon. Preserved intended curves,
   broken edges, rubble, and exposed structural elements. Reused material samples
   in a consistently oriented atlas. Preserved runtime dimensions and IDs.
4. Runtime review found a side pilaster intersecting the office's central window
   bay, which was moved to the correct pier positions. The procedural silo's open
   hemisphere was replaced with a closed sphere whose lower half is inside the
   tank. The first capture run is retained as rejected under `iteration-1`.
5. Added full-building views alongside gameplay views, since tall structures extend
   above the normal gameplay frame. Audited each authored solid separately to
   distinguish deliberate joinery from actual mesh connectivity errors.

6. Final UV review corrected the direction of courses on opposite pitched roof
   slopes and retained the separate mapping needed by the porch canopy. Authoring
   assertions verify that V climbs toward the ridge on both slopes and undersides.
   Evidence captured during those edits was rejected as stale and refreshed.

## Evidence and reproduction

- [Building gallery](artifacts/buildings/final/index.html)
- [Written assessments](artifacts/buildings/final/assessment.json)
- [Acceptance result](artifacts/buildings/final/acceptance.json)
- [Processed and runtime geometry](artifacts/buildings/final/geometry.json)
- [Gameplay and transition captures](artifacts/buildings/gameplay/report.json)
- [Runtime measurements](artifacts/buildings/final/runtime.json)
- [Blender sources and workflow](assets/biomes/README.md)

The architectural geometry is reduced from 327,650 to 76,522 triangles across
all 13 architectural assets. Both quality modes use the validated geometry;
Performance reduces texture resolution instead of simplifying structural edges.
Neutral source renders support diagnosis; acceptance uses the actual runtime GLBs.

## Final results

| Asset or family | Lowest score |
|---|---:|
| city-offices | 98.00 |
| city-tenement | 97.65 |
| city-kiosk | 97.50 |
| city-water-tower | 97.85 |
| suburb-house | 97.85 |
| suburb-cottage | 97.35 |
| country-barn | 97.55 |
| country-barn-stone | 97.40 |
| forest-cabin | 97.20 |
| forest-lookout | 98.20 |
| ash-ruin | 97.20 |
| ash-ruin-arcade | 97.20 |
| ash-pylon | 98.20 |
| procedural-city (all four variants) | 96.70 |
| procedural-house (all four variants) | 96.70 |
| procedural-barn (all four variants) | 97.35 |
| procedural-ruin (all four variants) | 96.70 |

All 39 processed/High/Performance geometry audits pass with no winding conflicts,
inward closed components, degenerate faces, unexpected boundary edges,
nonmanifold edges, or collapsed UV triangles. Untextured materials do not require
UVs. Broad detected planar regions on rebuilt walls/roofs have RMS deviations
below 0.0000001 world units; the kiosk dome and cylindrical tank are intentional
curves and are not judged as flat walls.

Evidence comprises 174 scored case sheets (696 gameplay orientations), 116
supplementary full-building views, and 150 in-context biome/transition captures.
Each case has written observations and category scores. Asset seed captures are
visually identical apart from negligible raster rounding; procedural ruin seed
variations were reviewed separately. The gallery retains per-case references.

Live measurements cover 600 moving frames per biome and quality (6,000 frames),
all 20 directed transitions, resource recycling, road clearance, and pause behavior.
Both modes pass: p95 ≤16.8 ms, p99 ≤33.3 ms, maximum 50.0 ms on the recorded Windows
Chrome / NVIDIA RTX 5070 Ti configuration. Those results apply to that machine and
scenario. No runtime errors or resource growth were observed in the checks.

Validation: production build and 163 tests pass, including geometry fault injection,
warped-patch and reversed-UV detection, procedural variant checks, and rejection of
incomplete, stale, blocked, or unscored evidence. No paid generation requests were
made. Remaining limitations are simplified ornamentation, repeated texture samples,
and reduced fine weathering; these are not rated as walk-up assets.
