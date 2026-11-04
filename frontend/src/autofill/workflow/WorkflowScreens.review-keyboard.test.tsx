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

describe("result priority", () => {
  function resultScreen() {
    return reviewScreen([], {
      stage: "result",
      structureDiagnostics: { status: "ran-no-actions", actions: [] },
      rowSave: {
        saved: 0,
        manual: [
          {
            recordKey: "careers.career#0",
            recordLabel: "합성 경력",
            reason: "row-incomplete",
          },
        ],
        stopped: [],
      },
    });
  }

  it("puts results and manual row actions before secondary diagnostics", () => {
    render(resultScreen());
    const results = screen.getByRole("tablist", { name: "기입 결과 구분" });
    const manual = screen.getByRole("region", { name: "직접 저장할 줄" });
    const diagnostics = screen.getByLabelText("구조 자동 준비");
    for (const primary of [results, manual]) {
      expect(
        primary.compareDocumentPosition(diagnostics) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(manual).toBeVisible();
  });

  it("discloses diagnostics without hiding manual row-save warnings", () => {
    render(resultScreen());
    const diagnostics = screen.getByLabelText("구조 자동 준비");
    const details = diagnostics.closest("details");
    expect(details).not.toBeNull();
    if (!details) throw new Error("Diagnostics must have a disclosure");
    expect(details).not.toHaveAttribute("open");
    const manual = screen.getByRole("region", { name: "직접 저장할 줄" });
    expect(manual.closest("details")).toBeNull();
    const summary = details.querySelector("summary");
    if (!summary) throw new Error("Disclosure summary is missing");
    fireEvent.click(summary);
    expect(diagnostics).toBeVisible();
    expect(manual).toBeVisible();
  });
});
