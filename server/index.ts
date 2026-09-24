import { createServer } from "node:http";
import { resolve } from "node:path";
import { staticHandler } from "./static";
import { openScores, scoresHandler } from "./leaderboards";

const root = resolve("dist");
const store = openScores(process.env.SCORES_DB || "data/scores.sqlite");
const api = scoresHandler(store);
const assets = staticHandler(root);
const server = createServer((req, res) => {
  void api(req, res, () => assets(req, res));
});
server.requestTimeout = 15000;
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log("Cupocalypse listening on port", process.env.PORT || 3000),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
