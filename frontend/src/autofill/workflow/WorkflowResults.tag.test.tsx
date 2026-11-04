import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowResults } from "./WorkflowResults";

const SENTENCE =
  "자동으로 선택하기 어려운 항목이에요. 지원서 목록에서 직접 골라 주세요.";
const major: ReviewPlanItem = {
  candidateId: "major",
  fieldLabel: "전공",
  currentValue: "",
  previewValue: "컴퓨터공학",
  profileValue: "컴퓨터공학",
  status: "unavailable",
  selected: false,
  disabled: true,
  revealed: true,
  reason: "후보 여러 개",
};

it("replaces the visible guidance sentence with a short tag that keeps the sentence as its name", () => {
  render(
    <WorkflowResults
      reviewItems={[major]}
      results={[]}
      onLocate={() => true}
    />,
  );
  expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
  const tag = screen.getByLabelText(SENTENCE);
  expect(tag).toHaveTextContent("직접 선택");
  expect(tag).toHaveAttribute("title", SENTENCE);
  const locate = screen.getByRole("button", { name: "전공 필드로 이동" });
  expect(locate.parentElement).toContainElement(tag);
});

it("tells apart rows of the same field that target different controls", () => {
  render(
    <WorkflowResults
      reviewItems={[major, { ...major, candidateId: "major-2" }]}
      results={[]}
      onLocate={() => true}
    />,
  );
  const review = within(
    screen.getByRole("region", { name: "확인 필요한 항목" }),
  );
  expect(
    review.getByRole("button", { name: "전공 (1/2) 필드로 이동" }),
  ).toBeVisible();
  expect(
    review.getByRole("button", { name: "전공 (2/2) 필드로 이동" }),
  ).toBeVisible();
});
