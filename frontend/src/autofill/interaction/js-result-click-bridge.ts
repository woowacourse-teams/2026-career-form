import { safeActivation } from "./search-surface-dom";
import type { SearchSession } from "./search-session";
import { claimMainWorldBridge } from "./main-world-bridge-claim";
import { debugWarn } from "../debug/autofill-debug";

/** Synchronous probe: DOM event dispatch is synchronous across worlds. */
export function verifiedJsResultBridgePresent(doc: Document): boolean {
  let present = false;
  const handlePong = () => {
    present = true;
  };
  doc.addEventListener(JS_RESULT_PONG_EVENT, handlePong);
  try {
    doc.dispatchEvent(new Event(JS_RESULT_PING_EVENT));
  } finally {
    doc.removeEventListener(JS_RESULT_PONG_EVENT, handlePong);
  }
  return present;
}

export const JS_RESULT_REQUEST_EVENT = "career-form:verified-js-result-request";
export const JS_RESULT_ACK_EVENT = "career-form:verified-js-result-ack";
export const JS_RESULT_TARGET_ATTRIBUTE = "data-career-form-verified-js-result";
/** Presence probe only: carries no data and never triggers a click. */
export const JS_RESULT_PING_EVENT = "career-form:verified-js-result-ping";
export const JS_RESULT_PONG_EVENT = "career-form:verified-js-result-pong";

interface ClickRequest {
  nonce: string;
  href: string;
  label: string;
}

function normalize(text: string | null): string {
  return (text ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function parseRequest(event: Event): ClickRequest | undefined {
  if (!("detail" in event) || typeof event.detail !== "string")
    return undefined;
  try {
    const value: unknown = JSON.parse(event.detail);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return undefined;
    const request = value as Partial<ClickRequest>;
    return typeof request.nonce === "string" &&
      /^[a-f0-9-]{36}$/.test(request.nonce) &&
      typeof request.href === "string" &&
      request.href.length < 1_024 &&
      typeof request.label === "string" &&
      request.label.length < 256
      ? (request as ClickRequest)
      : undefined;
  } catch {
    return undefined;
  }
}

// Runs in the page's MAIN world. It clicks only the exact, already-marked link;
// it never evaluates an href string or invokes a site's function directly.
export function installVerifiedJsResultClickBridge(doc: Document): void {
  if (!claimMainWorldBridge(doc, "verified-js-result")) return;
  doc.addEventListener(JS_RESULT_PING_EVENT, () => {
    doc.dispatchEvent(new Event(JS_RESULT_PONG_EVENT));
  });
  const consumed = new Set<string>();
  doc.addEventListener(JS_RESULT_REQUEST_EVENT, (event) => {
    const request = parseRequest(event);
    if (!request || consumed.has(request.nonce)) return;
    const matches = Array.from(
      doc.querySelectorAll<HTMLAnchorElement>(
        `a[${JS_RESULT_TARGET_ATTRIBUTE}]`,
      ),
    ).filter(
      (link) => link.getAttribute(JS_RESULT_TARGET_ATTRIBUTE) === request.nonce,
    );
    if (matches.length !== 1) return;
    const link = matches[0]!;
    if (
      !link.isConnected ||
      link.getAttribute("href") !== request.href ||
      normalize(link.textContent) !== request.label ||
      !safeActivation(link, [request.label])
    )
      return;
    const view = doc.defaultView;
    if (!view) return;
    consumed.add(request.nonce);
    view.setTimeout(() => {
      if (
        !link.isConnected ||
        link.getAttribute(JS_RESULT_TARGET_ATTRIBUTE) !== request.nonce ||
        link.getAttribute("href") !== request.href ||
        normalize(link.textContent) !== request.label ||
        !safeActivation(link, [request.label])
      )
        return;
      doc.dispatchEvent(
        new CustomEvent(JS_RESULT_ACK_EVENT, { detail: request.nonce }),
      );
      link.click();
    }, 0);
  });
}

// Runs in the isolated extension world after the full result-list and row guards.
export async function clickVerifiedJsResult(
  link: HTMLAnchorElement,
  session: SearchSession,
): Promise<boolean> {
  const doc = link.ownerDocument;
  const href = link.getAttribute("href");
  const label = normalize(link.textContent);
  const precheck = !href
    ? "href 없음"
    : !/^javascript:/i.test(href)
      ? "javascript: href 아님"
      : !safeActivation(link, [label])
        ? "safeActivation 거부"
        : link.hasAttribute(JS_RESULT_TARGET_ATTRIBUTE)
          ? "이전 요청 marker가 남아 있음"
          : undefined;
  if (precheck || !href) {
    debugWarn(`결과 클릭 사전 검사 실패: ${precheck}`, { link, href, label });
    return false;
  }
  if (!verifiedJsResultBridgePresent(doc)) {
    debugWarn(
      "결과 클릭 브리지 없음: 이 문서에 MAIN-world 브리지가 설치되지 않았습니다",
      { documentUrl: doc.URL, href, label },
    );
    return false;
  }
  const nonce = crypto.randomUUID();
  link.setAttribute(JS_RESULT_TARGET_ATTRIBUTE, nonce);
  try {
    const acknowledged = new Promise<boolean>((resolve) => {
      const handleAck = (event: Event) => {
        if (!("detail" in event) || event.detail !== nonce) return;
        cleanup();
        resolve(true);
      };
      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 1_000);
      const cleanup = () => {
        clearTimeout(timeout);
        doc.removeEventListener(JS_RESULT_ACK_EVENT, handleAck);
      };
      doc.addEventListener(JS_RESULT_ACK_EVENT, handleAck);
      doc.dispatchEvent(
        new CustomEvent(JS_RESULT_REQUEST_EVENT, {
          detail: JSON.stringify({ nonce, href, label } satisfies ClickRequest),
        }),
      );
    });
    const ok = await session.race(acknowledged, 1_500);
    if (!ok)
      debugWarn(
        "결과 클릭 ack 없음: 브리지는 있지만 MAIN-world 검증에서 거부되었거나 1초 안에 응답하지 않았습니다",
        { documentUrl: doc.URL, href, label },
      );
    return ok;
  } finally {
    if (link.getAttribute(JS_RESULT_TARGET_ATTRIBUTE) === nonce) {
      link.removeAttribute(JS_RESULT_TARGET_ATTRIBUTE);
    }
  }
}
