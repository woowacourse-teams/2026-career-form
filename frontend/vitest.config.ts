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
    // afterEach를 등록 순서대로 돌린다(기본 "stack"은 역순). setup.ts의 cleanup(언마운트)이
    // 파일별 afterEach의 URL 되돌리기·실행 정책 해제보다 먼저 실행되어야, 아직 돌고 있는
    // 워크플로가 바뀐 환경을 보고 "Missing hidden-code execution rules"로 터지지 않는다.
    sequence: { hooks: "list" },
    css: {
      include:
        /WorkflowResults\.module\.css|ProfileForm\.module\.css|sidepanel\/App\.module\.css|site\/landing\/\w+\.module\.css/,
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
