import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GREETING_EXAMPLE_COMPANIES } from "./greeting-companies";
import { GreetingStep } from "./GreetingStep";

function renderStep() {
  const onBack = vi.fn();
  const onNext = vi.fn();
  render(
    <GreetingStep
      heading={createRef<HTMLHeadingElement>()}
      onBack={onBack}
      onNext={onNext}
    />,
  );
  return { onBack, onNext };
}

it("인적사항 입력이 번거로우면 Greeting에서 가져올 수 있다고 묻는다", () => {
  renderStep();
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "혹시 모든 인적사항을 입력하기 번거로우신가요?",
    }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "과거에 Greeting에서 입력한 적이 있다면 한 번에 가져올 수 있어요!",
    ),
  ).toBeVisible();
});

it("Greeting 채용 솔루션을 쓰는 회사를 큰 회사부터 예시로 보이고 보장이 아니라고 알린다", () => {
  renderStep();
  const examples = screen.getByText(
    /Greeting 채용 솔루션을 쓰는 회사 예:/,
  ).parentElement!;
  expect(examples).toHaveTextContent(
    `Greeting 채용 솔루션을 쓰는 회사 예: ${GREETING_EXAMPLE_COMPANIES.join(", ")} 등`,
  );
  expect(GREETING_EXAMPLE_COMPANIES.slice(0, 4)).toEqual([
    "한화오션",
    "현대오토에버",
    "CJ올리브영",
    "하이브",
  ]);
  expect(GREETING_EXAMPLE_COMPANIES).toHaveLength(16);
  expect(
    screen.getByText(/목록에 없는 회사도 Greeting 지원서라면 될 수 있어요/),
  ).toBeVisible();
});

it("가져오는 순서를 세 줄로 보이고 장면과 함께 지금 단계를 표시한다", () => {
  renderStep();
  const steps = within(
    screen.getByRole("list", { name: "가져오는 순서" }),
  ).getAllByRole("listitem");
  expect(steps.map((item) => item.textContent)).toEqual([
    "써 둔 Greeting 지원서에서 Career Form 창을 열어요",
    "톱니바퀴에서 ‘프로필 가져오기’를 눌러요",
    "가져올 항목을 확인하고 저장하면 끝",
  ]);
  expect(steps[0]).toHaveAttribute("aria-current", "step");
});

it("기다리거나 확인하지 않고 다음으로 넘어가며 나중에 해도 된다고 알린다", () => {
  const { onBack, onNext } = renderStep();
  expect(
    screen.getByText(
      /지금 하지 않아도 돼요. 나중에 지원서 화면에서 언제든 할 수 있어요./,
    ),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "건너뛰기" })).toBeNull();
  expect(screen.queryByText(/알려 드려요|가져왔어요/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(onNext).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
});

it("반복 장면을 멈추고 다시 재생할 수 있고 반복된다는 문구는 없다", () => {
  renderStep();
  expect(screen.queryByText(/계속 반복돼요/)).toBeNull();
  const scene = screen.getByTestId("import-scene");
  expect(scene).not.toHaveAttribute("data-paused");
  fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
  expect(scene).toHaveAttribute("data-paused", "true");
  fireEvent.click(screen.getByRole("button", { name: "계속 재생" }));
  expect(scene).not.toHaveAttribute("data-paused");
});
