import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { WorkflowLoading } from "./WorkflowLoading";

it("shows actual field outcomes instead of a writing spinner", () => {
  render(
    <WorkflowLoading
      writing
      currentField="학교명"
      progress={[
        { id: "name", label: "이름", status: "written" },
        { id: "major", label: "전공", status: "skipped" },
      ]}
    />,
  );
  expect(screen.getByText("이름 입력 완료")).toBeInTheDocument();
  expect(screen.getByText("전공 확인 필요")).toBeInTheDocument();
  expect(screen.queryByText("학교명 입력 완료")).toBeNull();
});
