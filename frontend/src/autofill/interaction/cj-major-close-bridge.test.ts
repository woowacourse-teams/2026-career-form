import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import {
  installCjMajorCloseBridge,
  prepareCjMajorClose,
} from "./cj-major-close-bridge";
import { SearchSession } from "./search-session";
import { SearchSurface } from "./search-surface";
import type { ExecuteReadonlySearchArgs } from "./readonly-search";
import {
  CJ_MAJOR_REQUEST_EVENT,
  CJ_MAJOR_ACK_EVENT,
  CJ_MAJOR_OPENER_MARKER,
} from "./cj-major-close-contract";

const session = {
  check() {},
  addCleanup() {},
  race: <T>(promise: Promise<T>) => promise,
} as unknown as SearchSession;

function documentAt(origin: string): Document {
  return new JSDOM(
    '<div id="sectionNormalUniversity0"><dd><input id="mm_major_nm2_0" name="mm_major_nm"><input type="hidden" name="major"><button type="button" name="bt_mm_major_nm" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_major.fo?num=2_0">전공 검색</button></dd></div><input type="hidden" name="major">',
    { url: origin },
  ).window.document;
}

// JSON preserves the exact reviewed function whitespace without source-data
// whitespace errors in the repository diff.
const reviewedSource = (
  JSON.parse(
    readFileSync(
      "src/autofill/interaction/test-utils/needPopup.reviewed.source.json",
      "utf8",
    ),
  ) as { source: string }
).source;

describe("CJ main major close lease", () => {
  it("arms the actual id-less first-row opener despite another row's hidden code", async () => {
    const dom = new JSDOM(
      '<div id="sectionNormalUniversity0"><dd><input id="mm_major_nm2_0" name="mm_major_nm"><input type="hidden" name="major"><button type="button" name="bt_mm_major_nm" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_major.fo?num=2_0">전공 검색</button></dd></div><div id="sectionNormalUniversity1"><input type="hidden" name="major"></div>',
      {
        url: "https://recruit.cj.net/recruit/ko/resume/write.fo",
        runScripts: "outside-only",
      },
    );
    dom.window.eval(reviewedSource);
    installCjMajorCloseBridge(dom.window.document);
    const opener =
      dom.window.document.querySelector<HTMLButtonElement>("button")!;
    const lease = await prepareCjMajorClose(opener, session);
    expect(lease).toHaveProperty("close");
    dom.window.close();
  });
  it("refuses a matching-looking opener outside the exact CJ origin", async () => {
    const doc = documentAt("https://other.example/recruit/ko/resume/write.fo");
    installCjMajorCloseBridge(doc);
    const opener = doc.querySelector<HTMLButtonElement>("button")!;
    await expect(prepareCjMajorClose(opener, session)).rejects.toMatchObject({
      reason: "unverified_search_form",
    });
  });

  it("refuses an opener for a different university row", async () => {
    const doc = documentAt("https://recruit.cj.net/recruit/ko/resume/write.fo");
    installCjMajorCloseBridge(doc);
    const opener = doc.querySelector<HTMLButtonElement>("button")!;
    opener.closest("div")!.id = "sectionNormalUniversity1";
    await expect(prepareCjMajorClose(opener, session)).rejects.toMatchObject({
      reason: "unverified_search_form",
    });
  });

  it("refuses a MAIN-world popup implementation without the reviewed source contract", async () => {
    const doc = documentAt("https://recruit.cj.net/recruit/ko/resume/write.fo");
    Object.assign(doc.defaultView!, {
      needPopup: {
        show() {},
        hide() {},
        config: {
          default: {
            removerPlace: "inside",
            closeOnOutside: true,
            onShow() {},
            onBeforeShow() {},
            onHide() {},
          },
        },
      },
    });
    installCjMajorCloseBridge(doc);
    const opener = doc.querySelector<HTMLButtonElement>("button")!;
    await expect(prepareCjMajorClose(opener, session)).rejects.toMatchObject({
      reason: "unverified_search_form",
    });
  });
});

const jquerySource = readFileSync(
  "src/autofill/interaction/test-utils/jquery-1.12.4.min.js.txt",
  "utf8",
);
const realSessions: SearchSession[] = [];
const realWindows: JSDOM[] = [];
function realSession(): SearchSession {
  const value = new SearchSession({} as ExecuteReadonlySearchArgs);
  realSessions.push(value);
  return value;
}
function liveFixture() {
  const dom = new JSDOM(
    '<div id="sectionNormalUniversity0"><dd><input id="mm_major_nm2_0" name="mm_major_nm"><input type="hidden" name="major"><button type="button" name="bt_mm_major_nm" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_major.fo?num=2_0">전공 검색</button></dd></div><div id="sectionNormalUniversity1"><input type="hidden" name="major"></div>',
    {
      url: "https://recruit.cj.net/recruit/ko/resume/write.fo",
      runScripts: "outside-only",
    },
  );
  realWindows.push(dom);
  dom.window.eval(jquerySource);
  dom.window.eval(reviewedSource);
  type Page = {
    $: ((node: Element) => unknown) & {
      fn: { tabkeyListener: () => { remove(): void } };
    };
    needPopup: {
      init(): void;
      show(target: string, trigger: unknown): void;
      hide(value: number): void;
      config: { default: Record<string, unknown> };
    };
  };
  const view = dom.window as unknown as Page;
  // The site's focus-loop plugin is outside the reviewed popup library.
  view.$.fn.tabkeyListener = () => ({ remove() {} });
  view.needPopup.init();
  const doc = dom.window.document;
  installCjMajorCloseBridge(doc);
  return {
    dom,
    doc,
    opener: doc.querySelector<HTMLButtonElement>("button")!,
    popup: view.needPopup,
    jq: view.$,
  };
}
async function liveOpen(f: ReturnType<typeof liveFixture>, s: SearchSession) {
  const lease = await prepareCjMajorClose(f.opener, s);
  f.popup.show("#unused-popup", f.jq(f.opener));
  await new Promise((resolve) => setTimeout(resolve, 25));
  const frame = f.doc.querySelector<HTMLIFrameElement>(
    "#popupIframe2 > .popup_inner > iframe",
  )!;
  const container = f.doc.querySelector<HTMLElement>("#popupIframe2")!;
  const target = f.doc.querySelector<HTMLInputElement>("#mm_major_nm2_0")!;
  const surface = new SearchSurface(
    "same-origin-iframe",
    container,
    frame.contentDocument!,
    f.opener,
    target,
    frame,
  );
  return { lease, surface, frame };
}
afterEach(() => {
  realSessions.splice(0).forEach((s) => s.stop());
  realWindows.splice(0).forEach((w) => w.window.close());
});

describe("reviewed public popup lifecycle", () => {
  it("checks and closes the id-less first-row popup while preserving another row", async () => {
    const f = liveFixture();
    const { lease, surface } = await liveOpen(f, realSession());
    expect(await lease.check(surface)).toBe(true);
    expect(await lease.close(surface)).toBe(true);
    expect(f.doc.querySelector("#popupIframe2, #popup_cls")).toBeNull();
    expect(
      f.doc.querySelector('#sectionNormalUniversity1 input[name="major"]'),
    ).not.toBeNull();
    await expect(lease.close(surface)).rejects.toMatchObject({
      reason: "surface_stale",
    });
  });

  it("rejects mutated hide method without running it or closing the popup", async () => {
    const f = liveFixture();
    const { lease, surface } = await liveOpen(f, realSession());
    f.popup.hide = () => {
      throw Error("must not run");
    };
    await expect(lease.close(surface)).rejects.toMatchObject({
      reason: "unverified_search_form",
    });
    expect(f.doc.querySelector("#popupIframe2")).not.toBeNull();
  });

  it("rejects a replaced no-op callback and custom popup options", async () => {
    const f = liveFixture();
    const { lease, surface } = await liveOpen(f, realSession());
    f.popup.config.default.onHide = () => {};
    await expect(lease.check(surface)).rejects.toMatchObject({
      reason: "unverified_search_form",
    });
    f.doc
      .querySelector("#popupIframe2")!
      .setAttribute("data-popup-options", "custom");
    await expect(lease.close(surface)).rejects.toMatchObject({
      reason: "surface_stale",
    });
  });

  it("rejects a duplicate iframe and stale frame identity", async () => {
    const f = liveFixture();
    const { lease, surface, frame } = await liveOpen(f, realSession());
    frame.parentElement!.append(frame.cloneNode());
    await expect(lease.close(surface)).rejects.toMatchObject({
      reason: "surface_stale",
    });
  });

  it("releases the marker at session stop and refuses nonce replay", async () => {
    const f = liveFixture();
    const s = realSession();
    await prepareCjMajorClose(f.opener, s);
    const nonce = f.opener.getAttribute(CJ_MAJOR_OPENER_MARKER)!;
    s.stop();
    expect(f.opener.hasAttribute(CJ_MAJOR_OPENER_MARKER)).toBe(false);
    f.opener.setAttribute(CJ_MAJOR_OPENER_MARKER, nonce);
    const replies: boolean[] = [];
    f.doc.addEventListener(CJ_MAJOR_ACK_EVENT, (event: Event) => {
      if ("detail" in event)
        replies.push(JSON.parse(event.detail as string).ok);
    });
    f.doc.dispatchEvent(
      new f.dom.window.CustomEvent(CJ_MAJOR_REQUEST_EVENT, {
        detail: JSON.stringify({ nonce, action: "arm" }),
      }),
    );
    expect(replies).toEqual([false]);
  });

  it("aborts before dispatch when the session was canceled", async () => {
    const f = liveFixture();
    const s = realSession();
    s.stop();
    await expect(prepareCjMajorClose(f.opener, s)).rejects.toMatchObject({
      reason: "aborted",
    });
    expect(f.opener.hasAttribute(CJ_MAJOR_OPENER_MARKER)).toBe(false);
  });
});

describe("close lease additional refusal boundaries", () => {
  it("rejects a mutated show method before arming", async () => {
    const f = liveFixture();
    f.popup.show = () => {};
    await expect(
      prepareCjMajorClose(f.opener, realSession()),
    ).rejects.toMatchObject({ reason: "unverified_search_form" });
  });

  it("rejects a duplicate opener or custom options before arming", async () => {
    const f = liveFixture();
    f.opener.after(f.opener.cloneNode(true));
    await expect(
      prepareCjMajorClose(f.opener, realSession()),
    ).rejects.toMatchObject({ reason: "unverified_search_form" });
    f.opener.nextElementSibling!.remove();
    f.opener.setAttribute("data-popup-options", "custom");
    await expect(
      prepareCjMajorClose(f.opener, realSession()),
    ).rejects.toMatchObject({ reason: "unverified_search_form" });
  });

  it("rejects a replaced frame and an unrelated opened popup", async () => {
    const f = liveFixture();
    const { lease, surface, frame } = await liveOpen(f, realSession());
    const extra = f.doc.createElement("div");
    extra.className = "popup opened";
    f.doc.body.append(extra);
    await expect(lease.check(surface)).rejects.toMatchObject({
      reason: "unverified_search_form",
    });
    expect(f.doc.querySelector("#popupIframe2")).not.toBeNull();
    extra.remove();
    frame.replaceWith(frame.cloneNode());
    await expect(lease.close(surface)).rejects.toMatchObject({
      reason: "surface_stale",
    });
    expect(f.doc.querySelector("#popupIframe2")).not.toBeNull();
  });
});

describe("unmodified opener boundary", () => {
  it("refuses inline handlers, form overrides and changed URL before any bridge request", async () => {
    const f = liveFixture();
    let requests = 0;
    f.doc.addEventListener(CJ_MAJOR_REQUEST_EVENT, () => requests++);
    const original = f.opener.getAttribute("data-iframe-url")!;
    for (const [attribute, value] of [
      ["onclick", "return false"],
      ["onmouseover", "this.click()"],
      ["formaction", "/other"],
      ["data-iframe-url", `${original}&extra=1`],
    ] as const) {
      f.opener.setAttribute(attribute, value);
      await expect(
        prepareCjMajorClose(f.opener, realSession()),
      ).rejects.toMatchObject({
        reason: "unverified_search_form",
      });
      expect(requests).toBe(0);
      expect(f.opener.hasAttribute(CJ_MAJOR_OPENER_MARKER)).toBe(false);
      if (attribute === "data-iframe-url")
        f.opener.setAttribute(attribute, original);
      else f.opener.removeAttribute(attribute);
    }
  });
});
