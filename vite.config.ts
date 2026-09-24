import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import {
  assetManifest,
  ASSET_MANIFEST,
  type AssetManifest,
} from "./server/assetManifest";
import { versionAssetUrl } from "./src/game/paths";
import { openScores, scoresHandler } from "./server/leaderboards";

// One manifest drives runtime URLs, CSS/HTML references, download progress,
// and the production server's cache policy.
function publicAssets(manifest: AssetManifest, production: boolean): Plugin {
  const id = "virtual:asset-sizes";
  const resolved = "\0" + id;
  return {
    name: "versioned-public-assets",
    enforce: "pre",
    resolveId: (source) => (source === id ? resolved : undefined),
    load: (source) =>
      source === resolved
        ? `export default ${JSON.stringify(manifest.sizes)};`
        : undefined,
    transform(code, id) {
      if (!production || !id.endsWith(".css")) return;
      return code.replace(
        /url\((['"]?)([^)'"\s]+)\1\)/g,
        (_, quote, url) =>
          `url(${quote}${versionAssetUrl(url, manifest.versions)}${quote})`,
      );
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (!production) return html;
        return html.replace(
          /((?:src|href|content)=["'])([^"']+)(["'])/g,
          (_, prefix, url, quote) => {
            const placeholder = url.startsWith("%BASE_URL%");
            const path = placeholder
              ? "/" + url.slice("%BASE_URL%".length)
              : url;
            const versioned = versionAssetUrl(path, manifest.versions);
            return (
              prefix +
              (placeholder ? "%BASE_URL%" + versioned.slice(1) : versioned) +
              quote
            );
          },
        );
      },
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: ASSET_MANIFEST,
        source: JSON.stringify(manifest, null, 2),
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const manifest = assetManifest(
    "public",
    process.env.ASSET_CACHE_VERSION || "1",
  );
  return {
    define: {
      __PUBLIC_ASSET_VERSIONS__: JSON.stringify(
        command === "build" ? manifest.versions : {},
      ),
    },
    plugins: [
      react(),
      publicAssets(manifest, command === "build"),
      {
        name: "shared-leaderboards",
        configureServer(server) {
          const store = openScores(
            process.env.SCORES_DB || "data/scores.sqlite",
          );
          server.middlewares.use(scoresHandler(store));
          server.httpServer?.once("close", () => store.close());
        },
      },
    ],
    server: {
      host: "0.0.0.0",
      allowedHosts: ["game", "localhost"],
      port: 5173,
      strictPort: true,
    },
    base: process.env.BASE_PATH || "/",
    envDir: "/tmp/gate-runner-no-env",
    build: { chunkSizeWarningLimit: 1800 },
  };
});
