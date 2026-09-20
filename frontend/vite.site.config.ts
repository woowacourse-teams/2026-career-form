import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
const sitePath = (path: string) =>
  fileURLToPath(new URL(`./site/${path}`, import.meta.url));
export default defineConfig({
  root: sitePath(""),
  envDir: sitePath(""),
  publicDir: false,
  resolve: { alias: { "wxt/browser": sitePath("demo/browser.ts") } },
  build: {
    outDir: "../dist-site",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: sitePath("index.html"),
        onboarding: sitePath("onboarding/index.html"),
        privacy: sitePath("privacy/index.html"),
        terms: sitePath("terms/index.html"),
        demo: sitePath("demo/index.html"),
      },
    },
  },
  server: { host: "127.0.0.1", port: 4175, strictPort: true },
  preview: { host: "127.0.0.1", port: 4175, strictPort: true },
});
