import fs from "node:fs";
import { Simulation } from "../src/game/simulation";
import { fresh, purchase, PRICES, earnings } from "../src/game/persistence";
import { bot } from "../src/game/bot";
let profile = fresh(),
  seconds = 0;
const purchases = [];
let runs = 0;
while (profile.upgrades.some((l) => l < 5) && runs < 150) {
  const s = new Simulation(`career-${runs}`, "Classic", profile.upgrades);
  while (!s.over && s.tick < 54000) s.update({ x: bot(s) }, false);
  profile.currency += earnings(s);
  seconds += s.time + 35;
  runs++;
  let bought = true;
  while (bought) {
    bought = false;
    for (let i = 0; i < 3; i++) {
      if (
        profile.upgrades[i] < 5 &&
        profile.currency >= PRICES[profile.upgrades[i]]
      ) {
        profile = purchase(profile, i);
        purchases.push({
          run: runs,
          hours: seconds / 3600,
          upgrade: i,
          level: profile.upgrades[i],
        });
        bought = true;
      }
    }
  }
}
const report = {
  runs,
  hours: seconds / 3600,
  upgrades: profile.upgrades,
  firstPurchase: purchases[0],
  purchases,
  assumption:
    "Legal-speed bot, Classic, 35 seconds between runs; player skill and other protocols change timing.",
};
fs.writeFileSync("artifacts/progression.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    runs,
    hours: report.hours,
    upgrades: profile.upgrades,
    firstPurchase: purchases[0],
  }),
);
