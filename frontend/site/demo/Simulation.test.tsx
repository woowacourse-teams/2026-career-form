import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Simulation } from "./Simulation";

vi.mock("wxt/browser", () => import("./browser"));
let observeVisible: (visible: boolean) => void;
const disconnect = vi.fn();
beforeEach(() => {
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
  it("starts only when visible and fills all ten example inputs through the real workflow", async () => {
    render(<Simulation />);
    expect(screen.getByLabelText("학교명")).toHaveValue("");
    act(() => observeVisible(false));
    expect(
      screen.queryByRole("region", { name: "지원서 자동 기입" }),
    ).not.toBeInTheDocument();
    act(() => observeVisible(true));
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
    expect(fetch).not.toHaveBeenCalled();
  });
  it("disconnects the observer when unmounted before entering view", async () => {
    const { unmount } = render(<Simulation />);
    await waitFor(() =>
      expect(screen.getByText("career@example.com")).toBeInTheDocument(),
    );
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
