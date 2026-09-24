import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReviewPlanItem } from "../review/review-plan";
import { WorkflowResults } from "./WorkflowResults";

function field(
  id: string,
  key: string,
  value: string,
  index = 0,
): ReviewPlanItem {
  return {
    candidateId: id,
    fieldLabel: id,
    profileFieldKey: key,
    itemIndex: index,
    profileEntryId: `record-${index}`,
    currentValue: "",
    profileValue: value,
    previewValue: value,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "",
  };
}
const items = [
  field("school", "education.university.schoolName", "합성대학교"),
  field("major", "education.university.majorName", "합성전공"),
  field("school2", "education.university.schoolName", "두번째대학교", 1),
];
function props(reviewItems = items) {
  return {
    reviewItems,
    results: reviewItems.map((item) => ({
      candidateId: item.candidateId,
      status: "written" as const,
    })),
    fieldStateFor: (id: string) => ({
      visible: true,
      value: reviewItems.find((item) => item.candidateId === id)!.profileValue!,
    }),
  };
}
it("shows a category count and only marks a section checked explicitly", () => {
  const locate = vi.fn(() => true);
  render(<WorkflowResults {...props()} onLocateSection={locate} />);
  expect(
    screen.getByRole("heading", { name: "제출 전, 입력한 내용을 살펴보세요" }),
  ).toBeVisible();
  expect(screen.getByText("3개 입력")).toBeVisible();
  expect(screen.queryByText("합성대학교")).toBeNull();
  const checked = screen.getByRole("button", { name: "학력 확인했어요" });
  expect(checked).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "학력 구역 보기" }));
  expect(locate).toHaveBeenCalledWith(["school", "major", "school2"]);
  expect(checked).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(checked);
  expect(
    screen.getByRole("button", { name: "학력 요약 펼치기" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("1 / 1개 구역 확인")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "학력 요약 펼치기" }));
  fireEvent.click(screen.getByRole("button", { name: "학력 확인 취소" }));
  expect(screen.getByText("0 / 1개 구역 확인")).toBeVisible();
});
it("retains explicit checks across tabs, but resets them when summary contents change", () => {
  const view = render(<WorkflowResults {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: "학력 확인했어요" }));
  fireEvent.click(screen.getByRole("tab", { name: "확인 필요 0개" }));
  fireEvent.click(screen.getByRole("tab", { name: "입력 완료 3개" }));
  expect(
    screen.getByRole("button", { name: "학력 요약 펼치기" }),
  ).toHaveAttribute("aria-expanded", "false");
  const updated = items.map((item) =>
    item.candidateId === "major"
      ? { ...item, profileValue: "변경된전공" }
      : item,
  );
  view.rerender(<WorkflowResults {...props(updated)} />);
  expect(
    screen.getByRole("button", { name: "학력 확인했어요" }),
  ).toHaveAttribute("aria-pressed", "false");
  view.rerender(<WorkflowResults {...props()} />);
  expect(
    screen.getByRole("button", { name: "학력 확인했어요" }),
  ).toHaveAttribute("aria-pressed", "false");
});
it("does not invent values for historical records or locate a reused candidate", () => {
  const locate = vi.fn(() => true);
  render(
    <WorkflowResults
      reviewItems={[]}
      results={[]}
      progress={[
        {
          id: "old",
          candidateId: "reused",
          label: "학교명",
          category: "학력",
          status: "written",
        },
      ]}
      fieldStateFor={() => ({ visible: true, value: "UNRELATED_VALUE" })}
      onLocateSection={locate}
    />,
  );
  const completed = screen.getByRole("region", { name: "입력 완료 내역" });
  expect(within(completed).queryByText("지원서에서 확인")).toBeNull();
  expect(within(completed).queryByText("UNRELATED_VALUE")).toBeNull();
  expect(
    within(completed).getByRole("button", { name: "학력 구역 보기" }),
  ).toBeDisabled();
  expect(locate).not.toHaveBeenCalled();
});
it("reports unavailable section navigation without checking it", () => {
  const locate = vi.fn(() => false);
  render(<WorkflowResults {...props()} onLocateSection={locate} />);
  fireEvent.click(screen.getByRole("button", { name: "학력 구역 보기" }));
  expect(locate).toHaveBeenCalledWith(["school", "major", "school2"]);
  expect(screen.getByRole("button", { name: "학력 구역 보기" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "학력 확인했어요" }),
  ).toHaveAttribute("aria-pressed", "false");
});

it("resets only the changed section and never restores a removed section's check", () => {
  const all = [
    ...items,
    field("email", "contact.contact.email", "synthetic@example.com"),
  ];
  const view = render(<WorkflowResults {...props(all)} />);
  fireEvent.click(screen.getByRole("button", { name: "학력 확인했어요" }));
  fireEvent.click(
    screen.getByRole("button", { name: "연락처와 주소 확인했어요" }),
  );
  expect(screen.getByText("2 / 2개 구역 확인")).toBeVisible();
  view.rerender(<WorkflowResults {...props(all.slice(1))} />);
  expect(
    screen.getByRole("button", { name: "학력 확인했어요" }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(
    screen.getByRole("button", { name: "연락처와 주소 요약 펼치기" }),
  ).toHaveAttribute("aria-expanded", "false");
  view.rerender(<WorkflowResults {...props(items)} />);
  view.rerender(<WorkflowResults {...props(all)} />);
  expect(
    screen.getByRole("button", { name: "연락처와 주소 확인했어요" }),
  ).toHaveAttribute("aria-pressed", "false");
});
it("counts top-level education choices in the category without displaying them", () => {
  const all = [
    ...items,
    field("latest", "education.university.latestEducationType", "대학(학사)"),
  ];
  render(<WorkflowResults {...props(all)} onLocateSection={() => true} />);
  expect(screen.getByRole("button", { name: "학력 구역 보기" })).toBeEnabled();
  expect(screen.getByText("4개 입력")).toBeVisible();
  expect(screen.queryByText("최종학력")).toBeNull();
});
it("counts all repeated fields in one category", () => {
  const all = items.map((item) => ({
    ...item,
    itemIndex: undefined,
    profileEntryId: undefined,
  }));
  render(<WorkflowResults {...props(all)} onLocateSection={() => true} />);
  expect(screen.getByText("3개 입력")).toBeVisible();
  expect(
    screen.getAllByRole("button", { name: "학력 구역 보기" }),
  ).toHaveLength(1);
});
it("does not attach an old progress entry to a reused current candidate", () => {
  const current = props(items.slice(0, 1));
  render(
    <WorkflowResults
      {...current}
      progress={[
        {
          id: "old",
          candidateId: "school",
          label: "이전 학교명",
          category: "학력",
          status: "written",
        },
      ]}
      progressIdFor={() => "different-record"}
      onLocateSection={() => true}
    />,
  );
  const completed = screen.getByRole("region", { name: "입력 완료 내역" });
  expect(within(completed).queryByText("지원서에서 확인")).toBeNull();
  expect(within(completed).queryByText("합성대학교")).toBeNull();
  expect(
    within(completed).getByRole("button", { name: "학력 구역 보기" }),
  ).toBeDisabled();
});
it("never substitutes stored profile values when a live value is unavailable", () => {
  render(<WorkflowResults {...props()} fieldStateFor={undefined} />);
  const completed = screen.getByRole("region", { name: "입력 완료 내역" });
  expect(within(completed).queryByText("합성대학교")).toBeNull();
  expect(within(completed).queryByText("지원서에서 확인")).toBeNull();
});

it("navigates a whole category and collapses its summary on explicit confirmation", () => {
  const locate = vi.fn(() => true);
  const locateField = vi.fn(() => true);
  render(
    <WorkflowResults
      {...props()}
      onLocateSection={locate}
      onLocate={locateField}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "학력 구역 보기" }));
  expect(locate).toHaveBeenCalledWith(["school", "major", "school2"]);
  expect(locateField).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "학력 확인했어요" }));
  expect(
    screen.getByRole("button", { name: "학력 요약 펼치기" }),
  ).toHaveAttribute("aria-expanded", "false");
  const reopen = screen.getByRole("button", {
    name: "학력 확인 완료, 요약 펼치기",
  });
  expect(reopen).toHaveFocus();
  fireEvent.click(reopen);
  expect(screen.getByRole("button", { name: "학력 확인 취소" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "학력 확인 취소" }),
  ).toHaveAttribute("aria-pressed", "true");
});

it("does not mark a manually collapsed section checked and preserves keyboard focus without navigation", () => {
  render(<WorkflowResults {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: "학력 요약 접기" }));
  expect(screen.getByText("0 / 1개 구역 확인")).toBeVisible();
  expect(screen.queryByText("✓")).toBeNull();
  const buttons = screen.getAllByRole("button", { name: "학력 요약 펼치기" });
  fireEvent.click(buttons[0]);
  fireEvent.click(screen.getByRole("button", { name: "학력 확인했어요" }));
  expect(
    screen.getByRole("button", { name: "학력 요약 펼치기" }),
  ).toHaveFocus();
  expect(
    screen.getByRole("button", { name: "학력 요약 펼치기" }),
  ).toHaveAttribute("aria-expanded", "false");
});

it("shows only category navigation and counts, with no individual values or fallback placeholders", () => {
  const { container } = render(
    <WorkflowResults {...props()} onLocateSection={() => true} />,
  );
  expect(screen.getByRole("button", { name: "학력 구역 보기" })).toBeVisible();
  expect(screen.getByText("3개 입력")).toBeVisible();
  for (const value of [
    "합성대학교",
    "합성전공",
    "두번째대학교",
    "학교명",
    "지원서에서 확인",
  ])
    expect(container.innerHTML).not.toContain(value);
});
