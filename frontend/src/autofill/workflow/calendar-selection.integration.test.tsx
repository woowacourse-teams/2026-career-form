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

function renderReview(
  items: ReviewPlanItem[],
  onCalendar: () => Promise<void>,
) {
  const onOrdinary = vi.fn();
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
      executeWrites={async () => {
        onOrdinary();
      }}
      executeCalendarWrites={onCalendar}
      results={[]}
      adapter={{} as WorkflowAdapter}
      workflowDiagnostics={[]}
      exceptionTitle=""
      onExit={vi.fn()}
    />,
  );
  return onOrdinary;
}

describe("calendar-only review action", () => {
  it("offers no calendar execution before explicit selection", () => {
    const onCalendar = vi.fn();
    renderReview([calendarItem], onCalendar);
    expect(
      screen.queryByRole("button", { name: "선택한 날짜만 입력" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /입학 연월 포함하기/ }),
    ).toBeTruthy();
    expect(onCalendar).not.toHaveBeenCalled();
  });

  it("keeps the ordinary action distinct from selected calendar items", () => {
    const onCalendar = vi.fn();
    const onOrdinary = renderReview(
      [{ ...calendarItem, selected: true }],
      onCalendar,
    );
    fireEvent.click(screen.getByRole("button", { name: "선택한 날짜만 입력" }));
    expect(onCalendar).toHaveBeenCalledOnce();
    expect(onOrdinary).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "선택하지 않고 계속" }),
    ).toBeTruthy();
  });
});
