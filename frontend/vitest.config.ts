import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["**/*.test.{ts,tsx}", "**/main.tsx"],
      include: [
        "entrypoints/{options,popup,sidepanel}/App.tsx",
        "src/**/*.{ts,tsx}",
      ],
      provider: "v8",
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
