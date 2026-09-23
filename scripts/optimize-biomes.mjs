import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const dir = "assets/biomes/processed",
  out = "public/assets/biomes";
fs.mkdirSync(out, { recursive: true });
const manifest = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".glb"))) {
  const id = file.slice(0, -4),
    input = `${dir}/${file}`;
  const info = JSON.parse(fs.readFileSync(`${dir}/${id}.json`));
  const simplify = info.simplify !== false;
  for (const low of [false, true]) {
    const output = `${out}/${id}${low ? "-lod" : ""}.glb`;
    if (
      !fs.existsSync(output) ||
      fs.statSync(output).mtimeMs <
        Math.max(
          fs.statSync(input).mtimeMs,
          fs.statSync(`${dir}/${id}.json`).mtimeMs,
          fs.statSync("scripts/optimize-biomes.mjs").mtimeMs,
        )
    ) {
      const args = [
        "optimize",
        input,
        output,
        "--compress",
        "false",
        "--texture-compress",
        "webp",
        "--texture-size",
        low ? "1024" : "2048",
        "--simplify",
        String(low && simplify),
        "--flatten",
        "true",
        "--join",
        "true",
      ];
      if (low && simplify)
        args.push(
          "--simplify-ratio",
          String(info.simplifyRatio ?? 0.4),
          "--simplify-error",
          String(info.simplifyError ?? 0.005),
        );
      const r = spawnSync("node_modules/.bin/gltf-transform", args, {
        encoding: "utf8",
      });
      if (r.status !== 0) throw Error(r.stderr || r.stdout);
    }
  }
  const hash = createHash("sha256")
    .update(fs.readFileSync(`${out}/${id}.glb`))
    .digest("hex");
  const lowHash = createHash("sha256")
    .update(fs.readFileSync(`${out}/${id}-lod.glb`))
    .digest("hex");
  manifest.push({
    ...info,
    url: `/assets/biomes/${id}.glb?v=${hash.slice(0, 12)}`,
    lowUrl: `/assets/biomes/${id}-lod.glb?v=${lowHash.slice(0, 12)}`,
    hash,
    lowHash,
    source:
      info.qualitySource ??
      (info.source === "Blender procedural authoring"
        ? "assets/biomes/blender_landmarks.py"
        : `assets/biomes/originals/${id}.glb`),
  });
}
fs.writeFileSync(
  "src/render/biomeAssets.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Exported", manifest.length, "biome assets");
