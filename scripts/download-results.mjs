import fs from "node:fs";
for (const name of ["trellis-soldier", "meshy-base"]) {
  const file = `assets/originals/${name}.json`;
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file));
  const url =
    data.basic_animations?.walking_glb?.url ||
    data.model_mesh?.url ||
    data.model_glb?.url;
  if (!url) continue;
  const dest = `assets/originals/${name}-runtime-source.glb`;
  if (!fs.existsSync(dest))
    fs.writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()));
  console.log(name, fs.statSync(dest).size);
}
