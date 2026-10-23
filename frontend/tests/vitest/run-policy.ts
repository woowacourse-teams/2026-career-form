import type { Reporter } from "vitest/reporters";

export const COVERAGE_THRESHOLDS = {
  branches: 80,
  functions: 80,
  lines: 80,
  statements: 80,
} as const;

function isShardRun(argv: readonly string[]): boolean {
  return argv.some((arg) => arg === "--shard" || arg.startsWith("--shard="));
}

/**
 * A shard holds only part of the suite, so its coverage cannot meet the
 * thresholds. `--merge-reports` checks them on the combined coverage.
 */
export function coverageThresholds(argv: readonly string[]) {
  return isShardRun(argv) ? undefined : { ...COVERAGE_THRESHOLDS };
}

/**
 * Fails a combined run, or a merge of shard reports, that collected no
 * browser specification. A unit-only run is allowed.
 */
export function createRequireBrowserSuite(): Reporter {
  let browserRequested = true;
  return {
    onInit(vitest) {
      browserRequested =
        vitest.config.project.length !== 1 ||
        vitest.config.project[0] !== "unit";
    },
    onTestRunStart(specifications) {
      if (
        browserRequested &&
        !specifications.some(
          (specification) => specification.pool === "browser",
        )
      ) {
        throw new Error(
          "Browser tests were not collected. Use test:unit for unit-only runs.",
        );
      }
    },
  };
}
