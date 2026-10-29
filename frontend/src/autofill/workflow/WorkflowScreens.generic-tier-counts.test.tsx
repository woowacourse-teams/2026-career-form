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

const autos = [1, 2].map((n) =>
  applyGenericGrade(base(`auto-${n}`, `자동 칸 ${n}`), { grade: "AUTO" }),
);
const reviews = [1, 2, 3].map((n) =>
  applyGenericGrade(base(`review-${n}`, `확인 칸 ${n}`), {
    grade: "REVIEW",
    reason: "MODERATE_CONFIDENCE",
  }),
);
const blocks = [1, 2, 3, 4].map((n) =>
  applyGenericGrade(base(`blocked-${n}`, `막힌 칸 ${n}`), {
    grade: "BLOCKED",
    reason: "FORMAT_KEY_MISMATCH",
  }),
);

function renderReview(items: ReviewPlanItem[]) {
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

describe("generic review tier counts", () => {
  it("separates planned, review and blocked counts", () => {
    renderReview([...autos, ...reviews, ...blocks]);

    expect(screen.getByRole("tab", { name: "자동 기입 예정 2" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "확인 필요 3" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "입력 불가 4" })).toBeVisible();
  });

  it("keeps blocked items out of the review tab", () => {
    renderReview([...autos, ...reviews, ...blocks]);

    const reviewPanel = screen.getByRole("tabpanel", { name: "확인 필요 3" });
    expect(within(reviewPanel).queryByText(/막힌 칸/)).toBeNull();
    expect(within(reviewPanel).getAllByText(/확인 칸/)).toHaveLength(3);

    fireEvent.click(screen.getByRole("tab", { name: "입력 불가 4" }));
    const blockedPanel = screen.getByRole("tabpanel", { name: "입력 불가 4" });
    expect(within(blockedPanel).getAllByText(/막힌 칸/)).toHaveLength(4);
    expect(within(blockedPanel).queryByText(/확인 칸/)).toBeNull();
  });

  it("renders the controlled panel when there are no blocked items", () => {
    renderReview([...autos, ...reviews]);

    fireEvent.click(screen.getByRole("tab", { name: "입력 불가 0" }));

    expect(
      screen.getByRole("tabpanel", { name: "입력 불가 0" }),
    ).toHaveTextContent("입력 불가 항목이 없어요.");
  });

  it("keeps the two tabs and counts for items without a generic grade", () => {
    renderReview([
      base("static-1", "정적 칸 1"),
      { ...base("static-2", "정적 칸 2"), selected: false },
    ]);

    expect(screen.getByRole("tab", { name: "자동 기입 예정 1" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "확인 필요 1" })).toBeVisible();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: /입력 불가/ })).toBeNull();
  });
});
