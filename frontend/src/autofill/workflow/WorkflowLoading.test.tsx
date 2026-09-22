import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { WorkflowLoading } from "./WorkflowLoading";

it("keeps category counts instead of a rolling feed of field labels", () => {
  render(
    <WorkflowLoading
      writing
      currentCategory="학력"
      progress={[
        {
          id: "name",
          label: "이름",
          category: "기본 인적사항",
          status: "written",
        },
        {
          id: "email",
          label: "이메일",
          category: "기본 인적사항",
          status: "written",
        },
        { id: "major", label: "전공", category: "학력", status: "skipped" },
      ]}
    />,
  );
  expect(
    screen.getByRole("list", { name: "범주별 입력 현황" }),
  ).toHaveTextContent("기본 인적사항2개 입력");
  expect(
    screen.getByRole("list", { name: "범주별 입력 현황" }),
  ).toHaveTextContent("학력입력 중");
  expect(screen.queryByText("이름 입력 완료")).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
});
it("names the actual operation and retains previous category counts during address work", () => {
  render(
    <WorkflowLoading
      writing={false}
      activity="address"
      progress={[
        {
          id: "name",
          label: "이름",
          category: "기본 인적사항",
          status: "written",
        },
      ]}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "주소 검색 결과를 확인하고 있어요",
  );
  expect(
    screen.getByRole("list", { name: "범주별 입력 현황" }),
  ).toHaveTextContent("1개 입력");
});
