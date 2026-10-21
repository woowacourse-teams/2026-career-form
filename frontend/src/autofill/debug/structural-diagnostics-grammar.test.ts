import { afterEach, expect, it, vi } from "vitest";
import { setAutofillDebugEnabled } from "./autofill-debug";
import {
  debugRunBuild,
  debugCollectionSkip,
  debugPreparationCounts,
  debugRuntimeSkip,
  debugStageCounts,
  withStructuralCollection,
  type DebugStageName,
  type StructuralSkipReason,
} from "./structural-diagnostics";
import { expectHarnessLine } from "../workflow/test-utils/harness-diagnostic-line";
afterEach(() => {
  setAutofillDebugEnabled(false);
  vi.restoreAllMocks();
});
it("uses the exact machine-readable build, skip and stage grammar", async () => {
  setAutofillDebugEnabled(true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  await debugRunBuild(async () => ({
    revision: "a".repeat(40),
    source_state: "CLEAN",
  }));
  withStructuralCollection("fields", () => {
    debugCollectionSkip(
      "hplace.detail.gender",
      "label-mismatch",
      "owned-label",
    );
    return { request: { sections: [] } };
  });
  debugPreparationCounts("preparation", 2, 1);
  expect(log.mock.calls).toEqual([
    [`[CareerForm] build revision=${"a".repeat(40)} source_state=CLEAN`],
    [
      "[CareerForm] skip stage=collect key=hplace.detail.gender reason=label-mismatch detail=owned-label",
    ],
    [
      "[CareerForm] stage name=fields collected=1 accepted=0 rejected=1 planned=0 executed=0",
    ],
    [
      "[CareerForm] stage name=preparation collected=0 accepted=0 rejected=0 planned=2 executed=1",
    ],
  ]);
  for (const [line] of log.mock.calls) {
    expect(line).toMatch(
      /^\[CareerForm\] (build|skip|stage) (?:[A-Za-z][A-Za-z0-9_]*=[^\s=]+)(?: [A-Za-z][A-Za-z0-9_]*=[^\s=]+)*$/,
    );
  }
});
it("never invents a build identity when the installed snapshot is unavailable", async () => {
  setAutofillDebugEnabled(true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  await debugRunBuild(async () => ({
    revision: "CANARY_CURRENT",
    source_state: "CANARY_SESSION",
  }));
  expect(log.mock.calls).toEqual([
    [
      "[CareerForm] skip stage=prepare key=extension-build reason=build-unavailable detail=installed-snapshot",
    ],
  ]);
});
it("emits the CF-177 reasons and stage names in the live harness grammar", () => {
  setAutofillDebugEnabled(true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const reasons: StructuralSkipReason[] = [
    "no-response",
    "driver-deferred",
    "analysis-limit",
    "unsupported-section",
  ];
  for (const reason of reasons)
    debugRuntimeSkip("hplace.mrs2.college.degreeTypeCode", reason, "budget");
  debugRuntimeSkip(
    "hplace.mrs2.college.degreeTypeCode",
    "driver-deferred",
    "driver-settle",
    "write",
    "DRIVER_SELECTION_UNCONFIRMED",
  );
  debugRuntimeSkip("native-analysis", "analysis-limit", "budget", "collect");
  withStructuralCollection("fields", () => {
    debugCollectionSkip(
      "hplace-mrs2-unsupported-170",
      "unsupported-section",
      "profile-key-missing",
    );
    return { request: { sections: [] } };
  });
  const stages: DebugStageName[] = [
    "preparation",
    "preparation-plan",
    "preparation-initial",
    "preparation-follow-up",
    "preparation-majors",
    "address",
    "drivers",
  ];
  for (const name of stages) debugStageCounts(name, 3, 2);
  const lines = log.mock.calls.map(([line]) => line as string);
  expect(lines).toContain(
    "[CareerForm] skip stage=write key=hplace.mrs2.college.degreeTypeCode reason=driver-deferred detail=driver-settle failureCode=DRIVER_SELECTION_UNCONFIRMED",
  );
  expect(lines).toContain(
    "[CareerForm] skip stage=collect key=native-analysis reason=analysis-limit detail=budget",
  );
  expect(lines).toContain(
    "[CareerForm] skip stage=collect key=hplace-mrs2-unsupported-170 reason=unsupported-section detail=profile-key-missing",
  );
  expect(lines).toContain(
    "[CareerForm] stage name=drivers collected=0 accepted=0 rejected=0 planned=3 executed=2",
  );
  expect(lines).toHaveLength(reasons.length + 2 + 2 + stages.length);
  for (const line of lines)
    expectHarnessLine(line, ["합성대학", "CANARY", "college[0]"]);
});
it("keeps debugPreparationCounts byte-identical through debugStageCounts", () => {
  setAutofillDebugEnabled(true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  debugPreparationCounts("address", 1, 0);
  debugStageCounts("address", 1, 0);
  expect(log.mock.calls).toEqual([
    [
      "[CareerForm] stage name=address collected=0 accepted=0 rejected=0 planned=1 executed=0",
    ],
    [
      "[CareerForm] stage name=address collected=0 accepted=0 rejected=0 planned=1 executed=0",
    ],
  ]);
});
it("stays silent when diagnostics are disabled", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  debugStageCounts("drivers", 1, 1);
  debugRuntimeSkip(
    "hplace.mrs2.x",
    "no-response",
    "x",
    "write",
    "SEARCH_TIMEOUT",
  );
  expect(log).not.toHaveBeenCalled();
});
