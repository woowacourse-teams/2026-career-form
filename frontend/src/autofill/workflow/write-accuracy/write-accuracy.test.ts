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

it("aggregate", () => {
  const aggregate = aggregateAccuracy(manifest, reports);
  writeFileSync(
    join(evidenceDirectory, "aggregate.json"),
    JSON.stringify(aggregate, null, 2),
  );
  expect(aggregate.missing, "MISSING_SNAPSHOT_RESULTS").toEqual([]);
  expect(aggregate.extra, "EXTRA_SNAPSHOT_RESULTS").toEqual([]);
  expect(aggregate.failures, "UNSCORED_OR_FAILED_SNAPSHOTS").toEqual([]);
  expect(
    aggregate.reviewed.unscored + aggregate.unreviewed.unscored,
    "UNSCORED_FIELDS",
  ).toBe(0);
});
