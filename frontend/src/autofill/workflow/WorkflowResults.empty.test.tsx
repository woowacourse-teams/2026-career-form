import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowResults } from "./WorkflowResults";

const written: ReviewPlanItem = {
  candidateId: "school",
  fieldLabel: "school",
  profileFieldKey: "education.university.schoolName",
  itemIndex: 0,
  profileEntryId: "record-0",
  currentValue: "",
  profileValue: "합성대학교",
  previewValue: "합성대학교",
  status: "available",
  selected: true,
  disabled: false,
  revealed: true,
  reason: "",
};

it.each([{ operated: [] }, { operated: ["학력"] }])(
  "distinguishes zero field results from a written value: %j",
  ({ operated }) => {
    const view = render(
      <WorkflowResults
        reviewItems={[]}
        results={[]}
        operatedCategories={operated}
      />,
    );
    expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
    expect(screen.getByLabelText("확인 필요 0개")).toBeInTheDocument();
    const emptyHeading = screen.getByRole("heading", { level: 3 });
    expect(emptyHeading).toBeVisible();
    const emptyTitle = emptyHeading.textContent;
    if (operated.length > 0)
      expect(
        screen.getByRole("button", { name: "학력 구역 보기" }),
      ).toBeVisible();
    view.rerender(
      <WorkflowResults
        reviewItems={[written]}
        results={[{ candidateId: "school", status: "written" }]}
        fieldStateFor={() => ({ visible: true, value: "합성대학교" })}
      />,
    );
    expect(screen.getByLabelText("입력 완료 1개")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3 }).textContent).not.toBe(
      emptyTitle,
    );
  },
);
