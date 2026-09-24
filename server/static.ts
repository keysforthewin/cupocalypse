import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve, extname, sep, join } from "node:path";
import { ASSET_MANIFEST, type AssetManifest } from "./assetManifest";

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

export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const fingerprinted = /^\/assets\/.+-[\w-]{8}\.(js|css|woff2?)$/;

export function staticHandler(directory: string) {
  const root = resolve(directory);
  const manifest: AssetManifest = JSON.parse(
    readFileSync(join(root, ASSET_MANIFEST), "utf8"),
  );
  const hashes = new Map<
    string,
    { size: number; mtime: number; hash: string }
  >();
  return (req: IncomingMessage, res: ServerResponse) => {
    // Errors and redirects must never inherit the long-lived asset policy.
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      const path = pathname === "/" ? "/index.html" : pathname;
      const file = resolve(root, `.${path}`);
      const info = file.startsWith(root + sep) ? statSync(file) : null;
      if (!info?.isFile()) {
        res.writeHead(404).end();
        return;
      }
      const version = manifest.versions[path];
      const requestedVersion = url.searchParams.get("v");
      // An old page can request an asset from an earlier release. Point it at
      // the current content URL rather than caching new bytes under an old one.
      if (
        version &&
        requestedVersion !== null &&
        requestedVersion !== version
      ) {
        url.searchParams.set("v", version);
        res.writeHead(307, { Location: url.search }).end();
        return;
      }
      let hash = version;
      if (!hash) {
        let cached = hashes.get(file);
        if (
          !cached ||
          cached.size !== info.size ||
          cached.mtime !== info.mtimeMs
        ) {
          cached = {
            size: info.size,
            mtime: info.mtimeMs,
            hash: createHash("sha256").update(readFileSync(file)).digest("hex"),
          };
          hashes.set(file, cached);
        }
        hash = cached.hash;
      }
      const etag = `"${hash}"`;
      const immutable = version
        ? requestedVersion === version
        : fingerprinted.test(path);
      const headers = {
        "Cache-Control": immutable ? IMMUTABLE_CACHE : "no-cache",
        ETag: etag,
        "Last-Modified": info.mtime.toUTCString(),
      };
      const since = Date.parse(req.headers["if-modified-since"] ?? "");
      const matches = req.headers["if-none-match"];
      if (
        matches
          ? matches
              .split(",")
              .some(
                (value) =>
                  value.trim() === "*" ||
                  value.trim().replace(/^W\//, "") === etag,
              )
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
  };
}
