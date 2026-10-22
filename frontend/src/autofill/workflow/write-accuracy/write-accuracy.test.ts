import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, expect, it } from "vitest";
import { installExecutionPolicy } from "../execution-policy";
import {
  loadSnapshot,
  loadTruth,
  manifest,
  measurementEntries,
  syntheticProfile,
} from "./fixtures";
import {
  aggregateAccuracy,
  assertAccuracyReport,
  runWriteAccuracy,
} from "./runner";
import type { AccuracyReport } from "./schema";

const reports = new Map<string, AccuracyReport>();
let evidenceDirectory: string;

beforeAll(() => {
  evidenceDirectory = join(
    process.cwd(),
    "../.omo/evidence/generic-stage-check-and-write-accuracy/fixture/write-accuracy",
    `run-${new Date().toISOString()}`,
  );
  mkdirSync(evidenceDirectory, { recursive: true });
});

afterEach(() => {
  installExecutionPolicy(document);
  document.head.replaceChildren();
  document.body.replaceChildren();
});

for (const entry of measurementEntries) {
  it(entry.snapshot, async () => {
    try {
      loadSnapshot(entry);
      const report = await runWriteAccuracy({
        document,
        entry,
        profile: syntheticProfile(),
        truth: loadTruth(entry.snapshot),
      });
      reports.set(entry.snapshot, report);
      writeFileSync(
        join(evidenceDirectory, `${entry.snapshot}.json`),
        JSON.stringify(report, null, 2),
      );
      assertAccuracyReport(report);
    } catch (error) {
      if (!reports.has(entry.snapshot)) {
        writeFileSync(
          join(evidenceDirectory, `${entry.snapshot}.json`),
          JSON.stringify(
            { snapshot: entry.snapshot, diagnostics: ["RUNNER_ERROR"] },
            null,
            2,
          ),
        );
      }
      throw error;
    }
  });
}

it("writes only the visible controls in the visible-control-row fixture", () => {
  const report = reports.get("visible-control-row");
  expect(report, "MISSING_SNAPSHOT_RESULTS").toBeDefined();
  expect(report!.metrics).toMatchObject({
    registered: 3,
    exercisable: 2,
    approved: 2,
    attempted: 2,
    reportedWritten: 2,
    correct: 2,
    wrong: 0,
    held: 0,
    preservedViolated: 0,
  });
});

it("aggregate", () => {
  const aggregate = aggregateAccuracy(manifest, reports);
  writeFileSync(
    join(evidenceDirectory, "aggregate.json"),
    JSON.stringify(aggregate, null, 2),
  );
  expect(aggregate.missing, "MISSING_SNAPSHOT_RESULTS").toEqual([]);
  expect(aggregate.extra, "EXTRA_SNAPSHOT_RESULTS").toEqual([]);
  // Correctness failures remain in the evidence and each snapshot's own test.
  // Aggregate gates coverage and accounting, not whether writes were correct.
  expect(aggregate.expected).toEqual(
    measurementEntries.map(({ snapshot }) => snapshot),
  );
  expect(aggregate.excluded.map(({ snapshot }) => snapshot)).toEqual(
    manifest
      .filter((entry) => !measurementEntries.includes(entry))
      .map(({ snapshot }) => snapshot),
  );
  for (const entry of measurementEntries) {
    const report = reports.get(entry.snapshot)!;
    expect(report.snapshot).toBe(entry.snapshot);
    expect(report.status).toBe(entry.status);
    expect(report.scored).toBe(entry.status === "RUNNABLE");
    for (const metrics of [
      report.metrics,
      ...Object.values(report.byControlKind),
    ]) {
      expect(metrics.attempted, entry.snapshot).toBe(
        metrics.correct + metrics.wrong + metrics.held,
      );
      expect(
        metrics.reportedSuccessButWrong,
        entry.snapshot,
      ).toBeLessThanOrEqual(metrics.wrong);
    }
  }
  expect(
    aggregate.reviewed.unscored + aggregate.unreviewed.unscored,
    "UNSCORED_FIELDS",
  ).toBe(0);
});
