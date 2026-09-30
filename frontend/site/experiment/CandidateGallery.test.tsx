import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CandidateGallery } from "./CandidateGallery";
import { SCENARIO_DURATION_MS } from "./scenario";
afterEach(() => vi.useRealTimers());
it("compares four candidates without saving survey responses", () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  render(<CandidateGallery />);
  expect(screen.getAllByRole("article")).toHaveLength(4);
  for (const label of [
    "안심 안내형",
    "입력 미리보기형",
    "시선 분산형",
    "다음 행동 안내형",
  ])
    expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
  expect(setItem).not.toHaveBeenCalled();
  setItem.mockRestore();
});
it("replays all candidates from the same real writes and can replay after completion", () => {
  vi.useFakeTimers();
  render(<CandidateGallery />);
  const live = screen.getByRole("article", { name: "입력 미리보기형" });
  fireEvent.click(screen.getByRole("button", { name: "4개 함께 재생" }));
  expect(screen.getByRole("button", { name: "멈추기" })).toBeEnabled();
  act(() => vi.advanceTimersByTime(280));
  expect(within(live).getByText("김")).toBeInTheDocument();
  expect(screen.getByLabelText("성")).toHaveValue("김");
  act(() => vi.advanceTimersByTime(SCENARIO_DURATION_MS - 280));
  expect(screen.getByText("재생 완료")).toBeInTheDocument();
  expect(screen.getByLabelText("취득일")).toHaveValue("2025-06-13");
  fireEvent.click(screen.getByRole("button", { name: "4개 함께 재생" }));
  expect(screen.getByLabelText("성")).toHaveValue("");
  act(() => vi.advanceTimersByTime(280));
  fireEvent.click(screen.getByRole("button", { name: "멈추기" }));
  act(() => vi.advanceTimersByTime(SCENARIO_DURATION_MS));
  expect(screen.getByLabelText("이름")).toHaveValue("");
});
it("cancels playback on unmount", () => {
  vi.useFakeTimers();
  const { unmount } = render(<CandidateGallery />);
  fireEvent.click(screen.getByRole("button", { name: "4개 함께 재생" }));
  const input = screen.getByLabelText("성");
  unmount();
  act(() => vi.advanceTimersByTime(SCENARIO_DURATION_MS));
  expect(input).toHaveValue("");
});
it("stops the preview when the tab is hidden", () => {
  vi.useFakeTimers();
  render(<CandidateGallery />);
  fireEvent.click(screen.getByRole("button", { name: "4개 함께 재생" }));
  act(() => vi.advanceTimersByTime(280));
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  act(() => vi.advanceTimersByTime(SCENARIO_DURATION_MS));
  expect(screen.getByText("일시 정지")).toBeInTheDocument();
  expect(screen.getByLabelText("이름")).toHaveValue("");
  visibility.mockRestore();
});
