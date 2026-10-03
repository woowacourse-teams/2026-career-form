import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  debugReviewPlan,
  debugWriteRun,
  isAutofillDebugEnabled,
  setAutofillDebugEnabled,
} from "./autofill-debug";

function item(overrides: Partial<ReviewPlanItem>): ReviewPlanItem {
  return {
    candidateId: "field-0",
    fieldLabel: "학교명",
    currentValue: "",
    profileValue: "가상대학교",
    previewValue: "가상대학교",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "",
    ...overrides,
  };
}

describe("autofill debug log", () => {
  afterEach(() => {
    setAutofillDebugEnabled(false);
    vi.restoreAllMocks();
  });

  it("is off in test mode by default and prints nothing", () => {
    expect(isAutofillDebugEnabled()).toBe(false);
    const table = vi.spyOn(console, "table").mockImplementation(() => {});
    debugReviewPlan({ status: "ready", items: [item({})] });
    expect(table).not.toHaveBeenCalled();
  });

  it("prints review plan values and unavailable reasons", () => {
    setAutofillDebugEnabled(true);
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const table = vi.spyOn(console, "table").mockImplementation(() => {});
    debugReviewPlan({
      status: "partial",
      items: [
        item({}),
        item({
          candidateId: "field-1",
          status: "unavailable",
          disabled: true,
          profileValue: undefined,
          reason: "반복 입력 행 개수가 다릅니다.",
        }),
      ],
    });
    expect(table.mock.calls[0]![0]).toEqual([
      expect.objectContaining({
        profileValue: "가상대학교",
        status: "available",
      }),
      expect.objectContaining({
        candidateId: "field-1",
        reason: "반복 입력 행 개수가 다릅니다.",
      }),
    ]);
    expect(table.mock.calls[1]![0]).toEqual([
      expect.objectContaining({ candidateId: "field-1" }),
    ]);
  });

  it("prints executed and final write results side by side", () => {
    setAutofillDebugEnabled(true);
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    const table = vi.spyOn(console, "table").mockImplementation(() => {});
    const final = [
      {
        candidateId: "field-0",
        status: "skipped" as const,
        outcome: "needs-verification" as const,
        code: "RETAINED_VALUE_UNCONFIRMED" as const,
        reason: "값이 유지되지 않았습니다.",
      },
    ];
    const returned = debugWriteRun(
      [item({})],
      new Set(["field-0"]),
      new CandidateRegistry(),
      [{ candidateId: "field-0", status: "written" }],
      final,
    );
    expect(returned).toBe(final);
    expect(table.mock.calls[0]![0]).toEqual([
      expect.objectContaining({
        value: "가상대학교",
        "run.status": "written",
        "final.status": "skipped/needs-verification",
        "final.code": "RETAINED_VALUE_UNCONFIRMED",
        "final.reason": "값이 유지되지 않았습니다.",
        lookup: "unknown",
      }),
    ]);
  });

  it("keeps calendar values out of review and execution diagnostics", () => {
    setAutofillDebugEnabled(true);
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    const table = vi.spyOn(console, "table").mockImplementation(() => {});
    const calendar = item({
      currentValue: "2001-02",
      profileValue: "2026-03",
      previewValue: "2026-03",
      analysis: {
        candidateId: "field-0",
        matchType: "MATCH",
        autofillPolicy: "CONDITIONAL",
        mappingStatus: "LLM_SUGGESTED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_DATE" },
      },
    });

    debugReviewPlan({ status: "ready", items: [calendar] });
    debugWriteRun(
      [calendar],
      new Set(["field-0"]),
      new CandidateRegistry(),
      [{ candidateId: "field-0", status: "written" }],
      [{ candidateId: "field-0", status: "written" }],
    );

    const recorded = JSON.stringify(table.mock.calls);
    expect(recorded).not.toContain("2001-02");
    expect(recorded).not.toContain("2026-03");
    expect(table.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ command: "SELECT_DATE", selected: true }),
    ]);
    expect(table.mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({
        approved: true,
        "run.status": "written",
        "final.status": "written",
      }),
    ]);
  });
});
