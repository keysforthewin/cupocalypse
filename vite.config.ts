import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { openScores, scoresHandler } from "./server/leaderboards";
export default defineConfig({
  plugins: [
    react(),
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
  envDir: "/tmp/gate-runner-no-env",
  build: { chunkSizeWarningLimit: 1800 },
});
