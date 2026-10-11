import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import type { Reporter } from "vitest/reporters";
import { searchFixtureServer } from "./tests/browser/search-fixture-server.ts";

let browserRequested = true;
const requireBrowserSuite: Reporter = {
  onInit(vitest) {
    browserRequested =
      vitest.config.project.length !== 1 || vitest.config.project[0] !== "unit";
  },
  onTestRunStart(specifications) {
    if (
      browserRequested &&
      !specifications.some((specification) => specification.pool === "browser")
    ) {
      throw new Error(
        "Browser tests were not collected. Use test:unit for unit-only runs.",
      );
    }
  },
};

export default defineConfig({
  test: {
    maxWorkers: 1,
    reporters: ["default", requireBrowserSuite],
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
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          exclude: [...configDefaults.exclude, "**/*.browser.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        plugins: [searchFixtureServer()],
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
