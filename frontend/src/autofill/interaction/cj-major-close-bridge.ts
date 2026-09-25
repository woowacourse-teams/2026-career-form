import { SearchFailure, type SearchSession } from "./search-session";
import type { SearchSurface } from "./search-surface";
import {
  CJ_MAJOR_ACK_EVENT,
  CJ_MAJOR_HIDE_SOURCE,
  CJ_MAJOR_OPENER_MARKER,
  CJ_MAJOR_ORIGIN,
  CJ_MAJOR_REQUEST_EVENT,
  CJ_MAJOR_SHOW_SOURCE,
  parseMajorRequest,
  methodSource,
  reviewedMethod,
  validMajorOpener,
  validSchoolOpener,
} from "./cj-major-close-contract";

export interface CjMajorCloseLease {
  check(surface: SearchSurface): Promise<boolean>;
  close(surface: SearchSurface): Promise<boolean>;
}

type Popup = {
  show: unknown;
  hide: unknown;
  config?: { default?: Record<string, unknown> };
};
type Ack = { nonce: string; action: string; ok: boolean };
const installed = new WeakSet<Document>();
function dispatch(doc: Document, name: string, detail: string): void {
  const event = doc.createEvent("CustomEvent");
  event.initCustomEvent(name, false, false, detail);
  doc.dispatchEvent(event);
}

function popupContract(doc: Document): Popup | undefined {
  const view = doc.defaultView as (Window & { needPopup?: Popup }) | null;
  const popup = view?.needPopup;
  const config = popup?.config?.default;
  if (
    !popup ||
    !config ||
    Object.keys(popup.config!).join(',') !== 'default' ||
    !reviewedMethod(popup.show, CJ_MAJOR_SHOW_SOURCE) ||
    !reviewedMethod(popup.hide, CJ_MAJOR_HIDE_SOURCE) ||
    Object.keys(config).sort().join(",") !==
      "closeOnOutside,onBeforeShow,onHide,onShow,removerPlace" ||
    config.removerPlace !== "inside" ||
    config.closeOnOutside !== true ||
    [config.onShow, config.onBeforeShow, config.onHide].some(
      (callback) =>
        typeof callback !== "function" ||
        !/^function\s*\(\s*\)\s*\{\s*\}$/.test(methodSource(callback)),
    )
  )
    return;
  return popup;
}

function exactPopup(
  doc: Document,
  opener: HTMLElement,
  requireOpened: boolean,
): boolean {
  if (!validMajorOpener(opener) && !validSchoolOpener(opener)) return false;
  const wrappers = doc.querySelectorAll(".popup_wrapper");
  const popups = doc.querySelectorAll("#popupIframe2");
  const closes = doc.querySelectorAll("#popup_cls");
  if (
    wrappers.length !== 1 ||
    popups.length !== 1 ||
    closes.length !== 1 ||
    (requireOpened && doc.querySelectorAll(".popup.opened").length !== 1)
  )
    return false;
  const wrapper = wrappers[0]!;
  const popup = popups[0]!;
  const close = closes[0]!;
  if (
    wrapper.querySelectorAll(":scope > .popup").length !== 1 ||
    wrapper.querySelectorAll("iframe").length !== 1 ||
    doc.querySelectorAll(".popup_wrapper .popup").length !== 1 ||
    popup.parentElement !== wrapper ||
    !popup.matches("div.popup") ||
    (requireOpened && !popup.classList.contains("opened")) ||
    popup.querySelectorAll(":scope > .popup_inner > iframe").length !== 1 ||
    !close.matches('a.popup_cls[href="#"]') ||
    close.parentElement !== popup ||
    popup.hasAttribute("data-popup-options")
  )
    return false;
  const frame = popup.querySelector<HTMLIFrameElement>(
    ":scope > .popup_inner > iframe",
  );
  if (!frame) return false;
  try {
    const url = new URL(frame.getAttribute("src") ?? "", doc.URL);
    return (
      url.origin === CJ_MAJOR_ORIGIN &&
      url.pathname === (validMajorOpener(opener)
        ? "/recruit/ko/resume/search/search_major.fo"
        : "/recruit/ko/resume/search/search_university.fo") &&
      url.searchParams.size === 1 &&
      url.searchParams.get("num") === "2_0"
    );
  } catch {
    return false;
  }
}

// MAIN world: requests contain only a nonce and a fixed action, never callbacks,
// result links, application fields, or profile data.
export function installCjMajorCloseBridge(doc: Document): void {
  if (doc.location.origin !== CJ_MAJOR_ORIGIN || installed.has(doc)) return;
  installed.add(doc);
  const leases = new Map<
    string,
    {
      opener: HTMLElement;
      popup: Popup;
      show: unknown;
      hide: unknown;
      config: Record<string, unknown>;
      callbacks: unknown[];
      timer: number;
    }
  >();
  // Replay records outlive the 30s lease, but expire to avoid a lifetime cap
  // on independent searches in a long-lived application tab.
  const consumed = new Map<string, number>();
  const respond = (nonce: string, action: string, ok: boolean) => {
    dispatch(
      doc,
      CJ_MAJOR_ACK_EVENT,
      JSON.stringify({ nonce, action, ok } satisfies Ack),
    );
  };
  doc.addEventListener(CJ_MAJOR_REQUEST_EVENT, (event) => {
    const request = parseMajorRequest(event);
    if (!request) return;
    const { nonce, action } = request;
    if (action === "arm") {
      const now = Date.now();
      for (const [used, time] of consumed) {
        if (now - time > 5 * 60_000) consumed.delete(used);
      }
      if (leases.size || consumed.has(nonce) || consumed.size >= 4096) {
        respond(nonce, action, false);
        return;
      }
      const marked = doc.querySelectorAll<HTMLElement>(
        `[${CJ_MAJOR_OPENER_MARKER}]`,
      );
      const opener =
        marked.length === 1 &&
        marked[0]!.getAttribute(CJ_MAJOR_OPENER_MARKER) === nonce
          ? marked[0]
          : undefined;
      const popup = popupContract(doc);
      if (!opener || (!validMajorOpener(opener) && !validSchoolOpener(opener)) || !popup) {
        respond(nonce, action, false);
        return;
      }
      const config = popup.config!.default!;
      const callbacks = [config.onShow, config.onBeforeShow, config.onHide];
      const timer = doc.defaultView!.setTimeout(
        () => leases.delete(nonce),
        30_000,
      );
      consumed.set(nonce, now);
      leases.set(nonce, {
        opener,
        popup,
        show: popup.show,
        hide: popup.hide,
        config,
        callbacks,
        timer,
      });
      respond(nonce, action, true);
      return;
    }
    const lease = leases.get(nonce);
    if (!lease) {
      respond(nonce, action, false);
      return;
    }
    if (action === "release") {
      doc.defaultView!.clearTimeout(lease.timer);
      leases.delete(nonce);
      respond(nonce, action, true);
      return;
    }
    const live = popupContract(doc);
    const valid =
      live === lease.popup &&
      (validMajorOpener(lease.opener) || validSchoolOpener(lease.opener)) &&
      lease.opener.getAttribute(CJ_MAJOR_OPENER_MARKER) === nonce &&
      live.show === lease.show &&
      live.hide === lease.hide &&
      live.config?.default === lease.config &&
      [
        lease.config.onShow,
        lease.config.onBeforeShow,
        lease.config.onHide,
      ].every((fn, i) => fn === lease.callbacks[i]) &&
      exactPopup(doc, lease.opener, true);
    if (!valid) {
      respond(nonce, action, false);
      return;
    }
    if (action === "check") {
      respond(nonce, action, true);
      return;
    }
    leases.delete(nonce);
    doc.defaultView!.clearTimeout(lease.timer);
    try {
      // The audited hide(0) resets the library's private target, scroll,
      // focus, owned iframe, and close control; DOM removal alone does not.
      (live.hide as (value: number) => void)(0);
      respond(
        nonce,
        action,
        doc.querySelector("#popupIframe2, #popup_cls") === null,
      );
    } catch {
      respond(nonce, action, false);
    }
  });
}

function invoke(
  doc: Document,
  nonce: string,
  action: "arm" | "check" | "close",
  session: SearchSession,
): Promise<boolean> {
  const pending = new Promise<boolean>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      doc.removeEventListener(CJ_MAJOR_ACK_EVENT, ack);
    };
    const ack = (event: Event) => {
      if (!("detail" in event) || typeof event.detail !== "string") return;
      let result: Partial<Ack>;
      try {
        result = JSON.parse(event.detail) as Partial<Ack>;
      } catch {
        return;
      }
      if (
        result.nonce !== nonce ||
        result.action !== action ||
        typeof result.ok !== "boolean"
      )
        return;
      cleanup();
      if (result.ok) resolve(true);
      else reject(new SearchFailure("unverified_search_form"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new SearchFailure("unverified_search_form"));
    }, 1_000);
    session.addCleanup(cleanup);
    doc.addEventListener(CJ_MAJOR_ACK_EVENT, ack);
    dispatch(doc, CJ_MAJOR_REQUEST_EVENT, JSON.stringify({ nonce, action }));
  });
  return session.race(pending, 1_500);
}

// Must run before opener.click(): captures the reviewed popup methods/config
// while the page has not yet created or replaced its target.
export async function prepareCjMajorClose(
  opener: HTMLElement,
  session: SearchSession,
): Promise<CjMajorCloseLease> {
  return prepareCjClose(opener, session, validMajorOpener);
}

export async function prepareCjSchoolClose(
  opener: HTMLElement,
  session: SearchSession,
): Promise<CjMajorCloseLease> {
  return prepareCjClose(opener, session, validSchoolOpener);
}

async function prepareCjClose(
  opener: HTMLElement,
  session: SearchSession,
  validOpener: (element: Element) => boolean,
): Promise<CjMajorCloseLease> {
  session.check();
  if (!validOpener(opener) || opener.hasAttribute(CJ_MAJOR_OPENER_MARKER))
    throw new SearchFailure("unverified_search_form");
  const doc = opener.ownerDocument;
  const nonce = crypto.randomUUID();
  opener.setAttribute(CJ_MAJOR_OPENER_MARKER, nonce);
  const release = () => {
    if (opener.getAttribute(CJ_MAJOR_OPENER_MARKER) === nonce)
      opener.removeAttribute(CJ_MAJOR_OPENER_MARKER);
    dispatch(
      doc,
      CJ_MAJOR_REQUEST_EVENT,
      JSON.stringify({ nonce, action: "release" }),
    );
  };
  try {
    await invoke(doc, nonce, "arm", session);
  } catch (error) {
    release();
    throw error;
  }
  session.addCleanup(release);
  const guard = (surface: SearchSurface) => {
    session.check();
    if (
      surface.opener !== opener ||
      surface.kind !== "same-origin-iframe" ||
      !surface.frame ||
      !exactPopup(doc, opener, false) ||
      surface.frame !==
        doc.querySelector("#popupIframe2 > .popup_inner > iframe")
    )
      throw new SearchFailure("surface_stale");
  };
  return {
    async check(surface) {
      guard(surface);
      return invoke(doc, nonce, "check", session);
    },
    async close(surface) {
      guard(surface);
      return invoke(doc, nonce, "close", session);
    },
  };
}
