import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AlertsGuideStep } from "./AlertsGuideStep";

function renderStep() {
  const onBack = vi.fn();
  const onNext = vi.fn();
  render(
    <AlertsGuideStep
      heading={createRef<HTMLHeadingElement>()}
      onBack={onBack}
      onNext={onNext}
    />,
  );
  return { onBack, onNext };
}
const title = () => screen.getByRole("heading", { level: 1 });
const guide = () => screen.getByRole("list", { name: "알림 안내 단계" });
const item = (name: RegExp) => within(guide()).getByRole("button", { name });

it("새 공고 알림 안내로 시작하고 세 단계를 옆에 보인다", () => {
  renderStep();
  expect(title()).toHaveTextContent("새 공고가 뜨면 알려드려요");
  expect(
    within(guide())
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["01새 공고 알림 받기", "02마감 알림 저장", "03지원 완료 표시"]);
  expect(item(/새 공고 알림 받기/)).toHaveAttribute("aria-current", "step");
});

it("옆의 번호나 글을 누르면 그 단계로 바로 이동한다", () => {
  renderStep();
  fireEvent.click(item(/지원 완료 표시/));
  expect(title()).toHaveTextContent("지원했다면 완료로 표시하세요");
  expect(item(/지원 완료 표시/)).toHaveAttribute("aria-current", "step");
  expect(item(/새 공고 알림 받기/)).not.toHaveAttribute("aria-current");
  expect(screen.getByText("지원 완료")).toBeInTheDocument();
  fireEvent.click(item(/마감 알림 저장/));
  expect(title()).toHaveTextContent("마감 알림을 저장하세요");
});

it("다음으로 세 단계를 지나면 다음 온보딩 단계로 넘어가고 이전으로 되돌아간다", () => {
  const { onBack, onNext } = renderStep();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(title()).toHaveTextContent("마감 알림을 저장하세요");
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(title()).toHaveTextContent("지원했다면 완료로 표시하세요");
  expect(onNext).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(onNext).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(title()).toHaveTextContent("마감 알림을 저장하세요");
  fireEvent.click(item(/새 공고 알림 받기/));
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
