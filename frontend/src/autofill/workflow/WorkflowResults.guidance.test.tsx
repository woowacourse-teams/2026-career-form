import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { ReviewPlanItem } from "../review/review-plan";
import type { WriteFailureCode } from "../write/failure";
import { WorkflowResults } from "./WorkflowResults";

const item: ReviewPlanItem = {
  candidateId: "search",
  fieldLabel: "전공",
  currentValue: "",
  profileValue: "합성테스트전공",
  previewValue: "합성테스트전공",
  status: "available",
  selected: true,
  disabled: false,
  revealed: true,
  reason: "",
};

it.each<[WriteFailureCode, string]>([
  ["SEARCH_NO_RESULTS", "검색 결과가 없어요. 다른 이름으로 찾아 주세요."],
  [
    "SEARCH_NO_EXACT_MATCH",
    "등록한 값과 정확히 일치하는 검색 결과가 없어요. 목록에서 다른 이름을 찾아 주세요.",
  ],
  [
    "SEARCH_AMBIGUOUS",
    "일치하는 검색 결과가 여러 개예요. 목록에서 직접 골라 주세요.",
  ],
  [
    "SEARCH_TIMEOUT",
    "검색 결과를 기다렸지만 응답을 확인하지 못했어요. 지원서에서 다시 검색해 주세요.",
  ],
  [
    "EXAM_SCORE_NOT_READY",
    "시험명 선택 뒤에도 점수 칸을 확인하지 못했어요. 시험명을 목록에서 다시 고른 뒤 점수를 입력해 주세요.",
  ],
  [
    "ROW_SEARCH_UNCONFIRMED",
    "같은 행의 검색 항목을 확정하지 못해 입력을 보류했어요. 검색 항목을 목록에서 고른 뒤 이 값을 입력해 주세요.",
  ],
  [
    "FIELD_DISABLED",
    "지금은 비활성화된 칸이에요. 지원서의 입력 방법을 확인해 주세요.",
  ],
  [
    "SEARCH_UNCONFIRMED",
    "목록 선택을 확인하지 못했어요. 항목을 직접 골라 주세요.",
  ],
  [
    "FIELD_READONLY",
    "지금은 수정할 수 없는 칸이에요. 지원서의 입력 방법을 확인해 주세요.",
  ],
  [
    "FIELD_CHANGED",
    "입력 중 지원서의 필드 상태가 바뀌었어요. 해당 항목을 확인한 뒤 직접 입력해 주세요.",
  ],
  [
    "VALUE_NOT_RETAINED",
    "다른 항목을 입력한 뒤 선택값이 유지되지 않았어요. 목록에서 다시 골라 주세요.",
  ],
])(
  "explains %s without leaking raw errors or claiming a successful write",
  (failureCode, guidance) => {
    render(
      <WorkflowResults
        reviewItems={[item]}
        results={[
          {
            candidateId: "search",
            status: "skipped",
            reason: "RAW_PRIVATE_ERROR",
            failureCode,
          },
        ]}
      />,
    );
    expect(screen.getByText(guidance)).toBeVisible();
    expect(screen.queryByText("합성테스트전공")).not.toBeInTheDocument();
    expect(screen.queryByText(/RAW_PRIVATE_ERROR/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
    expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  },
);

it("keeps specific failure guidance after its snapshot disappears without retaining values", () => {
  render(
    <WorkflowResults
      reviewItems={[]}
      results={[]}
      progress={[
        {
          id: "stable-search",
          label: "전공",
          category: "학력",
          status: "skipped",
          failureCode: "SEARCH_NO_RESULTS",
        },
      ]}
    />,
  );
  expect(
    screen.getByText("검색 결과가 없어요. 다른 이름으로 찾아 주세요."),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "전공 필드로 이동" }),
  ).toBeDisabled();
});

it("uses a cautious fallback for unknown failures without displaying sensitive previews", () => {
  render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          status: "sensitive",
          revealed: false,
          profileValue: "PRIVATE_VALUE",
        },
      ]}
      results={[
        {
          candidateId: "search",
          status: "skipped",
          reason: '"PRIVATE_VALUE" 검색 결과가 없어요.',
        },
      ]}
    />,
  );
  expect(screen.queryByText(/PRIVATE_VALUE/)).not.toBeInTheDocument();
  expect(screen.queryByText("••••••••")).not.toBeInTheDocument();
  expect(
    screen.getByText(
      "자동으로 입력하지 못했어요. 지원서에서 이 값을 직접 입력해 주세요.",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/검색 결과가 없어요/)).not.toBeInTheDocument();
});
