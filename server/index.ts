import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { openScores, scoresHandler } from "./leaderboards";

const root = resolve("dist");
const store = openScores(process.env.SCORES_DB || "data/scores.sqlite");
const api = scoresHandler(store);
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};
const server = createServer((req, res) => {
  void api(req, res, () => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(
        new URL(req.url || "/", "http://localhost").pathname,
      );
      const file = resolve(
        root,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      if (!file.startsWith(root + sep) || !statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(file)
        .on("error", () => res.destroy())
        .pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  });
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
