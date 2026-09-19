import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleSimulation } from "./simulation-controller";

afterEach(() => vi.useRealTimers());
describe("automatic cursor sequence", () => {
  it("moves before clicking and hides the cursor after the click", () => {
    vi.useFakeTimers();
    const events: string[] = [];
    scheduleSimulation({
      move: () => events.push("move"),
      click: () => events.push("click"),
      hide: () => events.push("hide"),
      reducedMotion: false,
    });
    vi.advanceTimersByTime(400);
    expect(events).toEqual(["move"]);
    vi.advanceTimersByTime(1300);
    expect(events).toEqual(["move", "click"]);
    vi.runAllTimers();
    expect(events).toEqual(["move", "click", "hide"]);
  });
  it("cancels all pending effects when disposed", () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const dispose = scheduleSimulation({
      move: () => events.push("move"),
      click: () => events.push("click"),
      hide: () => events.push("hide"),
      reducedMotion: false,
    });
    dispose();
    vi.runAllTimers();
    expect(events).toEqual([]);
  });
  it("performs the example without cursor motion when reduced motion is requested", () => {
    vi.useFakeTimers();
    const events: string[] = [];
    scheduleSimulation({
      move: () => events.push("move"),
      click: () => events.push("click"),
      hide: () => events.push("hide"),
      reducedMotion: true,
    });
    vi.runAllTimers();
    expect(events).toEqual(["click", "hide"]);
  });
});
