import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { openScores, scoresHandler } from "./server/leaderboards";

// Byte sizes of the runtime assets under public/, keyed by their root-relative
// URL path. The loading screen weighs its progress bar by these so a 20 MB
// boss counts for more than a 100 KB sound effect.
function assetSizes(): Plugin {
  const id = "virtual:asset-sizes";
  const resolved = "\0" + id;
  const scan = () => {
    const root = "public";
    const sizes: Record<string, number> = {};
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const file = join(dir, name);
        const info = statSync(file);
        if (info.isDirectory()) walk(file);
        else if (/\.(glb|wav|ogg|mp3|woff2?)$/.test(name))
          sizes["/" + relative(root, file).split(sep).join("/")] = info.size;
      }
    };
    walk(join(root, "assets"));
    return sizes;
  };
  return {
    name: "asset-sizes",
    resolveId: (source) => (source === id ? resolved : undefined),
    load: (source) =>
      source === resolved
        ? `export default ${JSON.stringify(scan())};`
        : undefined,
  };
}

export default defineConfig({
  plugins: [
    react(),
    assetSizes(),
    {
      name: "shared-leaderboards",
      configureServer(server) {
        const store = openScores(process.env.SCORES_DB || "data/scores.sqlite");
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
});
