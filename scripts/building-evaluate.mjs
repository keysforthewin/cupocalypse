import fs from "node:fs";
import path from "node:path";
import {
  catalog,
  buildingHash,
  evaluateBuildings,
  hashFile,
} from "./building-quality.mjs";
const folder = process.argv[2] || "artifacts/buildings/final";
const read = (name) => JSON.parse(fs.readFileSync(`${folder}/${name}.json`));
const report = read("report");
if (fs.existsSync(`${folder}/runtime.json`)) report.runtime = read("runtime");
if (!fs.existsSync(`${folder}/assessment.json`)) {
  fs.writeFileSync(
    `${folder}/assessment.json`,
    JSON.stringify(
      {
        sourceHash: report.sourceHash,
        reviewer: "pending visual inspection",
        rows: report.captures.map((c) => ({
          id: c.id,
          seed: c.seed,
          quality: c.quality,
          scores: Object.fromEntries(
            Object.keys(catalog.weights).map((k) => [k, null]),
          ),
          observations: "",
          evidence: [c.file],
          blockers: [],
        })),
      },
      null,
      2,
    ),
  );
}
const assessment = read("assessment");
const result = evaluateBuildings(report, assessment, {
  currentHash: buildingHash(),
});
for (const id of Object.keys(result.scores))
  if (result.scores[id] !== null)
    result.scores[id] = Number(result.scores[id].toFixed(2));
const geometry = fs.existsSync(`${folder}/geometry.json`)
  ? read("geometry")
  : null;
if (!geometry?.passed) result.failures.push("Missing or failed geometry audit");
else
  for (const row of geometry.rows)
    if (!fs.existsSync(row.file) || hashFile(row.file) !== row.hash)
      result.failures.push(`${row.id}/${row.stage}: stale geometry audit`);
const manifest = JSON.parse(fs.readFileSync("src/render/biomeAssets.json"));
for (const id of catalog.assets)
  for (const quality of catalog.qualities) {
    const a = manifest.find((a) => a.id === id),
      file = "public" + (quality === "high" ? a.url : a.lowUrl).split("?")[0];
    if (hashFile(file) !== report.assetHashes[`${id}/${quality}`])
      result.failures.push(`${id}/${quality}: runtime asset changed`);
    const diagnostic = `assets/biomes/quality/final/${id}.json`;
    if (!fs.existsSync(diagnostic))
      result.failures.push(`${id}: missing Blender source audit`);
  }
for (const id of Object.keys(result.scores)) {
  if (
    report.inspections?.[id]?.length !== 4 ||
    report.inspections[id].some((f) => !fs.existsSync(f))
  )
    result.failures.push(`${id}: missing full-building diagnostic views`);
}
result.accepted = result.failures.length === 0;
fs.writeFileSync(`${folder}/acceptance.json`, JSON.stringify(result, null, 2));
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const link = (file) => path.relative(folder, file).split(path.sep).join("/");
const sections = Object.entries(result.scores)
  .map(
    ([id, score]) =>
      `<section><h2>${escape(id)} · ${score ?? "unreviewed"}</h2><p>${escape(assessment.rows.find((r) => r.id === id)?.observations || "Pending inspection")}</p><div class="grid">${report.captures
        .filter((c) => c.id === id)
        .map(
          (c) =>
            `<figure><a href="${escape(link(c.file))}"><img loading="lazy" src="${escape(link(c.file))}"></a><figcaption>${escape(c.seed)} · ${escape(c.quality)} · 0°, 90°, 180°, 270°</figcaption></figure>`,
        )
        .join("")}</div></section>`,
  )
  .join("");
fs.writeFileSync(
  `${folder}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Building surface review</title><style>body{background:#17201e;color:#eee9da;font:16px system-ui;max-width:1440px;margin:40px auto;padding:20px}a{color:#b5d8cf}h1{font-size:40px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}figure{margin:0}img{width:100%}figcaption{padding:8px}section{margin:48px 0}pre{white-space:pre-wrap}</style><h1>Building surface review</h1><p>${result.accepted ? "Accepted: every asset and procedural variant scores at least 95." : "Incomplete: acceptance requirements remain open."}</p><p>Structure 30%, integrity 25%, shading 20%, UV consistency 15%, runtime fidelity 10%. Minimum score across three seeds and both quality modes; category floor 90. Visual judgments concern the gameplay camera, not an independent AAA certification.</p><p><a href="assessment.json">Written assessments</a> · <a href="geometry.json">Geometry audit</a> · <a href="runtime.json">Runtime checks</a> · <a href="acceptance.json">Acceptance</a></p><p>Each sheet contains four exterior orientations cropped at native gameplay resolution. Open an image to inspect it at original pixel size.</p>${sections}<h2>Open requirements</h2><pre>${escape(result.failures.join("\n"))}</pre></html>`,
);
console.log(
  JSON.stringify({
    accepted: result.accepted,
    scores: result.scores,
    failures: result.failures.length,
  }),
);
if (!result.accepted) process.exitCode = 1;
