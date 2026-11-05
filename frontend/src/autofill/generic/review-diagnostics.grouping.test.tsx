import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkflowAdapter } from "../adapters/workflow";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowScreens } from "../workflow/WorkflowScreens";
import {
  buildReviewDiagnostics,
  type ReviewDiagnosticContext,
} from "./review-diagnostics";

afterEach(cleanup);

function field(
  index: number,
  overrides: Partial<ReviewPlanItem> = {},
): ReviewPlanItem {
  return {
    candidateId: `field-${index}`,
    fieldLabel: `Field ${index}`,
    currentValue: "",
    profileValue: "synthetic",
    previewValue: "synthetic",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "",
    genericGrade: "AUTO",
    ...overrides,
  };
}

function renderReview(items: readonly ReviewPlanItem[]) {
  render(
    <WorkflowScreens
      stage="review"
      preparationItems={[]}
      warnings={[]}
      revealedPreparationKeys={new Set()}
      selectedPreparationKeys={new Set()}
      setRevealedPreparationKeys={vi.fn()}
      setSelectedPreparationKeys={vi.fn()}
      executePreparation={vi.fn()}
      reviewItems={items}
      partial={false}
      toggleReviewItem={vi.fn()}
      executeWrites={vi.fn()}
      results={[]}
      adapter={{} as WorkflowAdapter}
      workflowDiagnostics={[]}
      exceptionTitle=""
      onExit={vi.fn()}
    />,
  );
}

it("exports actual review panel membership instead of the source generic grade", () => {
  const items = [
    field(0),
    field(1, { selected: false }),
    field(2, {
      status: "needs-review",
      genericReasonCode: "MODERATE_CONFIDENCE",
    }),
    field(3, {
      searchValuePlan: {
        profileEntryId: "synthetic-id",
        originalName: "synthetic",
        forms: [{ kind: "original-exact", name: "synthetic" }],
      },
    }),
    field(4, {
      analysis: {
        candidateId: "field-4",
        matchType: "MATCH",
        autofillPolicy: "ALLOWED",
        mappingStatus: "LLM_SUGGESTED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_DATE" },
      },
    }),
    field(5, {
      genericGrade: "BLOCKED",
      genericReasonCode: "STRUCTURE_BLOCKED",
      status: "unavailable",
      selected: false,
      disabled: true,
    }),
    field(6, {
      genericGrade: "REVIEW",
      selected: false,
      genericReasonCode: "NO_FIELD_CONTEXT",
    }),
  ];
  const before = structuredClone(items);
  const contexts = new Map<string, ReviewDiagnosticContext>(
    items.map((entry, index) => [
      entry.candidateId,
      {
        candidate: {
          candidateId: entry.candidateId,
          element: "input",
          control: "text",
          visibility: "visible",
        },
        sectionCategory: "none",
        repeatRowIndex: index,
      },
    ]),
  );
  renderReview(items);
  // On the generic path a selected, available calendar or search field is
  // planned like any other; the badge equals the planned row count.
  expect(screen.getByRole("tab", { name: "자동 기입 예정 3" })).toBeVisible();
  const expected = [
    {
      tab: "자동 기입 예정 3",
      grade: "AUTO",
      labels: ["Field 0", "Field 3", "Field 4"],
    },
    {
      tab: "확인 필요 3",
      grade: "REVIEW",
      labels: ["Field 1", "Field 2", "Field 6"],
    },
    { tab: "입력 불가 1", grade: "BLOCKED", labels: ["Field 5"] },
  ];
  const diagnostics = buildReviewDiagnostics(items, contexts);
  for (const group of expected) {
    fireEvent.click(screen.getByRole("tab", { name: group.tab }));
    const panel = screen.getByRole("tabpanel", { name: group.tab });
    for (const entry of items) {
      expect(within(panel).queryByText(entry.fieldLabel) !== null).toBe(
        group.labels.includes(entry.fieldLabel),
      );
    }
    expect(
      diagnostics.fields
        .filter((entry) => entry.grade === group.grade)
        .map((entry) => items[entry.repeatRowIndex!]!.fieldLabel)
        .sort(),
    ).toEqual([...group.labels].sort());
  }
  expect(diagnostics.fields).toHaveLength(items.length);
  for (const entry of diagnostics.fields) {
    expect(entry.reasonCode).toBe(
      items[entry.repeatRowIndex!]!.genericReasonCode ?? null,
    );
  }
  expect(items).toEqual(before);
});

// The previous retention test covered all internal review items. Diagnostics
// describe the review screen instead, so ungraded unavailable items must be
// absent just as they are in the real panels. Missing context is not a filter.
it.each([undefined] as const)(
  "omits unavailable %s entries while preserving every displayed field",
  (genericGrade) => {
    const items = [
      field(0, {
        genericGrade: "BLOCKED",
        genericReasonCode: "STRUCTURE_BLOCKED",
        status: "unavailable",
        selected: false,
        disabled: true,
      }),
      field(1, {
        genericGrade,
        status: "unavailable",
        selected: false,
        disabled: true,
        genericReasonCode: "UNLINKED",
      }),
      field(2),
      field(3, {
        genericGrade: "REVIEW",
        genericReasonCode: "NO_FIELD_CONTEXT",
        selected: false,
      }),
    ];
    const before = structuredClone(items);
    renderReview(items);
    const groups = [
      { tab: "자동 기입 예정 1", label: "Field 2" },
      { tab: "확인 필요 1", label: "Field 3" },
      { tab: "입력 불가 1", label: "Field 0" },
    ];
    for (const group of groups) {
      fireEvent.click(screen.getByRole("tab", { name: group.tab }));
      const panel = screen.getByRole("tabpanel", { name: group.tab });
      expect(panel.querySelectorAll(":scope > article")).toHaveLength(1);
      expect(within(panel).getByText(group.label)).toBeVisible();
      expect(within(panel).queryByText("Field 1")).toBeNull();
    }
    // All three displayed entries lack context metadata, including BLOCKED.
    // Literal order also checks the UI helper's available-first stable sort.
    const result = buildReviewDiagnostics(items, new Map());
    const unobservedBinding = {
      fieldOrdinal: null,
      pageSectionOrdinal: null,
      profileFieldKey: null,
      profileSectionId: null,
      profileRowOrdinal: null,
    };
    expect(result.fields).toEqual([
      {
        ...unobservedBinding,
        grade: "AUTO",
        reasonCode: null,
        sectionCategory: "none",
        repeatRowIndex: null,
        controlKind: "other",
        mapped: false,
        mappedKeyCategory: null,
      },
      {
        ...unobservedBinding,
        grade: "REVIEW",
        reasonCode: "NO_FIELD_CONTEXT",
        sectionCategory: "none",
        repeatRowIndex: null,
        controlKind: "other",
        mapped: false,
        mappedKeyCategory: null,
      },
      {
        ...unobservedBinding,
        grade: "BLOCKED",
        reasonCode: "STRUCTURE_BLOCKED",
        sectionCategory: "none",
        repeatRowIndex: null,
        controlKind: "other",
        mapped: false,
        mappedKeyCategory: null,
      },
    ]);
    expect(result.counts).toEqual({
      byGradeReasonCode: {
        AUTO: { none: 1 },
        REVIEW: { NO_FIELD_CONTEXT: 1 },
        BLOCKED: { STRUCTURE_BLOCKED: 1 },
      },
      byGradeRepeatRowIndex: {
        AUTO: { none: 1 },
        REVIEW: { none: 1 },
        BLOCKED: { none: 1 },
      },
      byGradeControlKind: {
        AUTO: { other: 1 },
        REVIEW: { other: 1 },
        BLOCKED: { other: 1 },
      },
    });
    expect(items).toEqual(before);
  },
);
// Graded unavailable items stay visible in the review panel, and controls
// hidden on the page never reach the panels; diagnostics follow both.
it.each(["AUTO", "REVIEW"] as const)(
  "reports unavailable %s entries in the review panel and omits hidden ones",
  (genericGrade) => {
    const items = [
      field(0),
      field(1, {
        genericGrade,
        status: "unavailable",
        selected: false,
        disabled: true,
        genericReasonCode: "UNLINKED",
      }),
      field(2, { hiddenFromReview: true }),
    ];
    const before = structuredClone(items);
    renderReview(items);
    const groups = [
      { tab: "자동 기입 예정 1", label: "Field 0" },
      { tab: "확인 필요 1", label: "Field 1" },
    ];
    for (const group of groups) {
      fireEvent.click(screen.getByRole("tab", { name: group.tab }));
      const panel = screen.getByRole("tabpanel", { name: group.tab });
      expect(panel.querySelectorAll(":scope > article")).toHaveLength(1);
      expect(within(panel).getByText(group.label)).toBeVisible();
      expect(within(panel).queryByText("Field 2")).toBeNull();
    }
    expect(screen.getByRole("tab", { name: "입력 불가 0" })).toBeVisible();
    const result = buildReviewDiagnostics(items, new Map());
    expect(
      result.fields.map(({ grade, reasonCode }) => ({ grade, reasonCode })),
    ).toEqual([
      { grade: "AUTO", reasonCode: null },
      { grade: "REVIEW", reasonCode: "UNLINKED" },
    ]);
    expect(items).toEqual(before);
  },
);
