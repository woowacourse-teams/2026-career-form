import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowResults } from "./WorkflowResults";

const school: ReviewPlanItem = {
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
const textProps = {
  reviewItems: [school],
  results: [{ candidateId: "school", status: "written" as const }],
  fieldStateFor: () => ({ visible: true, value: "합성대학교" }),
};
const resume = { fileName: "synthetic-resume.pdf", fieldLabel: "이력서 첨부" };
const portfolio = {
  fileName: "synthetic-portfolio.pdf",
  fieldLabel: "포트폴리오",
};

it("appends an attachment category last with its count and file rows", () => {
  render(<WorkflowResults {...textProps} attachments={[resume, portfolio]} />);
  const list = screen.getByRole("list", { name: "범주별 입력 결과" });
  const categories = within(list)
    .getAllByRole("listitem")
    .filter((item) => item.parentElement === list);
  expect(categories.at(-1)).toHaveTextContent("첨부 파일");
  expect(screen.getByText("2개 첨부")).toBeVisible();
  expect(screen.getByText("synthetic-resume.pdf")).toBeVisible();
  expect(screen.getByText("이력서 첨부")).toBeVisible();
  expect(screen.getByText("synthetic-portfolio.pdf")).toBeVisible();
  expect(screen.getByText("0 / 2개 구역 확인")).toBeVisible();
});

it("confirms the attachment category like any other category", () => {
  render(<WorkflowResults {...textProps} attachments={[resume]} />);
  fireEvent.click(screen.getByRole("button", { name: "첨부 파일 확인했어요" }));
  expect(screen.getByText("1 / 2개 구역 확인")).toBeVisible();
});

it("locates the first attached field from the heading", () => {
  const onLocateAttachments = vi.fn(() => true);
  render(
    <WorkflowResults
      {...textProps}
      attachments={[resume]}
      onLocateAttachments={onLocateAttachments}
      onLocateSection={vi.fn(() => true)}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "첨부 파일 구역 보기" }));
  expect(onLocateAttachments).toHaveBeenCalledTimes(1);
});

it("resets the attachment confirmation when the attached list changes", () => {
  const view = render(
    <WorkflowResults {...textProps} attachments={[resume]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "첨부 파일 확인했어요" }));
  expect(screen.getByText("1 / 2개 구역 확인")).toBeVisible();
  view.rerender(
    <WorkflowResults {...textProps} attachments={[resume, portfolio]} />,
  );
  expect(
    screen.getByRole("button", { name: "첨부 파일 확인했어요" }),
  ).toHaveAttribute("aria-pressed", "false");
});

it("has no attachment category without attached files", () => {
  render(<WorkflowResults {...textProps} attachments={[]} />);
  expect(screen.queryByText("첨부 파일")).toBeNull();
  expect(screen.getByText("0 / 1개 구역 확인")).toBeVisible();
});

it("still shows the review list when only files were attached", () => {
  render(
    <WorkflowResults reviewItems={[]} results={[]} attachments={[resume]} />,
  );
  expect(screen.getByText("1개 첨부")).toBeVisible();
  expect(screen.getByText("0 / 1개 구역 확인")).toBeVisible();
  expect(screen.queryByText("입력 완료된 항목이 없어요.")).toBeNull();
  expect(
    screen.queryByText("수동 복사로 돌아가 필요한 값을 복사해 주세요."),
  ).toBeNull();
});
