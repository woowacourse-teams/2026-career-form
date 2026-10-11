import { describe, expect, it } from "vitest";
import type { ApprovedWriteResult } from "../write/write-result";
import { isPreMutationFailure } from "./driver-failure-scope";

const skipped = (
  fields: Partial<Extract<ApprovedWriteResult, { status: "skipped" }>>,
): ApprovedWriteResult => ({
  candidateId: "driver",
  status: "skipped",
  reason: "사유",
  ...fields,
});

describe("isPreMutationFailure", () => {
  it.each([
    [
      "unsupported control",
      { outcome: "unsupported", code: "UNSUPPORTED_CONTROL" },
    ],
    [
      "unsupported format",
      { outcome: "unsupported", code: "UNSUPPORTED_FORMAT" },
    ],
    ["already matched", { outcome: "unchanged", code: "ALREADY_MATCHED" }],
    ["conflict", { outcome: "needs-verification", code: "CONFLICT" }],
    ["not approved", { outcome: "needs-verification", code: "NOT_APPROVED" }],
    [
      "duplicate binding",
      { outcome: "needs-verification", code: "DUPLICATE_BINDING" },
    ],
    [
      "review unavailable",
      { outcome: "needs-verification", code: "REVIEW_UNAVAILABLE" },
    ],
  ] as const)("treats %s as a failure before any page change", (_, fields) => {
    expect(isPreMutationFailure(skipped(fields))).toBe(true);
  });

  it.each([
    ["stale target", { outcome: "needs-verification", code: "STALE_TARGET" }],
    [
      "unconfirmed retained value",
      { outcome: "needs-verification", code: "RETAINED_VALUE_UNCONFIRMED" },
    ],
    ["failed execution", { outcome: "failed", code: "EXECUTION_FAILED" }],
    ["result without classification", {}],
  ] as const)("keeps %s uncertain", (_, fields) => {
    expect(isPreMutationFailure(skipped(fields))).toBe(false);
  });

  it("never treats a written result as a failure", () => {
    expect(
      isPreMutationFailure({ candidateId: "driver", status: "written" }),
    ).toBe(false);
  });
});
