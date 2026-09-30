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
  vi.unstubAllGlobals();
});
async function open() {
  render(<Experiment />);
  await act(async () => {});
  const intro = screen.queryByRole("button", {
    name: "안내를 읽었어요 · 체험 시작",
  });
  if (intro) fireEvent.click(intro);
}
async function start() {
  const intro = screen.queryByRole("button", {
    name: "안내를 읽었어요 · 체험 시작",
  });
  if (intro) fireEvent.click(intro);
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
  act(() => vi.advanceTimersByTime(280));
  expect(screen.getByLabelText("성")).toHaveValue("김");
  act(() => vi.advanceTimersByTime(6735));
  expect(screen.getByLabelText("취득일")).toHaveValue("2025-06-13");
  expect(screen.getByRole("button", { name: "평가하기" })).toBeEnabled();
});
it.each(["수동 복사로 돌아가기", "닫기"])(
  "cancels and resets with %s while keeping the assigned trial",
  async (action) => {
    await open();
    await start();
    act(() => vi.advanceTimersByTime(280));
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
    act(() => vi.advanceTimersByTime(280));
    expect(
      screen.getByRole("heading", { name: "1개 항목 입력" }),
    ).toBeInTheDocument();
  },
);
it("interrupts a hidden tab so throttled runs cannot become responses", async () => {
  await open();
  await start();
  act(() => vi.advanceTimersByTime(280));
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

it("collects three required ratings in the assigned order and downloads only the result schema", async () => {
  let downloaded: Blob | undefined;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL(blob: Blob) {
        downloaded = blob;
        return "blob:study";
      }
      static revokeObjectURL() {}
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await open();
  for (let i = 0; i < 3; i++) {
    expect(screen.getByLabelText("성")).toHaveValue("");
    await start();
    act(() => vi.advanceTimersByTime(7015));
    fireEvent.click(screen.getByRole("button", { name: "평가하기" }));
    const next = screen.getByRole("button", { name: "평가 저장" });
    expect(next).toBeDisabled();
    for (const name of ["comfort", "trust", "wait"])
      fireEvent.click(
        document.querySelector<HTMLInputElement>(
          `input[name="${name}"][value="4"]`,
        )!,
      );
    await act(async () => {
      fireEvent.click(next);
    });
  }
  expect(
    screen.getByRole("heading", {
      name: "마지막으로, 어떤 체험이 가장 좋았나요?",
    }),
  ).toBeInTheDocument();
  const download = screen.getByRole("button", { name: "결과 JSON 내려받기" });
  expect(download).toBeDisabled();
  fireEvent.click(screen.getByLabelText("차이 없음"));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(download);
  expect(downloaded).toBeInstanceOf(Blob);
  act(() => vi.advanceTimersByTime(1000));
  vi.useRealTimers();
  const result = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(downloaded!);
  });
  expect(JSON.parse(result)).toMatchObject({
    order: ["A", "B", "D"],
    preference: "none",
    reason: "",
    trials: [
      { variant: "A", durationMs: 6615 },
      { variant: "B", durationMs: 6615 },
      { variant: "D", durationMs: 6615 },
    ],
  });
  expect(result).not.toContain("career@example.com");
  expect(result).not.toContain("<input");
  vi.unstubAllGlobals();
});

it("restores evaluated trials without repeating them", async () => {
  const { createStudy, recordTrial, saveStudy } = await import("./study");
  saveStudy(
    recordTrial(createStudy(0), {
      variant: "A",
      ratings: { comfort: 3, trust: 4, wait: 2 },
      durationMs: 6615,
      reducedMotion: false,
    }),
  );
  await open();
  expect(
    screen.getByRole("heading", { name: "두 번째 체험 / 3" }),
  ).toBeInTheDocument();
  await start();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
});

it("renders 100 percent after the last DOM write before the shared completion transition", async () => {
  const { createStudy, saveStudy } = await import("./study");
  saveStudy(createStudy(2 / 6));
  await open();
  await start();
  act(() => vi.advanceTimersByTime(6615));
  expect(screen.getByLabelText("취득일")).toHaveValue("2025-06-13");
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  act(() => vi.advanceTimersByTime(400));
  expect(screen.getByRole("button", { name: "평가하기" })).toBeEnabled();
});

it("introduces the panel study before showing the application", () => {
  render(<Experiment />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "어떤 화면이 편안한가요",
  );
  expect(screen.queryByLabelText("성")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "안내를 읽었어요 · 체험 시작" }),
  );
  expect(screen.getByLabelText("성")).toBeInTheDocument();
});
