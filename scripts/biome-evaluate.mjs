// Evaluates evidence completeness and acceptance. Visual scores are supplied only
// after inspecting the referenced captures; this script never manufactures scores.
import fs from "node:fs";
import path from "node:path";
import { sourceHash, fileHash } from "./biome-evidence.mjs";
const folder = process.argv[2] || "artifacts/biomes/final";
const report = JSON.parse(fs.readFileSync(`${folder}/report.json`));
const scoreFile = `${folder}/assessment.json`;
const ids = ["city", "suburb", "country", "forest", "ash"];
const names = [
  "Iron District",
  "Haven Estates",
  "Golden Hinterlands",
  "Blackpine Wilds",
  "Ashfall Expanse",
];
const dimensions = [
  "identity",
  "craft",
  "materials",
  "composition",
  "temporal",
];
const hash = sourceHash();
if (!fs.existsSync(scoreFile))
  fs.writeFileSync(
    scoreFile,
    JSON.stringify(
      {
        rubric: 1,
        sourceHash: report.sourceHash,
        reviewer: "pending visual inspection",
        rows: report.captures
          .filter((c) => c.biome)
          .map((c) => ({
            ...c,
            dimensions: Object.fromEntries(dimensions.map((d) => [d, null])),
            observations: "",
            evidence: [c.file],
            blockers: [],
          })),
      },
      null,
      2,
    ),
  );
const assessment = JSON.parse(fs.readFileSync(scoreFile)),
  failures = [];
if (hash !== report.sourceHash || assessment.sourceHash !== report.sourceHash)
  failures.push("Source hashes differ; fresh captures and assessment required");
if (report.errors.length) failures.push(...report.errors);
if (!report.runtime?.passed)
  failures.push("Runtime/motion/resource validation is missing or failed");
for (const asset of JSON.parse(
  fs.readFileSync("src/render/biomeAssets.json"),
)) {
  for (const [url, hash] of [
    [asset.url, asset.hash],
    [asset.lowUrl, asset.lowHash],
  ])
    if (fileHash("public" + url.split("?")[0]) !== hash)
      failures.push(`${asset.id}: asset hash mismatch`);
  if (!fs.existsSync(`${folder}/models/${asset.id}.png`))
    failures.push(`${asset.id}: missing model inspection`);
}
for (const id of ids)
  if (!fs.existsSync(`${folder}/closeup-${id}.png`))
    failures.push(`${id}: missing gameplay closeup`);
if (report.runtime?.sourceHash !== hash)
  failures.push("Runtime evidence is stale");
if (!fs.existsSync(`${folder}/transitions.webm`))
  failures.push("Transition recording is missing");
if (
  !fs.existsSync(`${folder}/film.json`) ||
  JSON.parse(fs.readFileSync(`${folder}/film.json`)).sourceHash !== hash
)
  failures.push("Transition recording metadata is missing or stale");
const scores = {};
for (const id of ids) {
  const totals = [];
  for (const seed of ["BIOME-A", "BIOME-B", "BIOME-C"])
    for (const quality of ["high", "performance"]) {
      const row = assessment.rows.find(
        (r) => r.biome === id && r.seed === seed && r.quality === quality,
      );
      if (!row) {
        failures.push(`${id}/${seed}/${quality}: missing assessment`);
        continue;
      }
      if (
        !row.observations ||
        !row.evidence?.length ||
        row.evidence.some((e) => !fs.existsSync(path.join(folder, e)))
      ) {
        failures.push(
          `${id}/${seed}/${quality}: missing observations or evidence`,
        );
        continue;
      }
      const values = dimensions.map((d) => row.dimensions[d]);
      if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 20)) {
        failures.push(`${id}/${seed}/${quality}: incomplete visual scoring`);
        continue;
      }
      const total = values.reduce((a, b) => a + b, 0),
        effective = row.blockers?.length ? Math.min(89, total) : total;
      totals.push(effective);
      if (effective <= 95)
        failures.push(`${id}/${seed}/${quality}: ${effective}/100`);
    }
  scores[id] = totals.length === 6 ? Math.min(...totals) : null;
}
for (const from of ids)
  for (const to of ids)
    if (from !== to)
      for (const quality of ["high", "performance"])
        for (const progress of [0, 0.5, 1]) {
          const capture = report.captures.find(
            (c) =>
              c.from === from &&
              c.to === to &&
              c.quality === quality &&
              c.progress === progress,
          );
          if (!capture || !fs.existsSync(path.join(folder, capture.file)))
            failures.push(
              `${from}→${to}/${quality}/${progress}: missing transition evidence`,
            );
        }
const result = {
  accepted: failures.length === 0,
  scores,
  failures,
  sourceHash: hash,
};
fs.writeFileSync(`${folder}/acceptance.json`, JSON.stringify(result, null, 2));
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const gallery = ids
  .map(
    (id, i) =>
      `<section><h2>${names[i]} <small>${scores[id] ?? "Pending"} / 100</small></h2><div class="grid">${report.captures
        .filter((c) => c.biome === id)
        .map(
          (c) =>
            `<figure><a href="${escape(c.file)}"><img loading="lazy" src="${escape(c.file)}"></a><figcaption>${escape(c.seed)} · ${escape(c.quality)}</figcaption></figure>`,
        )
        .join("")}</div></section>`,
  )
  .join("");
const transitions = ids
  .flatMap((from) =>
    ids
      .filter((to) => to !== from)
      .map(
        (to) =>
          `<details><summary>${names[ids.indexOf(from)]} → ${names[ids.indexOf(to)]}</summary><div class="grid">${report.captures
            .filter((c) => c.from === from && c.to === to)
            .map(
              (c) =>
                `<figure><a href="${escape(c.file)}"><img loading="lazy" src="${escape(c.file)}"></a><figcaption>${escape(c.quality)} · ${c.progress * 100}%</figcaption></figure>`,
            )
            .join("")}</div></details>`,
      ),
  )
  .join("");
const timings = (report.runtime?.reports || [])
  .flatMap((r) =>
    (r.frames || []).map(
      (f) =>
        `<tr><td>${escape(r.quality)}</td><td>${escape(f.biome)}</td><td>${f.p50.toFixed(1)}</td><td>${f.p95.toFixed(1)}</td><td>${f.max.toFixed(1)}</td></tr>`,
    ),
  )
  .join("");
fs.writeFileSync(
  `${folder}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Biome visual review</title><style>body{background:#121a19;color:#e6e4d8;font:16px system-ui;margin:40px}h1{font-size:40px}h2{margin-top:45px}small{color:#a4c6b6}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0}details{margin:16px 0}summary{padding:12px;cursor:pointer}td,th{padding:8px 20px;text-align:left;border-bottom:1px solid #344640}img{width:100%}figcaption{padding:8px;color:#a9b8af}a{color:#bce5c6}pre{white-space:pre-wrap}</style><h1>Five worlds / visual review</h1><p>${result.accepted ? "Accepted: all biomes exceed 95." : "Work in progress: acceptance requirements remain open."}</p><p>Fixed rubric: identity, craft, materials, composition, temporal integration. Subjective visual judgments supported by gameplay-camera captures of runtime assets. Each score is the minimum of three seeds in both quality settings.</p><a href="assessment.json">Detailed assessments</a> · <a href="acceptance.json">Acceptance checks</a> · <a href="report.json">Capture manifest</a>${gallery}<h2>Transitions</h2><p>Five 20-second transition timelines sampled at 5 fps. This visual recording is separate from realtime performance measurements.</p><video controls preload="metadata" style="width:100%;max-width:1280px" src="transitions.webm"></video><h2>All 20 directed transitions</h2>${transitions}<h2>Live timing</h2><p>600 frames per biome and quality, including normal section recycling. Milliseconds per frame.</p><table><tr><th>Quality</th><th>Biome</th><th>Median</th><th>P95</th><th>Max</th></tr>${timings}</table><p><a href="runtime.json">GPU, resource counts and full timing evidence</a></p><h2>Model inspections</h2><div class="grid">${JSON.parse(
    fs.readFileSync("src/render/biomeAssets.json"),
  )
    .map(
      (a) =>
        `<figure><img loading="lazy" src="models/${a.id}.png"><figcaption>${a.id}</figcaption></figure>`,
    )
    .join(
      "",
    )}</div><h2>Open requirements</h2><pre>${escape(failures.join("\n"))}</pre></html>`,
);
console.log(
  JSON.stringify({
    accepted: result.accepted,
    scores,
    failures: failures.length,
  }),
);
if (failures.length) process.exitCode = 1;
