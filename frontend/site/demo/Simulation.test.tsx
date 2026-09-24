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

it("plays one copy-and-paste scene on hover without network or clipboard access", async () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<PanelGuide kind="results" />);
    expect(screen.getByLabelText("상세주소")).toHaveValue("");
    expect(screen.queryByLabelText("결과 확인 시연 단계")).toBeNull();
    fireEvent.pointerEnter(container.firstElementChild!);
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(screen.getByText("복사됨")).toBeInTheDocument();
    expect(screen.getByLabelText("상세주소")).toHaveValue("");
    await act(() => vi.advanceTimersByTimeAsync(1300));
    expect(screen.getByLabelText("상세주소")).toHaveValue("101동 1001호");
    expect(screen.getByText("붙여넣었어요")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    fireEvent.pointerEnter(container.firstElementChild!);
    expect(screen.getByLabelText("상세주소")).toHaveValue("");
  } finally {
    vi.useRealTimers();
  }
});
