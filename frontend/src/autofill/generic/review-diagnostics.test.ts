import { afterEach, describe, expect, it, vi } from "vitest";
import type { FieldCandidate } from "../api/types";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  buildReviewDiagnostics,
  emitReviewDiagnostics,
  type ReviewDiagnosticContext,
} from "./review-diagnostics";

function item(
  index: number,
  overrides: Partial<ReviewPlanItem> = {},
): ReviewPlanItem {
  return {
    candidateId: `private-id-${index}`,
    fieldLabel: "PRIVATE_LABEL",
    currentValue: "PRIVATE_CURRENT",
    previewValue: "PRIVATE_PREVIEW",
    profileValue: "PRIVATE_PROFILE",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "PRIVATE_REASON",
    genericGrade: "AUTO",
    ...overrides,
  };
}

const items = [
  item(0, { profileFieldKey: "education.university.schoolName" }),
  item(1, {
    genericGrade: "REVIEW",
    genericReasonCode: "NO_FIELD_CONTEXT",
    selected: false,
    profileFieldKey: "education.university.startDate",
  }),
  item(2, {
    genericGrade: "BLOCKED",
    genericReasonCode: "UNLINKED",
    selected: false,
    disabled: true,
    status: "unavailable",
  }),
  item(3, {
    genericGrade: "BLOCKED",
    genericReasonCode: "UNLINKED",
    selected: false,
    disabled: true,
    status: "unavailable",
  }),
];
const contexts = new Map<string, ReviewDiagnosticContext>(
  items.slice(0, 3).map((entry, index) => [
    entry.candidateId,
    {
      candidate: {
        candidateId: entry.candidateId,
        displayName: "PRIVATE_LABEL",
        domId: "PRIVATE_DOM_ID",
        domName: "PRIVATE_SELECTOR",
        element: "input",
        control: "text",
        visibility: "visible",
        semanticContext: {
          inputType: index === 1 ? "month" : "text",
          repeat: { groupId: "PRIVATE_GROUP", rowIndex: index, rowCount: 3 },
        },
      },
      sectionCategory: "education",
      repeatRowIndex: index,
    },
  ]),
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildReviewDiagnostics", () => {
  it("explains every review item and aggregates each dimension", () => {
    const result = buildReviewDiagnostics(items, contexts);
    expect(result.fields).toEqual([
      {
        grade: "AUTO",
        reasonCode: null,
        sectionCategory: "education",
        repeatRowIndex: 0,
        controlKind: "text",
        mapped: true,
        mappedKeyCategory: "education",
      },
      {
        grade: "REVIEW",
        reasonCode: "NO_FIELD_CONTEXT",
        sectionCategory: "education",
        repeatRowIndex: 1,
        controlKind: "month",
        mapped: true,
        mappedKeyCategory: "education",
      },
      {
        grade: "BLOCKED",
        reasonCode: "UNLINKED",
        sectionCategory: "education",
        repeatRowIndex: 2,
        controlKind: "text",
        mapped: false,
        mappedKeyCategory: null,
      },
      {
        grade: "BLOCKED",
        reasonCode: "UNLINKED",
        sectionCategory: "none",
        repeatRowIndex: null,
        controlKind: "other",
        mapped: false,
        mappedKeyCategory: null,
      },
    ]);
    expect(result.counts.byGradeReasonCode).toEqual({
      AUTO: { none: 1 },
      REVIEW: { NO_FIELD_CONTEXT: 1 },
      BLOCKED: { UNLINKED: 2 },
    });
    expect(result.counts.byGradeRepeatRowIndex).toEqual({
      AUTO: { "0": 1 },
      REVIEW: { "1": 1 },
      BLOCKED: { "2": 1, none: 1 },
    });
    expect(result.counts.byGradeControlKind).toEqual({
      AUTO: { text: 1 },
      REVIEW: { month: 1 },
      BLOCKED: { text: 1, other: 1 },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PRIVATE");
    expect(serialized).not.toContain("private-id");
    expect(serialized).not.toContain("schoolName");
    expect(serialized).not.toContain("startDate");
  });

  it("handles empty input without phantom counts", () => {
    const result = buildReviewDiagnostics([], new Map());
    expect(result.fields).toEqual([]);
    for (const dimension of Object.values(result.counts))
      expect(dimension).toEqual({ AUTO: {}, REVIEW: {}, BLOCKED: {} });
  });

  it.each([
    "text",
    "select",
    "date",
    "month",
    "search",
    "radio",
    "checkbox",
    "textarea",
    "custom",
    "other",
  ] as const)("classifies %s controls", (kind) => {
    const control = ["date", "month", "search"].includes(kind)
      ? "text"
      : kind === "other"
        ? "button"
        : kind;
    const candidate: FieldCandidate = {
      candidateId: "x",
      element: kind === "custom" ? "custom" : "input",
      control: control as FieldCandidate["control"],
      visibility: "visible",
      ...(["date", "month", "search"].includes(kind)
        ? {
            semanticContext: { inputType: kind as "date" | "month" | "search" },
          }
        : {}),
    };
    expect(
      buildReviewDiagnostics(
        [item(0)],
        new Map([
          [
            "private-id-0",
            { candidate, sectionCategory: "none", repeatRowIndex: null },
          ],
        ]),
      ).fields[0]?.controlKind,
    ).toBe(kind);
  });
});

describe("emitReviewDiagnostics", () => {
  it("emits nothing with the local flag off", () => {
    vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "0");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    emitReviewDiagnostics(items, contexts);
    expect(info).not.toHaveBeenCalled();
  });

  it("emits nothing against a non-local API", () => {
    vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "1");
    vi.stubEnv("VITE_API_BASE_URL", "https://example.invalid");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    emitReviewDiagnostics(items, contexts);
    expect(info).not.toHaveBeenCalled();
  });

  it("emits one compact synthetic JSON console line when enabled", () => {
    vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "1");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
    const info = vi.spyOn(console, "info");
    emitReviewDiagnostics(items, contexts);
    expect(info).toHaveBeenCalledTimes(1);
    const [line] = info.mock.calls[0]!;
    expect(info.mock.calls[0]).toHaveLength(1);
    expect(line).not.toContain("\n");
    expect(JSON.parse(String(line).split(": ")[1]!)).toEqual(
      buildReviewDiagnostics(items, contexts),
    );
  });
});
