import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLoopTimeline } from "./timeline";

const durations = [100, 200, 300] as const;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useLoopTimeline", () => {
  it("단계마다 정한 시간이 지나면 다음 단계로 가고 마지막 뒤에는 처음으로 돌아간다", () => {
    const { result } = renderHook(() =>
      useLoopTimeline(durations, { paused: false }),
    );
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(99));
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(0);
  });
  it("멈추면 그 단계에 머물고 다시 재생하면 이어서 간다", () => {
    const { result, rerender } = renderHook(
      ({ paused }) => useLoopTimeline(durations, { paused }),
      { initialProps: { paused: false } },
    );
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(1);
    rerender({ paused: true });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(1);
    rerender({ paused: false });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(2);
  });
  it("정지 화면 단계를 주면 그 단계만 보이고 타이머를 걸지 않는다", () => {
    const { result } = renderHook(() =>
      useLoopTimeline(durations, { paused: false, still: 2 }),
    );
    expect(result.current).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("화면에서 사라지면 타이머를 남기지 않는다", () => {
    const { unmount } = renderHook(() =>
      useLoopTimeline(durations, { paused: false }),
    );
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
