import fs from "node:fs";
import { spawnSync } from "node:child_process";
fs.mkdirSync("public/assets/runtime", { recursive: true });
const files = fs
  .readdirSync("assets/processed")
  .filter((f) => f.endsWith(".glb"));
const report = [];
for (const file of files) {
  for (const low of [false, true]) {
    const input = `assets/processed/${file}`,
      output = `public/assets/runtime/${file.replace(".glb", low ? "-lod.glb" : ".glb")}`;
    const args = [
      "optimize",
      input,
      output,
      "--compress",
      "false",
      "--texture-compress",
      "webp",
      "--texture-size",
      low ? "512" : "1024",
      "--flatten",
      "false",
      "--join",
      "false",
      "--instance",
      "false",
      "--palette",
      "false",
      "--simplify",
      String(low),
    ];
    if (low) args.push("--simplify-ratio", ".25", "--simplify-error", ".02");
    const r = spawnSync("node_modules/.bin/gltf-transform", args, {
      encoding: "utf8",
    });
    if (r.status !== 0) throw Error(r.stderr || r.stdout);
    report.push({
      file,
      low,
      before: fs.statSync(input).size,
      after: fs.statSync(output).size,
    });
    console.log(output, fs.statSync(output).size);
  }
}
const manifest = JSON.parse(fs.readFileSync("src/render/assets.json"));
for (const key of Object.keys(manifest))
  manifest[key] = `/assets/runtime/${key}.glb`;
fs.writeFileSync("src/render/assets.json", JSON.stringify(manifest, null, 2));
fs.writeFileSync(
  "artifacts/asset-optimization.json",
  JSON.stringify(report, null, 2),
);
