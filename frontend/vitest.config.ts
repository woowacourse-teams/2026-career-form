import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import { searchFixtureServer } from "./tests/browser/search-fixture-server.ts";
import {
  coverageThresholds,
  createRequireBrowserSuite,
} from "./tests/vitest/run-policy.ts";

export default defineConfig({
  test: {
    reporters: ["default", createRequireBrowserSuite()],
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
      reportOnFailure: true,
      thresholds: coverageThresholds(process.argv),
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          // Some integrations perform two independently bounded 5s workflows.
          // Allow both to finish under coverage without changing their limits.
          testTimeout: 15_000,
          setupFiles: ["./src/test/setup.ts"],
          exclude: [...configDefaults.exclude, "**/*.browser.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        plugins: [searchFixtureServer()],
        optimizeDeps: {
          include: [
            "react",
            "react-dom/client",
            "react/jsx-dev-runtime",
            "@testing-library/dom",
          ],
        },
        test: {
          name: "browser",
          include: ["**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
