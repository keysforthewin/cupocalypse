// Aggregate a V8 .heapsnapshot by node type and constructor name, and diff
// two snapshots to show which object classes grew.
//   node scripts/perf-heap-summary.mjs before.heapsnapshot [after.heapsnapshot] [top]
import fs from "node:fs";
function load(file) {
  const snap = JSON.parse(fs.readFileSync(file, "utf8"));
  const { node_fields, node_types } = snap.snapshot.meta;
  const typeIndex = node_fields.indexOf("type"),
    nameIndex = node_fields.indexOf("name"),
    sizeIndex = node_fields.indexOf("self_size");
  const types = node_types[typeIndex];
  const stride = node_fields.length;
  const nodes = snap.nodes,
    strings = snap.strings;
  const groups = new Map();
  let total = 0,
    count = 0;
  for (let i = 0; i < nodes.length; i += stride) {
    const type = types[nodes[i + typeIndex]];
    let name = strings[nodes[i + nameIndex]];
    if (
      type === "string" ||
      type === "concatenated string" ||
      type === "sliced string"
    )
      name = "(string)";
    else if (type === "code") name = "(code)";
    else if (type === "closure") name = `closure ${name}`;
    else if (type === "array") name = `array ${name}`;
    const key = `${type}: ${name}`;
    const size = nodes[i + sizeIndex];
    const g = groups.get(key) ?? { count: 0, size: 0 };
    g.count++;
    g.size += size;
    groups.set(key, g);
    total += size;
    count++;
  }
  return { groups, total, count };
}
const args = process.argv.slice(2);
const top = Number(args.find((a) => /^\d+$/.test(a)) || 30);
const [before, after] = args.filter((a) => !/^\d+$/.test(a));
const mb = (n) => (n / 1048576).toFixed(1).padStart(8);
const a = load(before);
console.log(`${before}: ${a.count} nodes, ${mb(a.total)} MB`);
if (!after) {
  for (const [k, g] of [...a.groups.entries()]
    .sort((x, y) => y[1].size - x[1].size)
    .slice(0, top))
    console.log(`${mb(g.size)} MB ${String(g.count).padStart(9)}  ${k}`);
} else {
  const b = load(after);
  console.log(`${after}: ${b.count} nodes, ${mb(b.total)} MB`);
  console.log(`\nGrowth by class (after − before):`);
  const keys = new Set([...a.groups.keys(), ...b.groups.keys()]);
  const rows = [...keys].map((k) => {
    const x = a.groups.get(k) ?? { count: 0, size: 0 },
      y = b.groups.get(k) ?? { count: 0, size: 0 };
    return { k, dSize: y.size - x.size, dCount: y.count - x.count, after: y };
  });
  console.log(`   ΔMB    Δcount   after MB  after count  class`);
  for (const r of rows.sort((x, y) => y.dSize - x.dSize).slice(0, top))
    console.log(
      `${mb(r.dSize)} ${String(r.dCount).padStart(9)} ${mb(r.after.size)} ${String(r.after.count).padStart(12)}  ${r.k}`,
    );
}
