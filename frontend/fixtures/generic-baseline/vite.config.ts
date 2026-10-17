import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const backendUrl =
  process.env.CF_BASELINE_BACKEND_URL ?? "http://127.0.0.1:18080";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    fs: { allow: [repositoryRoot] },
    proxy: {
      "/api": {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
});
