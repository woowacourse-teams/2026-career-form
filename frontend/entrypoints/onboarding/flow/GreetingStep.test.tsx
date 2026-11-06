import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GreetingStep } from "./GreetingStep";

function renderStep(imported = false) {
  const onBack = vi.fn();
  const onNext = vi.fn();
  render(
    <GreetingStep
      heading={createRef<HTMLHeadingElement>()}
      imported={imported}
      onBack={onBack}
      onNext={onNext}
    />,
  );
  return { onBack, onNext };
}

it("예시 회사와 세 줄 요약으로 Greeting 가져오기를 안내한다", () => {
  renderStep();
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Greeting 지원서를 쓴 적이 있나요?",
    }),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole("list", {
        name: "Greeting으로 지원서를 받는 회사 예시",
      }),
    )
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["카카오게임즈", "컬리", "그 밖의 Greeting 지원서"]);
  expect(
    within(screen.getByRole("list", { name: "가져오는 순서" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual([
    "써 둔 지원서를 열어요",
    "패널 톱니에서 ‘프로필 가져오기’",
    "고르고 저장하면 끝",
  ]);
  expect(
    screen.getByText(
      "예시 화면이에요. 목록에 없는 회사도 될 수 있고, 가져올 항목은 저장 전에 직접 골라요.",
    ),
  ).toBeVisible();
});

it("가져오기 전에는 기다린다고 알리고 건너뛸 수 있다", () => {
  const { onBack, onNext } = renderStep();
  expect(screen.getByRole("status")).toHaveTextContent(
    "가져오면 이 화면이 알아서 이어져요.",
  );
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onNext).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
});

it("다른 탭에서 가져오기를 저장하면 가져왔다고 알리고 다음으로 넘어가게 한다", () => {
  const { onNext } = renderStep(true);
  expect(screen.getByRole("status")).toHaveTextContent(
    "가져왔어요. 프로필에 저장했어요.",
  );
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(onNext).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "건너뛰기" })).toBeNull();
});

it("반복 재생 장면을 멈추고 다시 재생할 수 있다", () => {
  renderStep();
  const scene = screen.getByTestId("import-scene");
  expect(scene).not.toHaveAttribute("data-paused");
  const pause = screen.getByRole("button", { name: "일시정지" });
  expect(pause).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(pause);
  expect(scene).toHaveAttribute("data-paused", "true");
  const resume = screen.getByRole("button", { name: "계속 재생" });
  expect(resume).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(resume);
  expect(scene).not.toHaveAttribute("data-paused");
});
