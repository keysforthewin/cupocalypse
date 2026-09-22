import fs from "node:fs";
const l = JSON.parse(fs.readFileSync("assets/ledger.json"));
const list = Object.values(l.jobs);
const report = {
  cap: 100,
  reserved: list.reduce((s, j) => s + j.reserve, 0),
  byBucket: Object.fromEntries(
    Object.keys(l.buckets).map((b) => [
      b,
      {
        limit: l.buckets[b],
        reserved: list
          .filter((j) => j.bucket === b)
          .reduce((s, j) => s + j.reserve, 0),
      },
    ]),
  ),
  states: list.reduce((s, j) => ((s[j.state] = (s[j.state] || 0) + 1), s), {}),
  note: "Reservations are conservative upper allowances, not invoices. Failed requests retain their reservation. No pending generation is required for gameplay.",
};
fs.writeFileSync(
  "artifacts/generation-budget.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
