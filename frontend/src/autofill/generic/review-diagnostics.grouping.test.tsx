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
import { buildReviewDiagnostics } from "./review-diagnostics";

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
  // The selected-count badge also includes selected exceptional items (4),
  // while the planned panel contains only field 0. Compare item membership.
  expect(screen.getByRole("tab", { name: "자동 기입 예정 4" })).toBeVisible();
  const expected = [
    { tab: "자동 기입 예정 4", grade: "AUTO", labels: ["Field 0"] },
    {
      tab: "확인 필요 5",
      grade: "REVIEW",
      labels: ["Field 1", "Field 2", "Field 3", "Field 4", "Field 6"],
    },
    { tab: "입력 불가 1", grade: "BLOCKED", labels: ["Field 5"] },
  ];
  const diagnostics = buildReviewDiagnostics(items, new Map());
  for (const group of expected) {
    fireEvent.click(screen.getByRole("tab", { name: group.tab }));
    const panel = screen.getByRole("tabpanel", { name: group.tab });
    for (const entry of items) {
      expect(within(panel).queryByText(entry.fieldLabel) !== null).toBe(
        group.labels.includes(entry.fieldLabel),
      );
    }
    expect(
      diagnostics.fields.flatMap((entry, index) =>
        entry.grade === group.grade ? [items[index]!.fieldLabel] : [],
      ),
    ).toEqual(group.labels);
  }
  expect(diagnostics.fields).toHaveLength(items.length);
  expect(diagnostics.fields.map((entry) => entry.reasonCode)).toEqual([
    null,
    null,
    "MODERATE_CONFIDENCE",
    null,
    null,
    "STRUCTURE_BLOCKED",
    "NO_FIELD_CONTEXT",
  ]);
  expect(items).toEqual(before);
});

it("retains entries without display metadata rather than filtering to match counts", () => {
  const hidden = field(0, {
    genericGrade: undefined,
    status: "unavailable",
    selected: false,
    disabled: true,
    genericReasonCode: "UNLINKED",
  });
  const result = buildReviewDiagnostics([hidden], new Map());
  expect(result.fields).toEqual([
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
});
