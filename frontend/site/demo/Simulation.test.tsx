import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Simulation } from "./Simulation";
import { PanelGuide } from "./PanelPreview";

vi.mock("wxt/browser", () => import("./browser"));
let observeVisible: (visible: boolean) => void;
const disconnect = vi.fn();
beforeEach(() => {
  observeVisible = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observeVisible = (visible) =>
          callback(
            [{ isIntersecting: visible } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network must not be accessed");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("isolated automatic demonstration", () => {
  it("waits for hover even when visible, then fills without scrolling the page", async () => {
    const scroll = vi.fn();
    const { container } = render(<Simulation />);
    container.querySelectorAll("input").forEach((input) => {
      input.scrollIntoView = scroll;
    });
    expect(screen.getByLabelText("학교명")).toHaveValue("");
    act(() => observeVisible(false));
    expect(
      screen.queryByRole("region", { name: "지원서 자동 기입" }),
    ).not.toBeInTheDocument();
    act(() => observeVisible(true));
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(
      screen.queryByRole("region", { name: "지원서 자동 기입" }),
    ).not.toBeInTheDocument();
    fireEvent.pointerEnter(container.firstElementChild!);
    await screen.findByRole(
      "heading",
      { name: "기입 결과" },
      { timeout: 5000 },
    );
    for (const [label, value] of [
      ["성", "김"],
      ["이름", "커리어"],
      ["이메일", "career@example.com"],
      ["휴대전화", "01000000000"],
      ["학교명", "커리어대학교"],
      ["전공", "컴퓨터공학"],
      ["졸업일", "2026-02-20"],
      ["학점", "4.0"],
      ["자격증", "정보처리기사"],
      ["취득일", "2025-06-13"],
    ]) {
      expect(screen.getByLabelText(label!)).toHaveValue(value);
    }
    expect(container.querySelector("[data-demo-panel]")).toContainElement(
      screen.getByRole("region", { name: "지원서 자동 기입" }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
  });
  it.each(["focusIn", "pointerDown"] as const)(
    "supports %s without a mouse",
    async (event) => {
      const { container } = render(<Simulation />);
      fireEvent[event](container.firstElementChild!);
      await screen.findByRole(
        "heading",
        { name: "기입 결과" },
        { timeout: 5000 },
      );
    },
  );
});

it("shows the current grouped result with isolated example values", async () => {
  render(<PanelGuide kind="results" />);
  expect(
    await screen.findByRole("tab", { name: "확인 필요 2개" }),
  ).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "기본주소 복사" })).toBeVisible();
  expect(screen.getByText("예시시 가상로 100")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "입력 완료 4개" }));
  expect(
    screen.getByRole("tabpanel", { name: "입력 완료 4개" }),
  ).toHaveTextContent("직장경력");
  expect(
    screen.getByRole("tabpanel", { name: "입력 완료 4개" }),
  ).not.toHaveTextContent("이메일");
  expect(fetch).not.toHaveBeenCalled();
});

it("lets readers switch highlighted sections and explicitly confirm the current example", async () => {
  const { container } = render(<PanelGuide kind="results" />);
  await screen.findByRole("tab", { name: "입력 완료 4개" });
  container
    .querySelectorAll<HTMLInputElement>("input")
    .forEach((input, index) => {
      input.getBoundingClientRect = () =>
        new DOMRect(20, 60 + index * 55, 240, 36);
    });
  fireEvent.click(screen.getByRole("button", { name: "기본주소 필드로 이동" }));
  expect(container.querySelector('[aria-label="결과 체험"]')).toHaveAttribute(
    "data-guided",
    "false",
  );
  expect(screen.getByLabelText("기본주소")).toHaveStyle({
    outlineOffset: "-2px",
  });
  expect(screen.getByText(/위 지원서의 기본주소/)).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "입력 완료 4개" }));
  expect(container.querySelector('[aria-label="결과 체험"]')).toHaveAttribute(
    "data-guided",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "직장경력 구역 보기" }));
  expect(screen.getByLabelText("기본주소").style.outlineOffset).toBe("");
  const old = [
    ...document.querySelectorAll("[data-career-form-section-highlight]"),
  ];
  expect(old).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "어학 구역 보기" }));
  expect(old.every((element) => !element.isConnected)).toBe(true);
  expect(
    document.querySelectorAll("[data-career-form-section-highlight]"),
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "어학 확인했어요" }));
  expect(
    screen.getByRole("button", { name: "어학 요약 펼치기" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("1 / 2개 구역 확인")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("demonstrates selection, highlighting and confirmation in three timed steps", async () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<PanelGuide kind="results" />);
    container
      .querySelectorAll<HTMLInputElement>("input")
      .forEach((input, index) => {
        input.getBoundingClientRect = () =>
          new DOMRect(20, 60 + index * 55, 240, 36);
      });
    fireEvent.click(screen.getByRole("button", { name: /다시 재생/ }));
    expect(container.firstElementChild).toHaveAttribute("data-step", "1");
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(container.firstElementChild).toHaveAttribute("data-step", "2");
    expect(
      document.querySelectorAll("[data-career-form-section-highlight]"),
    ).toHaveLength(2);
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(container.firstElementChild).toHaveAttribute("data-step", "3");
    expect(screen.getByText("1 / 2개 구역 확인")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "직장경력 요약 펼치기" }),
    ).toHaveAttribute("aria-expanded", "false");
    await act(() => vi.advanceTimersByTimeAsync(2500));
    fireEvent.click(screen.getByRole("button", { name: /다시 재생/ }));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByText("0 / 2개 구역 확인")).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});
