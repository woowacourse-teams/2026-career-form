import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { UsageStep } from "./UsageStep";

function renderStep() {
  const handlers = {
    onBack: vi.fn(),
    onOpenProfile: vi.fn(),
    onOpenPostings: vi.fn(),
  };
  render(<UsageStep heading={createRef<HTMLHeadingElement>()} {...handlers} />);
  return handlers;
}

it("지원서에서 쓰는 세 단계와 반복 재생 장면을 보인다", () => {
  renderStep();
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "이제 지원서에서 써 보세요",
    }),
  ).toBeVisible();
  expect(
    within(screen.getByRole("list", { name: "사용 순서" }))
      .getAllByRole("listitem")
      .map((item) => item.querySelector("b")?.textContent),
  ).toEqual([
    "작성 중인 지원서 탭을 여세요",
    "지원서 옆 Career Form 창에서 ‘자동 기입’을 누르세요",
    "채워진 내용을 확인하고 직접 제출하세요",
  ]);
  expect(screen.queryByText(/계속 반복돼요/)).toBeNull();
  expect(
    screen.getByText(/동작을 설명하는 예시예요. 실제 화면은 지원서마다 달라요/),
  ).toBeVisible();
});

it("지금 상태로도 쓸 수 있고 탭을 닫아도 된다고 알린다", () => {
  renderStep();
  expect(
    screen.getByText(/이름과 이메일만으로도 쓸 수 있어요.*이 탭은 닫아도 돼요/),
  ).toBeVisible();
});

it("장면이 처음에는 지원서 열기 단계를 표시한다", () => {
  renderStep();
  const steps = within(
    screen.getByRole("list", { name: "사용 순서" }),
  ).getAllByRole("listitem");
  expect(steps[0]).toHaveAttribute("aria-current", "step");
  expect(steps[1]).not.toHaveAttribute("aria-current");
});

it("반복 재생 장면을 멈추고 다시 재생할 수 있다", () => {
  renderStep();
  const scene = screen.getByTestId("fill-scene");
  expect(scene).not.toHaveAttribute("data-paused");
  fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
  expect(scene).toHaveAttribute("data-paused", "true");
  fireEvent.click(screen.getByRole("button", { name: "계속 재생" }));
  expect(scene).not.toHaveAttribute("data-paused");
});

it("주 버튼은 채워진 전체 프로필 입력하기 하나이고 공고 보기는 테두리 버튼, 이전은 글자 버튼이다", () => {
  renderStep();
  const actions = screen.getByRole("group", { name: "다음에 할 일" });
  const [back, postings, profile] = within(actions).getAllByRole("button");
  expect(profile).toHaveAttribute("data-variant", "primary");
  expect(postings).toHaveAttribute("data-variant", "outline");
  expect(back).toHaveAttribute("data-variant", "text");
});

it("주 버튼은 전체 프로필 입력하기이고, 공고 버튼과 이전만 함께 둔다", () => {
  renderStep();
  const actions = screen.getByRole("group", { name: "다음에 할 일" });
  expect(
    within(actions)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["이전", "지금 채용 중인 회사 보기", "전체 프로필 입력하기"]);
  expect(
    screen.queryByRole("button", { name: "추가 정보 더 등록하기" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "새 공고 보기" })).toBeNull();
  expect(screen.queryByRole("button", { name: "전체 프로필 편집" })).toBeNull();
});

it("전체 프로필 입력은 관리 페이지 프로필을, 진행 중인 회사는 새 공고 탭을 열고 이전으로 돌아간다", () => {
  const { onBack, onOpenProfile, onOpenPostings } = renderStep();
  fireEvent.click(screen.getByRole("button", { name: "전체 프로필 입력하기" }));
  fireEvent.click(
    screen.getByRole("button", {
      name: "지금 채용 중인 회사 보기",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(onOpenProfile).toHaveBeenCalledTimes(1);
  expect(onOpenPostings).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
});
