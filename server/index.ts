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
  ".ogg": "audio/ogg",
};
// Vite fingerprints bundle files (index-C817BRV2.js), so they never change.
const fingerprinted = /-[\w-]{8}\.(js|css|woff2?)$/;
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
      const info = file.startsWith(root + sep) ? statSync(file) : null;
      if (!info?.isFile()) {
        res.writeHead(404).end();
        return;
      }
      // Game assets run to tens of megabytes. Without validators the browser
      // downloaded all of them again on every visit; now it revalidates and
      // gets a 304 when nothing changed.
      const etag = `W/"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
      const headers = {
        "Cache-Control": fingerprinted.test(file)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        ETag: etag,
        "Last-Modified": info.mtime.toUTCString(),
      };
      const since = Date.parse(req.headers["if-modified-since"] ?? "");
      if (
        req.headers["if-none-match"]
          ? req.headers["if-none-match"] === etag
          : since >= Math.floor(info.mtimeMs / 1000) * 1000
      ) {
        res.writeHead(304, headers).end();
        return;
      }
      res.writeHead(200, {
        ...headers,
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Content-Length": info.size,
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
