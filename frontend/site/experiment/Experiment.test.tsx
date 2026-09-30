import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Experiment } from "./Experiment";
beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function open() {
  render(<Experiment />);
  await act(async () => {});
}
async function start() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));
  });
}
it("starts from the actual panel, writes inputs and gates evaluation until completion", async () => {
  await open();
  expect(screen.getByLabelText("성")).toHaveValue("");
  await start();
  expect(
    screen.queryByRole("button", { name: "평가하기" }),
  ).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByLabelText("성")).toHaveValue("김");
  act(() => vi.advanceTimersByTime(18000));
  expect(screen.getByLabelText("취득일")).toHaveValue("2025-06-13");
  expect(screen.getByRole("button", { name: "평가하기" })).toBeEnabled();
});
it.each(["수동 복사로 돌아가기", "닫기"])(
  "cancels and resets with %s while keeping the assigned trial",
  async (action) => {
    await open();
    await start();
    act(() => vi.advanceTimersByTime(2000));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: action }));
    });
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.getByLabelText("성")).toHaveValue("");
    if (action === "닫기")
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "패널 다시 열기" }));
      });
    await start();
    act(() => vi.advanceTimersByTime(2000));
    expect(
      screen.getByRole("heading", { name: "1개 항목 입력" }),
    ).toBeInTheDocument();
  },
);
it("interrupts a hidden tab so throttled runs cannot become responses", async () => {
  await open();
  await start();
  act(() => vi.advanceTimersByTime(2000));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.getByRole("alert")).toHaveTextContent("다시");
  expect(
    screen.queryByRole("button", { name: "평가하기" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("성")).toHaveValue("");
});
it("cancels all writes on unmount", async () => {
  const { unmount } = render(<Experiment />);
  await act(async () => {});
  await start();
  const input = screen.getByLabelText("성");
  unmount();
  act(() => vi.advanceTimersByTime(30000));
  expect(input).toHaveValue("");
});
