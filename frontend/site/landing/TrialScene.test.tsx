import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteApp } from "../SiteApp";
import { filledCount, reviewCount, sampleFields } from "./sample-form";

const reachTrial = () =>
  vi
    .spyOn(document.getElementById("try")!, "getBoundingClientRect")
    .mockReturnValue({ top: 0, bottom: 900 } as DOMRect);

const wheel = (deltaY: number) => {
  const event = new WheelEvent("wheel", { deltaY, cancelable: true });
  act(() => {
    window.dispatchEvent(event);
  });
  return event.defaultPrevented;
};

const autofill = () => screen.getByRole("button", { name: /자동 기입/ });

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("landing trial", () => {
  it("fills the sample application, flags the undecided fields and offers install", () => {
    vi.useFakeTimers();
    const track = vi.fn();
    render(<SiteApp path="/" track={track} />);
    const trial = within(document.getElementById("try")!);
    fireEvent.click(autofill());
    expect(track).toHaveBeenCalledWith("trial_started", { surface: "site" });
    expect(
      trial.getByRole("button", { name: /AI가 채우는 중/ }),
    ).toBeDisabled();
    act(() => vi.advanceTimersByTime(3000));
    expect(track).toHaveBeenCalledWith("trial_completed", { surface: "site" });
    expect(trial.getByRole("status")).toHaveTextContent(
      `${filledCount}칸을 채웠어요`,
    );
    expect(trial.getByText(`노란 칸 ${reviewCount}개`)).toBeVisible();
    const fields = trial.getAllByRole("textbox");
    sampleFields.forEach((field, i) =>
      field.value
        ? expect(fields[i]).toHaveTextContent(field.value)
        : expect(fields[i]).toHaveTextContent("확인 필요"),
    );
    expect(trial.getByRole("link", { name: "Chrome에 추가" })).toHaveAttribute(
      "target",
      "_blank",
    );

    fireEvent.click(trial.getByRole("button", { name: "다시 해보기" }));
    expect(autofill()).toBeEnabled();
    expect(trial.getAllByRole("textbox")[0]).toHaveTextContent("");
  });

  it("holds the page on the trial until 자동 기입 is pressed", () => {
    render(<SiteApp path="/" />);
    reachTrial();
    expect(wheel(120)).toBe(true);
    expect(screen.getByText("먼저 자동 기입을 눌러보세요")).toBeVisible();
    expect(wheel(-120)).toBe(false);
    const key = new KeyboardEvent("keydown", {
      key: "PageDown",
      cancelable: true,
    });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);

    fireEvent.click(autofill());
    expect(wheel(120)).toBe(false);
  });

  it("does not hold before the trial reaches the top of the screen", () => {
    render(<SiteApp path="/" />);
    vi.spyOn(
      document.getElementById("try")!,
      "getBoundingClientRect",
    ).mockReturnValue({ top: 400, bottom: 1300 } as DOMRect);
    expect(wheel(120)).toBe(false);
  });

  it("lets visitors skip the trial and continue to the alerts", () => {
    render(<SiteApp path="/" />);
    reachTrial();
    fireEvent.click(screen.getByRole("button", { name: /건너뛰고 계속 보기/ }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(wheel(120)).toBe(false);
    expect(screen.getByRole("button", { name: "계속 보기 ↓" })).toBeVisible();
  });

  describe("on a phone", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
          matches: query.includes("max-width: 700px"),
          addEventListener: () => {},
          removeEventListener: () => {},
        })),
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it("offers to send the trial to a PC instead of running it", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { ...navigator, share });
      render(<SiteApp path="/" />);
      expect(screen.queryByRole("button", { name: /자동 기입/ })).toBeNull();
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "PC로 링크 보내기" }),
        ),
      );
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringMatching(/#try$/) }),
      );
    });

    it("copies the link when the share sheet is not available", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", {
        ...navigator,
        share: undefined,
        clipboard: { writeText },
      });
      render(<SiteApp path="/" />);
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "PC로 링크 보내기" }),
        ),
      );
      expect(writeText).toHaveBeenCalled();
      expect(screen.getByText(/링크를 복사했어요/)).toBeVisible();
    });

    it("never holds the scroll on a phone", () => {
      render(<SiteApp path="/" />);
      reachTrial();
      expect(wheel(120)).toBe(false);
    });
  });
});
