import fs from "node:fs";
import { spawnSync } from "node:child_process";
const roster = [
  "walker",
  "runner",
  "crawler",
  "riot-guard",
  "charger",
  "spitter",
  "bloater",
  "screamer",
  "carrier",
  "gunner",
  "bulwark",
  "broodmass",
  "congregation",
];
for (const name of roster) {
  const source = `assets/originals/${name}-mesh.glb`,
    dest = `assets/processed/${name}.glb`;
  if (!fs.existsSync(source)) {
    console.log(name, "not generated yet");
    continue;
  }
  if (fs.existsSync(dest) && fs.existsSync(dest.replace(".glb", "-review.png")))
    continue;
  const r = spawnSync(
    "blender",
    ["-b", "--python", "scripts/process-assets.py", "--", source, dest, name],
    { encoding: "utf8", env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: "1" } },
  );
  fs.writeFileSync(`artifacts/process-${name}.log`, r.stdout + r.stderr);
  console.log(
    name,
    r.status === 0 && fs.existsSync(dest) ? "processed" : "failed",
  );
}
const manifest = Object.fromEntries(
  roster
    .filter((name) => fs.existsSync(`assets/processed/${name}.glb`))
    .map((name) => [name, `/assets/${name}.glb`]),
);
fs.writeFileSync("src/render/assets.json", JSON.stringify(manifest, null, 2));
