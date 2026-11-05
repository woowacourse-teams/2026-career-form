// Phones cannot run Chrome extensions, so visitors there are asked to send the
// landing to their PC instead of opening the Chrome Web Store.
import { useMediaQuery } from "./scroll";

/** Narrow screens and touch-only devices (phones, tablets) get the PC handoff. */
export const HANDOFF_QUERY =
  "(max-width: 700px), (hover: none) and (pointer: coarse)";

export const useHandoff = () => useMediaQuery(HANDOFF_QUERY);

export type HandoffResult = "shared" | "copied" | "cancelled" | "failed";

type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

const SHARE_TITLE = "커리어폼 — PC에서 열어보기";
const SHARE_TEXT = "PC Chrome에서 열면 지원서 자동 기입을 바로 써볼 수 있어요.";

export const HANDOFF_MESSAGE: Record<HandoffResult, string> = {
  shared: "",
  cancelled: "",
  copied: "링크를 복사했어요. PC에서 붙여넣어 열어보세요.",
  failed: "공유하지 못했어요. 주소창의 링크를 복사해 주세요.",
};

/** The landing trial, whichever page the visitor shares from. */
export function handoffUrl(location: { origin: string }) {
  return `${location.origin}/#try`;
}

/** A mail draft to oneself; works in in-app browsers without a share sheet. */
export function handoffMailto(url: string) {
  const body = `${SHARE_TEXT}\n${url}`;
  return `mailto:?subject=${encodeURIComponent(SHARE_TITLE)}&body=${encodeURIComponent(body)}`;
}

export async function copyLink(
  url: string,
  nav: ShareNavigator,
): Promise<HandoffResult> {
  try {
    if (!nav.clipboard) return "failed";
    await nav.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * Opens the share sheet; when an in-app browser has none or refuses it, the
 * link is copied instead. Closing the sheet is not a failure.
 */
export async function sendToPc(
  url: string,
  nav: ShareNavigator,
): Promise<HandoffResult> {
  if (nav.share) {
    try {
      await nav.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return "cancelled";
    }
  }
  return copyLink(url, nav);
}
