import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowAdapter } from "../adapters/workflow";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowScreens } from "./WorkflowScreens";

const certificateItem = {
  candidateId: "certificate-name-1",
  fieldLabel: "자격증명",
  profileEntryId: "certificate-1",
  itemIndex: 0,
  currentValue: "",
  profileValue: "synthetic certificate level 2",
  previewValue: "synthetic certificate level 2",
  status: "needs-review",
  selected: false,
  disabled: false,
  revealed: true,
  reason: "지원서 조건을 확인한 뒤 선택해 주세요.",
  searchValuePlan: {
    profileEntryId: "certificate-1",
    originalName: "synthetic certificate level 2",
    grade: "level 2",
    forms: [
      { kind: "original-exact", name: "synthetic certificate level 2" },
      {
        kind: "name-and-grade",
        name: "synthetic certificate",
        grade: "level 2",
      },
    ],
  },
} as ReviewPlanItem;

describe("certificate search review provenance", () => {
  it("lets a user include an unselected available follow-up field", () => {
    const toggleReviewItem = vi.fn();
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
        reviewItems={[
          {
            ...certificateItem,
            candidateId: "follow-up-grade",
            fieldLabel: "후속 급수",
            status: "available",
            selected: false,
            searchValuePlan: undefined,
          },
        ]}
        partial={false}
        toggleReviewItem={toggleReviewItem}
        revealSensitiveItem={vi.fn()}
        executeWrites={vi.fn()}
        results={[]}
        adapter={{} as WorkflowAdapter}
        workflowDiagnostics={[]}
        exceptionTitle=""
        onExit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "후속 급수 포함하기" }));

    expect(toggleReviewItem).toHaveBeenCalledWith("follow-up-grade");
  });

  it("shows the approved forms, grade, and same-row scope before writing", () => {
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
        reviewItems={[certificateItem]}
        partial={false}
        toggleReviewItem={vi.fn()}
        revealSensitiveItem={vi.fn()}
        executeWrites={vi.fn()}
        results={[]}
        adapter={{} as WorkflowAdapter}
        workflowDiagnostics={[]}
        exceptionTitle=""
        onExit={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "검색형: 원본 정확 일치 · synthetic certificate level 2",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("검색형: 이름 synthetic certificate · 등급 level 2"),
    ).toBeVisible();
    expect(
      screen.getByText("검색 대상 범위: 자격증명 / 반복 행 1"),
    ).toBeVisible();
  });
});
