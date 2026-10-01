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

  it("keeps only the concise review guidance before writing", () => {
    const onLocate = vi.fn(() => true);
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
        onLocate={onLocate}
        onExit={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("지원서 조건을 확인한 뒤 선택해 주세요."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "확인 필요 1" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByText("확인 필요", { selector: "small" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("현재 입력값: 입력된 값 없음"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/검색형: 원본 정확 일치/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("지원서 저장/이동/제출은 실행하지 않습니다."),
    ).not.toBeInTheDocument();
    const reviewGuidance = screen.getByText(
      "자동 기입에서 제외할 항목이 있는지 확인해 주세요.",
    );
    expect(reviewGuidance).toBeVisible();
    expect(reviewGuidance.closest('[role="tabpanel"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: "자격증명 포함하기" }),
    ).toHaveClass(/copyButton/);
    expect(screen.getByRole("button", { name: "자격증명 포함하기" })).toHaveTextContent(
      "포함",
    );
    fireEvent.click(screen.getByRole("button", { name: "자격증명 필드로 이동" }));
    expect(onLocate).toHaveBeenCalledWith("certificate-name-1");
  });

  it("keeps planned entries to their field and value", () => {
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
        reviewItems={[{ ...certificateItem, selected: true, status: "available" }]}
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

    fireEvent.click(screen.getByRole("tab", { name: "자동 기입 예정 1" }));

    expect(screen.queryByText("자동 기입 예정 항목입니다.")).not.toBeInTheDocument();
  });
});
