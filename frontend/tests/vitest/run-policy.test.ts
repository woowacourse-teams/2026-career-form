import { describe, expect, it } from "vitest";
import type { TestSpecification, Vitest } from "vitest/node";

import {
  COVERAGE_THRESHOLDS,
  coverageThresholds,
  createRequireBrowserSuite,
} from "./run-policy";

function startRun(projects: string[], pools: string[]) {
  const reporter = createRequireBrowserSuite();
  reporter.onInit?.({ config: { project: projects } } as unknown as Vitest);
  return () =>
    reporter.onTestRunStart?.(
      pools.map((pool) => ({ pool }) as unknown as TestSpecification),
    );
}

describe("requireBrowserSuite", () => {
  it("rejects a combined or merged run without browser specifications", () => {
    expect(startRun([], ["threads", "threads"])).toThrow(
      "Browser tests were not collected",
    );
  });

  it("accepts a combined or merged run with browser specifications", () => {
    expect(startRun([], ["threads", "browser"])).not.toThrow();
  });

  it("accepts a unit-only run", () => {
    expect(startRun(["unit"], ["threads"])).not.toThrow();
  });
});

describe("coverageThresholds", () => {
  it("keeps all four 80% thresholds for a single or merged run", () => {
    expect(coverageThresholds(["node", "vitest", "run", "--coverage"])).toEqual(
      { branches: 80, functions: 80, lines: 80, statements: 80 },
    );
    expect(COVERAGE_THRESHOLDS).toEqual({
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    });
  });

  it("leaves thresholds to the merged report for a shard run", () => {
    expect(
      coverageThresholds(["vitest", "run", "--shard=2/3"]),
    ).toBeUndefined();
    expect(
      coverageThresholds(["vitest", "run", "--shard", "2/3"]),
    ).toBeUndefined();
  });
});
