import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowAdapter } from "../adapters/workflow";
import { applyGenericGrade } from "../generic/generic-analysis";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowScreens } from "./WorkflowScreens";

function base(candidateId: string, fieldLabel: string): ReviewPlanItem {
  return {
    candidateId,
    fieldLabel,
    currentValue: "",
    profileValue: "합성 값",
    previewValue: "합성 값",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "",
  };
}

const calendar: ReviewPlanItem = {
  ...base("calendar", "입학 연월"),
  analysis: {
    candidateId: "calendar",
    matchType: "MATCH",
    autofillPolicy: "ALLOWED",
    mappingStatus: "LLM_SUGGESTED",
    interactionStatus: "READY",
    writePlan: { command: "SELECT_DATE" },
  },
};

const search: ReviewPlanItem = {
  ...base("search", "자격증명"),
  searchValuePlan: {
    profileEntryId: "synthetic-id",
    originalName: "synthetic certificate",
    forms: [{ kind: "original-exact", name: "synthetic certificate" }],
  },
};

function graded(item: ReviewPlanItem): ReviewPlanItem {
  return applyGenericGrade(item, { grade: "AUTO" });
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

describe("generic review panel membership follows selection", () => {
  it("plans a selected calendar item", () => {
    renderReview([graded(calendar)]);

    fireEvent.click(screen.getByRole("tab", { name: "자동 기입 예정 1" }));
    const panel = screen.getByRole("tabpanel", { name: "자동 기입 예정 1" });
    expect(within(panel).getByText("입학 연월")).toBeVisible();
  });

  it("keeps an unselected calendar item under review", () => {
    renderReview([{ ...graded(calendar), selected: false }]);

    expect(screen.getByRole("tab", { name: "자동 기입 예정 0" })).toBeVisible();
    const panel = screen.getByRole("tabpanel", { name: "확인 필요 1" });
    expect(within(panel).getByText("입학 연월")).toBeVisible();
  });

  it("plans a selected search item", () => {
    renderReview([graded(search)]);

    fireEvent.click(screen.getByRole("tab", { name: "자동 기입 예정 1" }));
    const panel = screen.getByRole("tabpanel", { name: "자동 기입 예정 1" });
    expect(within(panel).getByText("자격증명")).toBeVisible();
  });

  it("counts exactly the planned panel rows on the badge", () => {
    renderReview([
      graded(base("plain", "이름")),
      graded(calendar),
      graded(search),
      {
        ...graded(calendar),
        candidateId: "calendar-off",
        fieldLabel: "졸업 연월",
        selected: false,
      },
      {
        ...graded(base("review-included", "전공")),
        genericGrade: "REVIEW",
        status: "needs-review",
      },
    ]);

    expect(screen.getByRole("tab", { name: "자동 기입 예정 3" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "확인 필요 2" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "자동 기입 예정 3" }));
    const panel = screen.getByRole("tabpanel", { name: "자동 기입 예정 3" });
    expect(panel.querySelectorAll(":scope > article")).toHaveLength(3);
    expect(within(panel).queryByText("졸업 연월")).toBeNull();
    expect(within(panel).queryByText("전공")).toBeNull();
  });
});
