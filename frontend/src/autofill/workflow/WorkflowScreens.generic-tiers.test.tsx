import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowAdapter } from "../adapters/workflow";
import {
  GENERIC_UNLINKED_REASON,
  applyGenericGrade,
} from "../generic/generic-analysis";
import { genericReasonText } from "../generic/grade-reason-text";
import type { ReviewPlanItem } from "../review/review-plan";
import { createReviewActions } from "./review-actions";
import { WorkflowScreens } from "./WorkflowScreens";
import { approvedReviewExecution } from "./workflow-write-items";

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

const auto = applyGenericGrade(base("auto", "자동 칸"), { grade: "AUTO" });
const review = applyGenericGrade(base("review", "확인 칸"), {
  grade: "REVIEW",
  reason: "NO_FIELD_CONTEXT",
});
const blocked = applyGenericGrade(base("blocked", "막힌 칸"), {
  grade: "BLOCKED",
  reason: "FORMAT_KEY_MISMATCH",
});
const unlinked = applyGenericGrade(
  {
    ...base("unlinked", "연결 못한 칸"),
    status: "unavailable",
    selected: false,
    disabled: true,
    previewValue: "입력 예정 값 없음",
    reason: "연결할 프로필 항목이 없습니다.",
  },
  { grade: "BLOCKED", reason: GENERIC_UNLINKED_REASON },
);

function renderReview(items: ReviewPlanItem[], toggle = vi.fn()) {
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
      toggleReviewItem={toggle}
      revealSensitiveItem={vi.fn()}
      executeWrites={vi.fn()}
      results={[]}
      adapter={{} as WorkflowAdapter}
      workflowDiagnostics={[]}
      exceptionTitle=""
      onExit={vi.fn()}
    />,
  );
  return toggle;
}

describe("generic review screen tiers", () => {
  it("lists the auto field as planned and the others under review", () => {
    renderReview([auto, review, blocked, unlinked]);
    expect(screen.getByRole("tab", { name: "자동 기입 예정 1" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "확인 필요 3" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "자동 기입 예정 1" }));
    expect(screen.getByText("자동 칸")).toBeVisible();
  });

  it("shows tier labels and fixed reasons in the review tab", () => {
    renderReview([auto, review, blocked, unlinked]);
    fireEvent.click(screen.getByRole("tab", { name: "확인 필요 3" }));
    const panel = screen.getByRole("tabpanel", { name: "확인 필요 3" });
    expect(
      within(panel).getAllByText("확인 필요", { selector: "small" }),
    ).toHaveLength(1);
    expect(
      within(panel).getAllByText("입력 불가", { selector: "small" }),
    ).toHaveLength(2);
    expect(
      within(panel).getByText(genericReasonText("NO_FIELD_CONTEXT")),
    ).toBeVisible();
    expect(
      within(panel).getByText(genericReasonText("FORMAT_KEY_MISMATCH")),
    ).toBeVisible();
    expect(
      within(panel).getByText("저장된 정보와 연결하지 못했습니다."),
    ).toBeVisible();
    expect(
      within(panel).getAllByText("합성 값", { selector: "span" }),
    ).toHaveLength(2);
  });

  it("offers inclusion only for the review field", () => {
    const toggle = renderReview([auto, review, blocked, unlinked]);
    fireEvent.click(screen.getByRole("tab", { name: "확인 필요 3" }));
    expect(
      screen.queryByRole("button", { name: "막힌 칸 포함하기" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "연결 못한 칸 포함하기" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "확인 칸 포함하기" }));
    expect(toggle).toHaveBeenCalledWith("review");
  });
});

describe("generic blocked items are never written", () => {
  it("ignores a toggle on a disabled item", () => {
    let items = [blocked, unlinked];
    const { toggleReviewItem } = createReviewActions((update) => {
      items = typeof update === "function" ? update(items) : update;
    });
    toggleReviewItem("blocked");
    toggleReviewItem("unlinked");
    expect(items.map((item) => item.selected)).toEqual([false, false]);
  });

  it("approves nothing for blocked or unselected review items", () => {
    const forced = { ...blocked, selected: true };
    const { approvedCandidateIds } = approvedReviewExecution(
      [forced, unlinked, review],
      new Set(),
    );
    expect([...approvedCandidateIds]).toEqual([]);
  });
});
