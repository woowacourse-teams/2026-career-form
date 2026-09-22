import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowResults } from "./WorkflowResults";

const item: ReviewPlanItem = {
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

it("announces the completed summary without moving focus or including interactive details", () => {
  const { rerender } = render(
    <div>
      <input aria-label="사용자가 입력 중인 필드" />
    </div>,
  );
  const input = screen.getByRole("textbox", {
    name: "사용자가 입력 중인 필드",
  });
  input.focus();
  rerender(
    <div>
      <input aria-label="사용자가 입력 중인 필드" />
      <WorkflowResults
        reviewItems={[item]}
        results={[{ candidateId: "name", status: "written" }]}
      />
    </div>,
  );
  const status = screen.getByRole("status");
  expect(status).toHaveAttribute("aria-atomic", "true");
  expect(
    within(status).getByRole("heading", { name: "자동 기입을 마쳤어요" }),
  ).toBeInTheDocument();
  expect(within(status).getByLabelText("입력 완료 1개")).toBeInTheDocument();
  expect(within(status).getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(within(status).queryByRole("button")).not.toBeInTheDocument();
  expect(within(status).queryByText("컴퓨터공학")).not.toBeInTheDocument();
  expect(input).toHaveFocus();
});

it("presents unsuccessful writes as an actionable review item instead of a separate failure group", () => {
  render(
    <WorkflowResults
      reviewItems={[{ ...item, status: "available" }]}
      results={[
        {
          candidateId: "major",
          status: "skipped",
          reason: "네이티브 컨트롤에 안전하게 입력할 수 없습니다.",
        },
      ]}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "자동 기입을 마쳤어요" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(screen.getByText("입력 못함")).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "입력 실패" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "확인할 항목 보기" }));
  expect(
    screen.getByRole("region", { name: "확인 필요한 항목" }),
  ).toHaveFocus();
});

it("marks an uncertain written value as entered without counting it again as completed", () => {
  render(
    <WorkflowResults
      reviewItems={[{ ...item, status: "needs-review" }]}
      results={[{ candidateId: "major", status: "written" }]}
      progress={[
        { id: "dom-major", label: "전공", category: "학력", status: "written" },
      ]}
      wasWritten={() => true}
      progressIdFor={() => "dom-major"}
      fieldStateFor={() => ({ visible: true, value: "다른 전공" })}
    />,
  );
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  const review = screen.getByRole("region", { name: "확인 필요한 항목" });
  expect(within(review).getByText("입력됨")).toBeInTheDocument();
  expect(within(review).getByText("입력 결과 확인")).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "입력 완료 내역" }),
  ).not.toBeInTheDocument();
});

it("puts an already matching value under collapsed skipped details with its actual reason", () => {
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[]}
      fieldStateFor={() => ({ visible: true, value: "컴퓨터공학" })}
    />,
  );
  const skipped = screen.getByText(/건너뛴 항목 보기/).closest("details")!;
  expect(skipped).not.toHaveAttribute("open");
  expect(within(skipped).getByText("기존 값 유지")).toBeInTheDocument();
  expect(within(skipped).queryByText("후보 여러 개")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "확인할 항목 보기" }),
  ).not.toBeInTheDocument();
});

it("keeps completed categories from earlier writes and opens their details on request", () => {
  render(
    <WorkflowResults
      reviewItems={[]}
      results={[{ candidateId: "latest-name", status: "written" }]}
      progress={[
        { id: "name", label: "이름", category: "기본 정보", status: "written" },
        {
          id: "email",
          label: "이메일",
          category: "기본 정보",
          status: "written",
        },
        { id: "school", label: "학교명", category: "학력", status: "written" },
      ]}
    />,
  );
  expect(screen.getByLabelText("입력 완료 3개")).toBeInTheDocument();
  const categories = screen.getByRole("list", { name: "범주별 입력 결과" });
  expect(within(categories).getByText("기본 정보")).toBeInTheDocument();
  expect(within(categories).getByText("2개 입력")).toBeInTheDocument();
  expect(within(categories).getByText("학력")).toBeInTheDocument();
  expect(within(categories).getByText("1개 입력")).toBeInTheDocument();
  const summary = screen.getByText("입력 완료 3개");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "입력한 항목 보기" }));
  expect(summary.closest("details")).toHaveAttribute("open");
  expect(summary).toHaveFocus();
  expect(screen.getByText("학교명")).toBeInTheDocument();
  expect(screen.queryByText("전공")).not.toBeInTheDocument();
});
it("keeps an earlier failure visible without locating a reused candidate from another snapshot", () => {
  const onLocate = vi.fn();
  render(
    <WorkflowResults
      reviewItems={[]}
      results={[]}
      onLocate={onLocate}
      progress={[
        {
          id: "stable-major",
          candidateId: "field-1",
          label: "전공",
          category: "학력",
          status: "skipped",
        },
      ]}
    />,
  );
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "전공 필드로 이동" }),
  ).toBeDisabled();
  expect(screen.getByText("입력 못함")).toBeInTheDocument();
});

it("focuses required review inside the panel without locating an application field", () => {
  const application = document.createElement("input");
  document.body.append(application);
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[{ candidateId: "name", status: "written" }]}
      onLocate={() => {
        application.focus();
        return true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "확인할 항목 보기" }));
  expect(
    screen.getByRole("region", { name: "확인 필요한 항목" }),
  ).toHaveFocus();
  expect(application).not.toHaveFocus();
  expect(
    screen.getByText("입력 완료 1개").closest("details"),
  ).not.toHaveAttribute("open");
  application.remove();
});

it("treats an empty final progress ledger as zero instead of reviving stale writes", () => {
  render(
    <WorkflowResults
      reviewItems={[]}
      results={[{ candidateId: "stale", status: "written" }]}
      progress={[]}
    />,
  );
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "입력한 항목 보기" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("확인 필요 0개")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("입력 실패 0개")).not.toBeInTheDocument();
});

it("scrolls only the enclosing panel viewport when opening required review", () => {
  render(
    <div aria-label="테스트 패널" style={{ overflowY: "auto" }}>
      <WorkflowResults reviewItems={[item]} results={[]} />
    </div>,
  );
  const viewport = screen.getByLabelText("테스트 패널");
  const review = screen.getByRole("region", { name: "확인 필요한 항목" });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 100, 400, 300),
  );
  vi.spyOn(review, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 300, 400, 600),
  );
  viewport.scrollTop = 40;
  const pageScroll = document.documentElement.scrollTop;
  fireEvent.click(screen.getByRole("button", { name: "확인할 항목 보기" }));
  expect(viewport.scrollTop).toBe(240);
  expect(document.documentElement.scrollTop).toBe(pageScroll);
});

it("does not count unmapped, missing-profile, hidden, or already matching fields as needing review", () => {
  render(
    <WorkflowResults
      reviewItems={[
        {
          ...item,
          candidateId: "unmapped",
          profileValue: undefined,
          previewValue: "입력 예정 값 없음",
        },
        { ...item, candidateId: "same", currentValue: "컴퓨터공학" },
        { ...item, candidateId: "hidden" },
        { ...item, candidateId: "ambiguous" },
      ]}
      results={[]}
      fieldStateFor={(id) => ({
        visible: id !== "hidden",
        value: id === "same" ? "컴퓨터공학" : "",
      })}
    />,
  );
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "전공 필드로 이동" }),
  ).toHaveLength(1);
});

it("keeps an unverified written mapping only in the review count", () => {
  render(
    <WorkflowResults
      reviewItems={[{ ...item, status: "needs-review" }]}
      results={[{ candidateId: "major", status: "written" }]}
    />,
  );
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
});

it("keeps a ready but unwritten field in review when its live value is still blank", () => {
  render(
    <WorkflowResults
      reviewItems={[item]}
      results={[{ candidateId: "major", status: "written" }]}
      progress={[]}
      wasWritten={() => false}
      fieldStateFor={() => ({ visible: true, value: "" })}
    />,
  );
  expect(screen.getByLabelText("확인 필요 1개")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "전공 필드로 이동" }),
  ).toBeInTheDocument();
  expect(screen.getByText("선택 필요")).toBeInTheDocument();
  expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
});

it("does not ask to review an unwritten field whose current value already matches the profile", () => {
  render(
    <WorkflowResults
      reviewItems={[{ ...item, status: "needs-review" }]}
      results={[{ candidateId: "major", status: "written" }]}
      progress={[]}
      wasWritten={() => false}
      fieldStateFor={() => ({ visible: true, value: "컴퓨터공학" })}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "전공 필드로 이동" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "확인할 항목 보기" }),
  ).not.toBeInTheDocument();
});

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
  expect(screen.getByText("선택 필요")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "전공 필드로 이동" }));
  expect(screen.getByText("이동 불가")).toBeInTheDocument();
});

it("combines write failures with unresolved fields and preserves masked previews", () => {
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
  expect(screen.queryByLabelText("입력 실패 1개")).not.toBeInTheDocument();
  expect(screen.getByLabelText("확인 필요 2개")).toBeInTheDocument();
  expect(screen.getByText("입력 못함")).toBeInTheDocument();
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
