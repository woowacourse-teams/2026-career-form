import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { getWorkflowAdapter } from "../adapters/workflow";
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

const planned = applyGenericGrade(base("plain", "이름"), { grade: "AUTO" });
const unselectedReview: ReviewPlanItem = {
  ...applyGenericGrade(base("review", "확인 칸"), {
    grade: "REVIEW",
    reason: "MODERATE_CONFIDENCE",
  }),
  selected: false,
};
const blocked = applyGenericGrade(base("blocked", "막힌 칸"), {
  grade: "BLOCKED",
  reason: "FORMAT_KEY_MISMATCH",
});

function reviewScreen(
  items: readonly ReviewPlanItem[],
  extra: Partial<ComponentProps<typeof WorkflowScreens>> = {},
) {
  return (
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
      adapter={getWorkflowAdapter("https://qa.example.test/apply")}
      workflowDiagnostics={[]}
      exceptionTitle=""
      onExit={vi.fn()}
      {...extra}
    />
  );
}

const plannedTab = () => screen.getByRole("tab", { name: /^자동 기입 예정/ });
const needsTab = () => screen.getByRole("tab", { name: /^확인 필요/ });
const blockedTab = () => screen.getByRole("tab", { name: /^입력 불가/ });

describe("step indicator", () => {
  it("counts two steps because the flow has no review step", () => {
    render(reviewScreen([], { stage: "preparation-review" }));
    expect(screen.getByText("1 / 2")).toBeVisible();
  });
});

describe("review tabs", () => {
  it("keeps a controlled panel for every tab before it is selected", () => {
    render(reviewScreen([planned, unselectedReview, blocked]));
    for (const tab of screen.getAllByRole("tab")) {
      const panelId = tab.getAttribute("aria-controls");
      if (!panelId) throw new Error("Tab must control a panel");
      expect(document.getElementById(panelId)).toHaveAttribute(
        "role",
        "tabpanel",
      );
    }
  });

  it("moves among tabs with arrows, Home and End and keeps one tab stop", () => {
    const toggle = vi.fn();
    const execute = vi.fn();
    render(
      reviewScreen([planned, unselectedReview, blocked], {
        toggleReviewItem: toggle,
        executeWrites: execute,
      }),
    );
    const tabs = [plannedTab(), needsTab(), blockedTab()];
    const selected = () => tabs.map((t) => t.getAttribute("aria-selected"));
    const stops = () => tabs.map((t) => t.tabIndex);
    expect(selected()).toEqual(["false", "true", "false"]);
    expect(stops()).toEqual([-1, 0, -1]);

    tabs[1].focus();
    fireEvent.keyDown(tabs[1], { key: "ArrowRight" });
    expect(tabs[2]).toHaveFocus();
    expect(selected()).toEqual(["false", "false", "true"]);
    expect(stops()).toEqual([-1, -1, 0]);
    fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[2]).toHaveFocus();
    expect(
      within(screen.getByRole("tabpanel", { name: /^입력 불가/ })).getByText(
        "막힌 칸",
      ),
    ).toBeVisible();
    expect(toggle).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["needs review is present", [planned, unselectedReview], /^확인 필요/],
    ["only planned items exist", [planned], /^자동 기입 예정/],
    ["only blocked items exist", [blocked], /^입력 불가/],
  ])("starts on the right tab when %s", (_case, items, name) => {
    render(reviewScreen(items));
    expect(screen.getByRole("tab", { name })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name })).toBeVisible();
  });

  it("shows a real empty panel when the user picks an empty tab", () => {
    render(reviewScreen([planned]));
    for (const tab of [needsTab(), blockedTab()]) {
      fireEvent.click(tab);
      expect(tab).toHaveAttribute("aria-selected", "true");
      const panelId = tab.getAttribute("aria-controls");
      if (!panelId) throw new Error("Tab must control a panel");
      const panel = document.getElementById(panelId);
      if (!panel) throw new Error("Controlled panel is missing");
      expect(panel).toBeVisible();
      expect(panel.id).toBe(tab.getAttribute("aria-controls"));
      expect(panel.querySelector("article")).toBeNull();
      expect(panel).not.toBeEmptyDOMElement();
    }
  });

  it("stays on the tab being worked in after an include moves the last item out", () => {
    const toggle = vi.fn();
    const view = render(
      reviewScreen([planned, unselectedReview], { toggleReviewItem: toggle }),
    );
    fireEvent.click(screen.getByRole("button", { name: "확인 칸 포함하기" }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith("review");
    view.rerender(
      reviewScreen([planned, { ...unselectedReview, selected: true }], {
        toggleReviewItem: toggle,
      }),
    );
    expect(screen.getByRole("tab", { name: "자동 기입 예정 2" })).toBeVisible();
    expect(needsTab()).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: /^확인 필요/ });
    expect(panel.querySelector("article")).toBeNull();
  });
});

describe("result screen", () => {
  it("shows results and manual row actions without internal diagnostics", () => {
    render(
      reviewScreen([], {
        stage: "result",
        warnings: ["UNRESOLVED_FIELD"],
        partial: true,
        rowSave: {
          saved: 2,
          manual: [
            {
              recordKey: "careers.career#0",
              recordLabel: "합성 경력",
              reason: "row-incomplete",
            },
          ],
          stopped: [],
        },
      }),
    );
    expect(
      screen.getByRole("tablist", { name: "기입 결과 구분" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "직접 저장할 줄" }),
    ).toBeVisible();
    expect(screen.queryByText(/분석 경고/)).toBeNull();
    expect(screen.queryByText(/일부 필드는 분석하지 못해/)).toBeNull();
    expect(screen.queryByText("구조 자동 준비 내역")).toBeNull();
    expect(
      screen.queryByRole("region", { name: "확장이 저장한 줄" }),
    ).toBeNull();
  });
});
