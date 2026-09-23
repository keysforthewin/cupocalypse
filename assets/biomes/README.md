# Biome asset sources

The runtime combines seeded procedural geometry with eighteen Blender-refined/authored assets. Sixteen assets were generated using Meshy 6 through Fal.ai; the lookout and transmission tower were authored directly in Blender. `ledger.json` records prompts, request IDs, source outputs, and conservative reservations against the separate $100 biome allowance.

- `originals/`: downloaded provider GLBs, retained for reproducibility.
- `processed/`: Blender-normalized, ground-aligned GLBs and dimensions.
- `source/`: editable Blender scenes; append the named `Biome-*` scene when opening in an existing project.
- `renders/`: neutral Blender inspection renders, supplementary to gameplay evidence.
- `blender_pipeline.py`: normalization, material correction, and export.
- `blender_landmarks.py`: reproducible authored lookout and damaged pylon.
- `blender_render.py`: neutral asset inspection camera and lighting.

Run generation only in the dedicated generation container:

```sh
docker compose --profile assets run --rm generation node scripts/generate-biomes.mjs
```

Completed requests are reused. Uncertain submissions are not resubmitted automatically. Additional revisions must receive distinct IDs, and the ledger refuses reservations above $100. Runtime gameplay never calls a generation service.

For remote Blender, run `python3 scripts/biome-bridge.py` locally and set `BRIDGE` in the Blender scripts to the reachable local-network URL. The bridge serves only this asset directory and accepts GLB, blend, JSON, and PNG exports. Stop it after transfer. Scripts use dedicated scenes and preserve the scene originally open in Blender.

Export runtime LODs and refresh the hashed manifest with:

```sh
node scripts/optimize-biomes.mjs
```

Both runtime quality variants are inspected in the browser; Blender renders alone do not establish visual acceptance. See `BIOME_REVIEW.md` for the rubric and final evidence.

## Architectural surface pass

`building_catalog.json` freezes the 13 architectural assets, 16 procedural variants,
three seeds, two quality modes, and weighted building-specific rubric. See
`BUILDING_REVIEW.md` at the repository root. The old whole-biome visual scores do
not substitute for building acceptance.

Current editable building sources are in **`quality/source/`**, using named
`Building-*` scenes. `source/`, `originals/`, and the task's baseline snapshot retain
pre-pass references. Eleven generated architectural meshes were rebuilt by
`blender_architecture.py`; the authored lookout and pylon were retained and audited.
The material atlas recomposes source-derived wear and colors into straight courses;
it is not an exact transfer of the original texture atlas. Crop provenance is in
`quality/textures/architecture-provenance.json`.

`blender_buildings.py` supports MCP or background Blender. With a local Blender
installation, set `BIOME_ROOT` to this directory and run, for example:

```sh
BIOME_ROOT="$PWD/assets/biomes" blender -b --python assets/biomes/blender_buildings.py -- rebuild city-offices city-tenement city-kiosk city-water-tower suburb-house suburb-cottage country-barn country-barn-stone forest-cabin ash-ruin ash-ruin-arcade
BIOME_ROOT="$PWD/assets/biomes" blender -b --python assets/biomes/blender_buildings.py -- export forest-lookout ash-pylon
node scripts/optimize-biomes.mjs
npm run buildings:audit
CDP=http://192.168.8.111:9222 npm run buildings:review
CDP=http://192.168.8.111:9222 node scripts/biome-runtime.mjs artifacts/buildings/final
npm run buildings:evaluate
```

Use `audit` for the retained source scenes and `repair` to inspect an isolated
repair candidate. Generic `export` repairs the original reference; use `rebuild`
with the eleven IDs above to reproduce the replacements. The CLI does not install
Blender. MCP execution reads the same Python modules through `biome-bridge.py`,
restores the user's active scene, and saves separate task-owned libraries.

Geometry diagnostics run on source scenes, processed GLBs, and both optimized
runtime exports. `_PART_ID` retains structural-solid membership across glTF UV
seams: intentionally intersecting joinery is not welded into one artificial
nonmanifold shell. UVs are required for textured materials; the optimizer may
remove unused UVs from flat-color materials. The runtime variants retain identical
building geometry, with 2048/1024 texture limits. Other scenery keeps its existing
simplification policy.

Review sheets use the unchanged gameplay camera and native pixel crops. Tall
structures naturally extend beyond this camera; four supplementary full-building
views inspect those upper surfaces. Visual scores are supplied after inspection,
never inferred from triangle counts or test success. Missing/stale evidence and
blocking defects prevent acceptance. Regenerating via the older normalization
pipeline requires rebuilding architectural replacements again before shipping.
