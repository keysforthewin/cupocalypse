import fs from "node:fs";
import { createHash } from "node:crypto";
export const SOURCE_FILES = [
  "Environment.tsx",
  "biomeModels.ts",
  "biomes.ts",
  "biomeAssets.json",
  "BiomeAtmosphere.tsx",
  "textures.ts",
  "roadMath.ts",
  "Scene.tsx",
  "presentation.ts",
]
  .map((f) => "src/render/" + f)
  .concat("src/style.css");
export const sourceHash = () =>
  createHash("sha256")
    .update(SOURCE_FILES.map((f) => fs.readFileSync(f)).join("\n"))
    .digest("hex");
export const fileHash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
