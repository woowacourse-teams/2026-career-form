import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    css: {
      include: /WorkflowResults\.module\.css|sidepanel\/App\.module\.css/,
      modules: { classNameStrategy: "scoped" },
    },
    coverage: {
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.test-fixtures.{ts,tsx}",
        "src/autofill/workflow/test-utils/**",
        "**/main.tsx",
      ],
      include: [
        "entrypoints/{options,popup,sidepanel}/**/*.tsx",
        "src/**/*.{ts,tsx}",
        "site/**/*.{ts,tsx}",
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
