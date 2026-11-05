import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteApp } from "../SiteApp";
import { STORE_URL } from "../content";
import {
  HANDOFF_QUERY,
  copyLink,
  handoffMailto,
  handoffUrl,
  sendToPc,
} from "./handoff";

const URL = "https://career.example/#try";

describe("sendToPc", () => {
  it("opens the share sheet with the landing link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await sendToPc(URL, { share })).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: URL }));
  });

  it("treats a closed share sheet as cancelled", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("closed", "AbortError"));
    const writeText = vi.fn();
    expect(await sendToPc(URL, { share, clipboard: { writeText } })).toBe(
      "cancelled",
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the link when an in-app browser refuses the share sheet", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("no", "NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await sendToPc(URL, { share, clipboard: { writeText } })).toBe(
      "copied",
    );
    expect(writeText).toHaveBeenCalledWith(URL);
  });

  it("reports failure when neither sharing nor copying works", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    expect(await sendToPc(URL, { clipboard: { writeText } })).toBe("failed");
    expect(await copyLink(URL, {})).toBe("failed");
  });
});

describe("handoff links", () => {
  it("points at the landing trial whatever page shares it", () => {
    expect(handoffUrl({ origin: "https://career.example" })).toBe(URL);
  });

  it("drafts a mail to oneself carrying the link", () => {
    const href = handoffMailto(URL);
    expect(href.startsWith("mailto:?subject=")).toBe(true);
    expect(decodeURIComponent(href)).toContain(URL);
  });

  it("treats touch-only screens as phones, not just narrow ones", () => {
    expect(HANDOFF_QUERY).toContain("max-width: 700px");
    expect(HANDOFF_QUERY).toContain("hover: none");
  });
});

describe("landing on a phone", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === HANDOFF_QUERY || query.includes("max-width: 700px"),
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never sends phones to the Chrome Web Store, which cannot install there", () => {
    const { container } = render(<SiteApp path="/" />);
    expect(container.querySelector(`a[href="${STORE_URL}"]`)).toBeNull();
    expect(screen.queryByRole("link", { name: "Chrome에 추가" })).toBeNull();
  });

  it("offers to send the link to a PC from the header, hero and closing", () => {
    render(<SiteApp path="/" />);
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("button", { name: "PC로 보내기" })).toBeVisible();
    const hero = within(document.querySelector('[data-ai="hero"]')!);
    expect(
      hero.getByRole("button", { name: "PC로 링크 보내기" }),
    ).toBeVisible();
    expect(hero.getByText(/PC Chrome 확장 프로그램/)).toBeVisible();
    const closing = within(
      screen.getByRole("region", { name: /커리어폼이 채울게요/ }),
    );
    expect(
      closing.getByRole("button", { name: "PC로 링크 보내기" }),
    ).toBeVisible();
  });

  it("gives the trial copy and mail options alongside the share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      share: undefined,
      clipboard: { writeText },
    });
    render(<SiteApp path="/" />);
    const trial = within(document.getElementById("try")!);
    expect(trial.getByRole("link", { name: "메일로 보내기" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:/),
    );
    expect(trial.getByText(handoffUrl(window.location))).toBeVisible();
    await act(async () =>
      fireEvent.click(trial.getByRole("button", { name: "링크 복사" })),
    );
    expect(writeText).toHaveBeenCalledWith(handoffUrl(window.location));
    expect(screen.getByText(/링크를 복사했어요/)).toBeVisible();
  });
});
