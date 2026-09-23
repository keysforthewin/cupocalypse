import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const root = "assets/bosses/processed",
  out = "public/assets/bosses";
fs.mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of fs.readdirSync(root).filter((f) => f.endsWith(".glb"))) {
  const name = file.replace(/(-lod)?\.glb$/, "");
  const target = `${out}/${file}`;
  if (
    fs.existsSync(target) &&
    fs.statSync(target).mtimeMs > fs.statSync(`${root}/${file}`).mtimeMs
  )
    continue;
  const doc = await io.read(`${root}/${file}`);
  const all = doc.getRoot().listAnimations();
  if (all.some((a) => a.getName().startsWith(`${name}:`)))
    for (const animation of all) {
      if (!animation.getName().startsWith(`${name}:`)) animation.dispose();
      else
        animation.setName(
          animation
            .getName()
            .split(":")
            .at(-1)
            .replace(/\.\d+$/, ""),
        );
    }
  const staging = `${root}/${name}-export-temp.glb`;
  await io.write(staging, doc);
  execFileSync(
    "node_modules/.bin/gltf-transform",
    [
      "optimize",
      staging,
      target,
      "--compress",
      "false",
      "--texture-compress",
      "webp",
      "--texture-size",
      file.includes("-lod") ? "1024" : "2048",
      "--simplify",
      "false",
      "--flatten",
      "false",
      "--join",
      "false",
    ],
    { stdio: "pipe" },
  );
  fs.unlinkSync(staging);
  console.log(file, fs.statSync(target).size);
}
