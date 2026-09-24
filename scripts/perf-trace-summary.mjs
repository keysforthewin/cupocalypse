// Summarize a Chrome performance trace (.json or .json.gz) without loading it
// all in memory: aggregates CPU profile self time by function, and reports
// GC and frame statistics.
//   node scripts/perf-trace-summary.mjs artifacts/perf/trace.json.gz [top]
import fs from "node:fs";
import zlib from "node:zlib";
const file = process.argv[2];
const top = Number(process.argv[3] || 40);
const keep = new Set([
  "Profile",
  "ProfileChunk",
  "MinorGC",
  "MajorGC",
  "V8.GCScavenger",
  "V8.GCFinalizeMC",
  "V8.GCIncrementalMarking",
  "V8.GCIncrementalMarkingStart",
  "DrawFrame",
  "RunTask",
]);
const profiles = new Map();
let gcUs = 0,
  gcCount = 0;
const frames = [];
const tasks = [];
function handle(e) {
  if (!keep.has(e.name)) return;
  if (e.name === "Profile" && e.args?.data?.startTime !== undefined)
    profiles.set(`${e.pid}:${e.tid}:${e.id}`, {
      pid: e.pid,
      tid: e.tid,
      samples: 0,
      nodes: new Map(),
      sampleIds: [],
      deltas: [],
    });
  else if (e.name === "ProfileChunk") {
    const p = profiles.get(`${e.pid}:${e.tid}:${e.id}`);
    if (!p) return;
    const d = e.args.data;
    if (d.cpuProfile?.nodes)
      for (const n of d.cpuProfile.nodes) p.nodes.set(n.id, n);
    if (d.cpuProfile?.samples) {
      for (const s of d.cpuProfile.samples) p.sampleIds.push(s);
      p.samples += d.cpuProfile.samples.length;
    }
    if (d.timeDeltas) for (const t of d.timeDeltas) p.deltas.push(t);
  } else if (e.name === "DrawFrame") {
    if (e.ph === "I" || e.ph === "X") frames.push(e.ts);
  } else if (e.name === "RunTask") {
    if (e.dur) tasks.push(e.dur);
  } else if (e.dur) {
    gcUs += e.dur;
    gcCount++;
  }
}
// Stream line by line: Chrome writes one event per line inside traceEvents.
import readline from "node:readline";
await new Promise((resolve, reject) => {
  let stream = fs.createReadStream(file);
  if (file.endsWith(".gz")) stream = stream.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  rl.on("line", (line) => {
    let text = line.trim();
    if (!text.startsWith("{")) return;
    if (text.endsWith(",")) text = text.slice(0, -1);
    if (!text.endsWith("}")) return;
    try {
      handle(JSON.parse(text));
    } catch {}
  });
  rl.on("close", resolve);
  stream.on("error", reject);
});
// Pick the thread whose profile contains the game loop (App.tsx), else the busiest.
const hasLoop = (p) =>
  [...p.nodes.values()].some((n) =>
    (n.callFrame.url || "").includes("/src/App.tsx"),
  );
const profile =
  [...profiles.values()]
    .filter(hasLoop)
    .sort((a, b) => b.samples - a.samples)[0] ??
  [...profiles.values()].sort((a, b) => b.samples - a.samples)[0];
if (profile)
  console.log(
    `thread pid=${profile.pid} tid=${profile.tid} of ${profiles.size} profiles`,
  );
if (!profile) {
  console.log("no CPU profile in trace");
  process.exit(0);
}
const self = new Map();
const total = new Map();
let totalUs = 0;
const label = (n) => {
  const f = n.callFrame;
  const url = (f.url || "")
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/\?.*$/, "");
  return `${f.functionName || "(anonymous)"} ${url}:${f.lineNumber + 1}`;
};
for (let i = 0; i < profile.sampleIds.length; i++) {
  const dt = profile.deltas[i] ?? 0;
  totalUs += dt;
  let n = profile.nodes.get(profile.sampleIds[i]);
  if (!n) continue;
  const key = label(n);
  self.set(key, (self.get(key) ?? 0) + dt);
  const seen = new Set();
  while (n) {
    const k = label(n);
    if (!seen.has(k)) {
      seen.add(k);
      total.set(k, (total.get(k) ?? 0) + dt);
    }
    n = n.parent !== undefined ? profile.nodes.get(n.parent) : undefined;
  }
}
const ms = (us) => (us / 1000).toFixed(1).padStart(8);
const pct = (us) => ((100 * us) / totalUs).toFixed(1).padStart(5);
console.log(
  `profile: ${profile.samples} samples, ${(totalUs / 1000).toFixed(0)} ms sampled`,
);
console.log(`\nTop self time:`);
for (const [k, v] of [...self.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, top))
  console.log(`${ms(v)} ms ${pct(v)}%  ${k}`);
console.log(`\nTop total time (inclusive):`);
for (const [k, v] of [...total.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, top))
  console.log(`${ms(v)} ms ${pct(v)}%  ${k}`);
const byFile = new Map();
for (const [k, v] of self) {
  const f = k.split(" ").at(-1).replace(/:\d+$/, "") || "(native)";
  byFile.set(f, (byFile.get(f) ?? 0) + v);
}
console.log(`\nSelf time by file:`);
for (const [k, v] of [...byFile.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25))
  console.log(`${ms(v)} ms ${pct(v)}%  ${k}`);
console.log(
  `\nGC events: ${gcCount}, ${(gcUs / 1000).toFixed(0)} ms (${pct(gcUs)}% of sampled time)`,
);
if (frames.length > 2) {
  frames.sort((a, b) => a - b);
  const intervals = frames
    .slice(1)
    .map((t, i) => (t - frames[i]) / 1000)
    .sort((a, b) => a - b);
  const q = (p) => intervals[Math.floor(intervals.length * p)].toFixed(1);
  console.log(
    `DrawFrame intervals: n=${intervals.length} p50=${q(0.5)} p90=${q(0.9)} p99=${q(0.99)} max=${intervals.at(-1).toFixed(1)} ms`,
  );
}
if (tasks.length) {
  tasks.sort((a, b) => a - b);
  const q = (p) => (tasks[Math.floor(tasks.length * p)] / 1000).toFixed(1);
  const long = tasks.filter((t) => t > 50000).length;
  console.log(
    `RunTask durations: n=${tasks.length} p50=${q(0.5)} p90=${q(0.9)} p99=${q(0.99)} max=${(tasks.at(-1) / 1000).toFixed(1)} ms, >50ms: ${long}`,
  );
}
