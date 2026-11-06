import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { UsageStep } from "./UsageStep";

function renderStep() {
  const handlers = {
    onBack: vi.fn(),
    onExtra: vi.fn(),
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
    "Career Form 패널에서 ‘자동 기입’을 누르세요",
    "채워진 내용을 확인하고 직접 제출하세요",
  ]);
  expect(screen.getByText("사용법 미리보기 · 계속 반복돼요")).toBeVisible();
  expect(
    screen.getByText(/동작을 설명하는 예시예요. 실제 화면은 지원서마다 달라요/),
  ).toBeVisible();
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

it("추가 정보 더 등록하기가 가장 먼저 눈에 띄는 버튼으로 있다", () => {
  const { onExtra } = renderStep();
  fireEvent.click(
    screen.getByRole("button", { name: "추가 정보 더 등록하기" }),
  );
  expect(onExtra).toHaveBeenCalledTimes(1);
});

it("전체 프로필 편집과 새 공고 보기로 넘어가고 이전으로 돌아간다", () => {
  const { onBack, onOpenProfile, onOpenPostings } = renderStep();
  fireEvent.click(screen.getByRole("button", { name: "전체 프로필 편집" }));
  fireEvent.click(screen.getByRole("button", { name: "새 공고 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(onOpenProfile).toHaveBeenCalledTimes(1);
  expect(onOpenPostings).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
});
