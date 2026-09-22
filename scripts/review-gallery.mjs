import fs from "node:fs";
const names = [
  "infected",
  "soldier",
  "walker",
  "runner",
  "crawler",
  "riot-guard",
  "charger",
  "spitter",
  "bloater",
  "screamer",
  "carrier",
  "gunner",
  "bulwark",
  "broodmass",
  "congregation",
];
const html = `<!doctype html><html><head><meta charset="UTF-8"><title>Asset comparison and silhouette review</title><style>body{margin:0;padding:30px;background:#172320;color:#d6dfcc;font:16px sans-serif}h1{font-size:28px;margin:0 0 20px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}figure{margin:0;background:#23322a}img{width:100%;display:block}figcaption{padding:10px;text-transform:uppercase;letter-spacing:1px}</style></head><body><h1>Gate Runner — asset comparison & roster</h1><main>${names.map((n) => `<figure><img src="../assets/processed/${n}-review.png"><figcaption>${n}</figcaption></figure>`).join("")}</main></body></html>`;
fs.writeFileSync("artifacts/asset-review.html", html);
