import { afterEach, expect, it, vi } from "vitest";
import { setAutofillDebugEnabled } from "./autofill-debug";
import {
  debugRunBuild,
  debugCollectionSkip,
  debugPreparationCounts,
  withStructuralCollection,
} from "./structural-diagnostics";
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
