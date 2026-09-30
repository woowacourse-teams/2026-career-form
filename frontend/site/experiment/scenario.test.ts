import { afterEach, expect, it, vi } from "vitest";
import { scenarioFields, startScenario } from "./scenario";
afterEach(() => vi.useRealTimers());
function form() {
  const root = document.createElement("div");
  root.innerHTML = scenarioFields
    .map(({ id }) => `<input id="${id}">`)
    .join("");
  return root;
}
it("fills forty fields in quick uneven bursts with short pauses, identically on replay", () => {
  vi.useFakeTimers();
  const run = () => {
    const root = form();
    const times: number[] = [];
    let duration: number | undefined;
    const started = performance.now();
    startScenario({
      root,
      onProgress: (n) => {
        if (n) times.push(performance.now() - started);
      },
      onComplete: (ms) => {
        duration = ms;
      },
      onError: () => {
        throw Error("unexpected");
      },
    });
    vi.advanceTimersByTime(279);
    expect(root.querySelector("input")!.value).toBe("");
    vi.advanceTimersByTime(1);
    expect(root.querySelector("input")!.value).toBe("김");
    vi.advanceTimersByTime(210);
    expect(times).toEqual([280, 345, 445, 490]);
    vi.advanceTimersByTime(419);
    expect(times).toHaveLength(4);
    vi.advanceTimersByTime(1);
    expect(times[4]).toBe(910);
    vi.advanceTimersByTime(5704);
    expect(duration).toBeUndefined();
    expect(root.querySelector<HTMLInputElement>("#acquired")!.value).toBe("");
    vi.advanceTimersByTime(1);
    expect(duration).toBe(6615);
    expect(times).toHaveLength(40);
    expect(
      Array.from(root.querySelectorAll("input")).every(
        (input) => input.value.length > 0,
      ),
    ).toBe(true);
    expect(root.querySelector<HTMLInputElement>("#acquired")!.value).toBe(
      "2025-06-13",
    );
    return times;
  };
  expect(run()).toEqual(run());
});
it("cancels pending writes", () => {
  vi.useFakeTimers();
  const root = form();
  const stop = startScenario({
    root,
    onProgress: () => {},
    onComplete: () => {
      throw Error("completed");
    },
    onError: () => {},
  });
  vi.advanceTimersByTime(280);
  stop();
  vi.advanceTimersByTime(30000);
  expect(root.querySelector<HTMLInputElement>("#given-name")!.value).toBe("");
});
it.each(["missing", "invalid"])(
  "rejects %s inputs without reporting completion",
  (kind) => {
    vi.useFakeTimers();
    const root = form();
    let error = false;
    let complete = false;
    if (kind === "missing") root.querySelector("input")!.remove();
    else root.querySelector("input")!.type = "number";
    startScenario({
      root,
      onProgress: () => {},
      onComplete: () => {
        complete = true;
      },
      onError: () => {
        error = true;
      },
    });
    vi.runAllTimers();
    expect(error).toBe(true);
    expect(complete).toBe(false);
  },
);
