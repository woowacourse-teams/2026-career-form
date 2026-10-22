import { afterEach, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  collectGenericStructureSnapshot,
  createGenericStructureContext,
} from "../../generic/structure-context";
import {
  accuracyCandidates,
  aggregateAccuracy,
  assertAccuracyReport,
  runWriteAccuracy,
} from "./runner";
import type { SnapshotManifestEntry } from "./schema";
import { syntheticProfile } from "./fixtures";
import { loadTruth, parseTruth } from "./truth";
import { assertManifestRoutes, isMeasured, manifest } from "./manifest";

const entry: SnapshotManifestEntry = {
  snapshot: "synthetic",
  status: "RUNNABLE",
  reason: "Synthetic runner verification",
  documentUrl: "https://write-accuracy.example.test/synthetic",
  expectedRoute: "generic",
  routeCheck: "ASSERTED",
};

afterEach(() => document.body.replaceChildren());

async function setup() {
  document.body.innerHTML = readFileSync(
    join(process.cwd(), "fixtures/write-accuracy/synthetic/form.html"),
    "utf8",
  );
  const profile = syntheticProfile();
  const snapshot = await collectGenericStructureSnapshot(
    document,
    undefined,
    createGenericStructureContext(),
  );
  const candidates = accuracyCandidates(snapshot, document);
  expect(candidates).toHaveLength(3);
  const truth = loadTruth("synthetic")!;
  expect(candidates).toEqual(
    truth.fields.map(({ ordinal, structurePath, rowIndex, controlKind }) => ({
      ordinal,
      structurePath,
      rowIndex,
      controlKind,
    })),
  );
  return { profile, truth };
}

it("writes text, native select and radio using the product pipeline", async () => {
  const { profile, truth } = await setup();
  const report = await runWriteAccuracy({ document, entry, profile, truth });
  expect(report.metrics).toMatchObject({
    registered: 3,
    exercisable: 3,
    approved: 3,
    attempted: 3,
    reportedWritten: 3,
    correct: 3,
    wrong: 0,
    held: 0,
  });
  expect(Object.keys(report.byControlKind).sort()).toEqual([
    "radio",
    "select",
    "text",
  ]);
  expect(() => assertAccuracyReport(report)).not.toThrow();
});

it("detects an intentionally wrong truth instead of trusting the writer", async () => {
  const { profile, truth } = await setup();
  truth.fields[0].expectedDomState = {
    value: "deliberately-wrong@example.test",
  };
  const report = await runWriteAccuracy({ document, entry, profile, truth });
  expect(report.metrics.wrong).toBe(1);
  expect(report.metrics.reportedSuccessButWrong).toBe(1);
  expect(() => assertAccuracyReport(report)).toThrow("WRONG_VALUES");
});

it("detects a page listener reverting an input after the write", async () => {
  const { profile, truth } = await setup();
  const input = document.querySelector("input")!;
  input.addEventListener("input", () => {
    input.value = "";
  });
  const report = await runWriteAccuracy({ document, entry, profile, truth });
  expect(
    report.metrics.reportedSuccessButWrong + report.metrics.held,
  ).toBeGreaterThanOrEqual(1);
  expect(report.fields[0].writeCode).toMatch(
    /RETAINED_VALUE_UNCONFIRMED|VALUE_NOT_RETAINED/,
  );
});

it("counts a missing truth entry as unscored and fails the report gate", async () => {
  const { profile, truth } = await setup();
  truth.fields.pop();
  const report = await runWriteAccuracy({ document, entry, profile, truth });
  expect(report.metrics.unscored).toBe(1);
  expect(() => assertAccuracyReport(report)).toThrow("UNSCORED_FIELDS");
});

it("detects mutation of a preserve-marked field by the page", async () => {
  const { profile, truth } = await setup();
  truth.fields[1] = {
    ...truth.fields[1],
    preserve: true,
    exercisable: false,
    exercisableReason: "Existing selection must remain unchanged",
    profileFieldKey: null,
  };
  document.querySelector("input")!.addEventListener("input", () => {
    document.querySelector("select")!.value = "male";
  });
  const report = await runWriteAccuracy({ document, entry, profile, truth });
  expect(report.metrics.preservedViolated).toBe(1);
  expect(() => assertAccuracyReport(report)).toThrow("PRESERVE_VIOLATION");
});

it("reports a manifest route mismatch before collection or writes", async () => {
  const { profile, truth } = await setup();
  const report = await runWriteAccuracy({
    document,
    entry: { ...entry, expectedRoute: "policy" },
    profile,
    truth,
  });
  expect(report.diagnostics).toContain("ROUTE_MISMATCH");
  expect(report.metrics.attempted).toBe(0);
  expect(() => assertAccuracyReport(report)).toThrow("ROUTE_MISMATCH");
});

it("rejects broken metric conservation", async () => {
  const { profile, truth } = await setup();
  const report = await runWriteAccuracy({ document, entry, profile, truth });
  report.metrics.attempted++;
  expect(() => assertAccuracyReport(report)).toThrow("METRIC_CONSERVATION");
});

it("validates truth identities and requires a reason for non-exercisable fields", async () => {
  const { truth } = await setup();
  expect(() => parseTruth(truth, "synthetic")).not.toThrow();
  truth.fields[0].exercisable = false;
  expect(() => parseTruth(truth, "synthetic")).toThrow("INVALID_TRUTH");
});

it("rejects duplicate manifest entries and non-generic measured routes", () => {
  expect(() => assertManifestRoutes([entry, entry])).toThrow(
    "Duplicate manifest snapshot",
  );
  expect(() =>
    assertManifestRoutes([{ ...entry, expectedRoute: "policy" }]),
  ).toThrow("Non-generic measured route");
});

it("covers every snapshot directory with the initial route and review classification", () => {
  const snapshots = readdirSync(join(process.cwd(), "fixtures/dom-snapshots"), {
    withFileTypes: true,
  })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  expect(
    manifest
      .filter(({ snapshot }) => snapshots.includes(snapshot))
      .map(({ snapshot }) => snapshot)
      .sort(),
  ).toEqual(snapshots);
  expect(() => assertManifestRoutes(manifest)).not.toThrow();
  for (const entry of manifest) {
    expect([
      "RUNNABLE",
      "UNREVIEWED",
      "NO_SNAPSHOT",
      "ABORTED",
      "NOT_GENERIC_ROUTE",
    ]).toContain(entry.status);
    if (!snapshots.includes(entry.snapshot))
      expect(["NO_SNAPSHOT", "ABORTED"]).toContain(entry.status);
  }
  const aggregate = aggregateAccuracy(manifest, new Map());
  expect(aggregate.expected).toEqual(
    manifest.filter(isMeasured).map(({ snapshot }) => snapshot),
  );
  expect(aggregate.missing).toEqual(aggregate.expected);
  expect(aggregate.excluded.map(({ snapshot }) => snapshot)).toEqual(
    manifest.filter((entry) => !isMeasured(entry)).map(({ snapshot }) => snapshot),
  );
  expect(
    manifest
      .filter(({ status }) => status === "NO_SNAPSHOT")
      .map(({ snapshot }) => snapshot),
  ).toEqual(["naver-education-stage"]);
  expect(
    manifest
      .filter(({ status }) => status === "RUNNABLE")
      .map(({ snapshot }) => snapshot),
  ).toEqual([
      "ahnlab-write-resume-form",
      "naver-step2-form",
      "visible-control-row",
      "framework-rerender",
    ]);
  expect(
    manifest
      .filter(({ status }) => status === "UNREVIEWED")
      .map(({ snapshot }) => snapshot),
  ).toEqual(["kakao-greeting-email", "lg-ai-research-birth-split-email"]);
  expect(
    manifest
      .filter(({ status }) => status === "ABORTED")
      .map(({ snapshot }) => snapshot),
  ).toEqual(["naver-panel-loss"]);
});

it("aggregates only the current manifest set and separates unreviewed metrics by control", async () => {
  const { profile, truth } = await setup();
  const report = await runWriteAccuracy({ document, entry, profile, truth });
  const unreviewedEntry = {
    ...entry,
    snapshot: "unreviewed",
    status: "UNREVIEWED" as const,
  };
  const reports = new Map([
    [entry.snapshot, report],
    [
      unreviewedEntry.snapshot,
      {
        ...report,
        snapshot: unreviewedEntry.snapshot,
        status: "UNREVIEWED" as const,
        scored: false,
      },
    ],
  ]);
  const aggregate = aggregateAccuracy([entry, unreviewedEntry], reports);
  expect(aggregate).toMatchObject({
    missing: [],
    extra: [],
    failures: [],
    reviewed: { correct: 3 },
    unreviewed: { correct: 3 },
    byControlKind: {
      text: { reviewed: { correct: 1 }, unreviewed: { correct: 1 } },
    },
  });
  expect(
    aggregateAccuracy(
      [entry, unreviewedEntry],
      new Map([[entry.snapshot, report]]),
    ).missing,
  ).toEqual(["unreviewed"]);
  expect(aggregateAccuracy([entry], reports).extra).toEqual(["unreviewed"]);
  report.metrics.unscored++;
  expect(
    aggregateAccuracy([entry], new Map([[entry.snapshot, report]])).failures,
  ).toEqual([entry.snapshot]);
});
