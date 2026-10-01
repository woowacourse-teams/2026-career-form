import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowAdapter } from "../adapters/workflow";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowScreens } from "./WorkflowScreens";

const calendarItem = {
  candidateId: "calendar-1",
  fieldLabel: "입학 연월",
  currentValue: "",
  profileValue: "2025-02",
  previewValue: "2025-02",
  status: "available",
  selected: false,
  disabled: false,
  revealed: true,
  reason: "개별 확인 필요",
  analysis: { writePlan: { command: "SELECT_DATE" } },
} as ReviewPlanItem;

function renderReview(items: ReviewPlanItem[]) {
  const executeWrites = vi.fn(async () => undefined);
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
      revealSensitiveItem={vi.fn()}
      executeWrites={executeWrites}
      results={[]}
      adapter={{} as WorkflowAdapter}
      workflowDiagnostics={[]}
      exceptionTitle=""
      onExit={vi.fn()}
    />,
  );
  return executeWrites;
}

describe("unified calendar review action", () => {
  it("keeps a date out of execution before explicit selection", () => {
    renderReview([calendarItem]);
    expect(
      screen.getByRole("button", { name: /입학 연월 포함하기/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "선택하지 않고 계속" }),
    ).toBeTruthy();
  });

  it("counts a selected date with an ordinary item and executes both once", () => {
    const ordinaryItem = {
      ...calendarItem,
      candidateId: "ordinary-1",
      fieldLabel: "이름",
      selected: true,
      analysis: { writePlan: { command: "SET_TEXT" } },
    } as ReviewPlanItem;
    const executeWrites = renderReview([
      { ...calendarItem, selected: true },
      ordinaryItem,
    ]);

    expect(
      screen.queryByRole("button", { name: "선택한 날짜만 입력" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "2개 항목 기입하기" }));
    expect(executeWrites).toHaveBeenCalledOnce();
  });
});
