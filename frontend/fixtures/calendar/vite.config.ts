import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api/v1/generic/interaction-decisions": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
