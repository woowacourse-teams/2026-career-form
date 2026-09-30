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
it("writes the nineteen profile fields at 667ms intervals and completes only after the last write", () => {
  vi.useFakeTimers();
  const root = form();
  const counts: number[] = [];
  let duration: number | undefined;
  startScenario({
    root,
    onProgress: (n) => counts.push(n),
    onComplete: (ms) => {
      duration = ms;
    },
    onError: () => {
      throw Error("unexpected");
    },
  });
  vi.advanceTimersByTime(666);
  expect(root.querySelector("input")!.value).toBe("");
  vi.advanceTimersByTime(1);
  expect(root.querySelector("input")!.value).toBe("김");
  vi.advanceTimersByTime(12005);
  expect(duration).toBeUndefined();
  expect(root.querySelector<HTMLInputElement>("#acquired")!.value).toBe("");
  vi.advanceTimersByTime(1);
  expect(duration).toBe(12673);
  expect(counts).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  ]);
  expect(
    Array.from(root.querySelectorAll("input"), (input) => input.value),
  ).toEqual([
    "김",
    "커리어",
    "KIM",
    "CAREER",
    "대한민국",
    "career@example.com",
    "01000000000",
    "대한민국",
    "학사",
    "커리어대학교",
    "컴퓨터공학",
    "졸업",
    "2020-03-02",
    "2026-02-20",
    "4.0",
    "4.50",
    "정보처리기사",
    "한국산업인력공단",
    "2025-06-13",
  ]);
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
  vi.advanceTimersByTime(667);
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
