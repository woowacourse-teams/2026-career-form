import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowResults } from "./WorkflowResults";

const item: ReviewPlanItem = {
  candidateId: "major",
  fieldLabel: "전공",
  currentValue: "",
  previewValue: "컴퓨터공학",
  status: "unavailable",
  selected: false,
  disabled: true,
  revealed: true,
  reason: "후보 여러 개",
};

it("keeps unresolved unapproved items visible and reports unavailable locations", () => {
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[
        {
          candidateId: "major",
          status: "skipped",
          reason: "사용자가 승인한 입력 항목이 아닙니다.",
        },
      ]}
      onLocate={() => false}
    />,
  );
  expect(screen.getByText("컴퓨터공학")).toBeInTheDocument();
  expect(screen.getByText("후보 여러 개")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "전공 필드로 이동" }));
  expect(screen.getByText("이동 불가")).toBeInTheDocument();
});

it("separates write failures from unresolved fields and preserves masked previews", () => {
  render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          candidateId: "salary",
          fieldLabel: "희망 연봉",
          status: "sensitive",
          previewValue: "••••••••",
          profileValue: "5000",
          revealed: false,
        },
      ]}
      results={[
        { candidateId: "name", status: "written" },
        {
          candidateId: "email",
          status: "skipped",
          reason: "네이티브 컨트롤에 안전하게 입력할 수 없습니다.",
        },
      ]}
      onLocate={() => true}
    />,
  );
  expect(screen.getByLabelText("입력 완료 1개")).toBeInTheDocument();
  expect(screen.getByLabelText("입력 실패 1개")).toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(screen.queryByText("5000")).not.toBeInTheDocument();
});

it("shows only the live options supplied for an unresolved field", () => {
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[]}
      optionsFor={() => ["컴퓨터공학부", "컴퓨터공학과"]}
    />,
  );
  expect(screen.getByText("컴퓨터공학부")).toBeInTheDocument();
  expect(screen.getByText("컴퓨터공학과")).toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
});
