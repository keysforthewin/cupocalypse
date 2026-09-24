// Compare in-page perf sampler runs saved by the chrome-devtools MCP scenario
// (artifacts/perf/browser-*.json). Prints one row per 10 s window for each run
// and a summary of the windows they share.
//   node scripts/perf-browser-compare.mjs artifacts/perf/browser-before-bot.json artifacts/perf/browser-after-bot.json
import fs from "node:fs";
const files = process.argv.slice(2);
if (!files.length) {
  console.error(
    "usage: node scripts/perf-browser-compare.mjs <run.json> [run.json...]",
  );
  process.exit(1);
}
const runs = files.map((f) => ({
  file: f,
  ...JSON.parse(fs.readFileSync(f, "utf8")),
}));
const cols = [
  ["t", 4],
  ["boss", 4],
  ["army", 5],
  ["fps", 5],
  ["p50", 4],
  ["p95", 4],
  ["max", 5],
  ["simMsPerTick", 7],
  ["simMaxMs", 6],
  ["heapMinMb", 7],
  ["heapMb", 6],
  ["active", 6],
  ["enemies", 7],
  ["effects", 7],
  ["objects", 7],
  ["calls", 5],
  ["programs", 8],
  ["guns", 4],
];
const fmt = (v, w) => String(v ?? "-").padStart(w);
const quantile = (xs, q) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
const mean = (xs) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
for (const run of runs) {
  console.log(
    `\n== ${run.label ?? run.file} (${run.samples.length} windows, done=${run.done})`,
  );
  console.log(
    cols
      .map(([c, w]) =>
        fmt(
          c === "simMsPerTick"
            ? "sim/tk"
            : c === "simMaxMs"
              ? "simMax"
              : c === "heapMinMb"
                ? "heapMn"
                : c,
          w,
        ),
      )
      .join(" "),
  );
  for (const s of run.samples)
    console.log(cols.map(([c, w]) => fmt(s[c], w)).join(" "));
}
const shared = Math.min(...runs.map((r) => r.samples.length));
const window = (r, from, to) =>
  r.samples.filter((s) => s.t > from && s.t <= to);
console.log(
  `\n== summary over the first ${shared} windows (t <= ${shared * 10} s)`,
);
const rows = [
  [
    "fps mean",
    (r) => mean(window(r, 0, shared * 10).map((s) => s.fps)).toFixed(1),
  ],
  [
    "fps min",
    (r) => Math.min(...window(r, 0, shared * 10).map((s) => s.fps)).toFixed(1),
  ],
  [
    "frame p95 median (ms)",
    (r) =>
      quantile(
        window(r, 0, shared * 10).map((s) => s.p95),
        0.5,
      ),
  ],
  [
    "frame p95 worst (ms)",
    (r) => Math.max(...window(r, 0, shared * 10).map((s) => s.p95)),
  ],
  [
    "frame max worst (ms)",
    (r) => Math.max(...window(r, 0, shared * 10).map((s) => s.max)),
  ],
  [
    "sim ms/tick mean",
    (r) =>
      mean(window(r, 0, shared * 10).map((s) => s.simMsPerTick)).toFixed(3),
  ],
  [
    "sim ms/tick last 2 min",
    (r) =>
      mean(
        window(r, shared * 10 - 120, shared * 10).map((s) => s.simMsPerTick),
      ).toFixed(3),
  ],
  [
    "sim max ms",
    (r) => Math.max(...window(r, 0, shared * 10).map((s) => s.simMaxMs)),
  ],
  ["heapMin first (MB)", (r) => r.samples[0]?.heapMinMb],
  ["heapMin last (MB)", (r) => window(r, 0, shared * 10).at(-1)?.heapMinMb],
  [
    "heapMin growth (MB)",
    (r) =>
      (window(r, 0, shared * 10).at(-1)?.heapMinMb ?? 0) -
      (r.samples[0]?.heapMinMb ?? 0),
  ],
  [
    "heap peak (MB)",
    (r) =>
      Math.max(
        ...window(r, 0, shared * 10).map((s) => s.heapMaxMb ?? s.heapMb),
      ),
  ],
  [
    "active projectiles peak",
    (r) => Math.max(...window(r, 0, shared * 10).map((s) => s.active)),
  ],
  [
    "active projectiles mean",
    (r) => mean(window(r, 0, shared * 10).map((s) => s.active)).toFixed(0),
  ],
  ["scene objects last", (r) => window(r, 0, shared * 10).at(-1)?.objects],
  ["draw calls last", (r) => window(r, 0, shared * 10).at(-1)?.calls],
  ["programs last", (r) => window(r, 0, shared * 10).at(-1)?.programs],
  [
    "boss reached",
    (r) => Math.max(...window(r, 0, shared * 10).map((s) => s.boss)),
  ],
  ["distance last", (r) => window(r, 0, shared * 10).at(-1)?.distance],
];
const w0 = 26,
  w = 16;
console.log(
  "metric".padEnd(w0) +
    runs
      .map((r) =>
        String(r.label ?? r.file)
          .slice(0, w - 1)
          .padStart(w),
      )
      .join(""),
);
for (const [name, f] of rows)
  console.log(
    name.padEnd(w0) + runs.map((r) => String(f(r)).padStart(w)).join(""),
  );
