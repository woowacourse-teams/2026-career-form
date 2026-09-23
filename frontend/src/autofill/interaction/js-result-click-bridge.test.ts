import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  clickVerifiedJsResult,
  installVerifiedJsResultClickBridge,
  JS_RESULT_REQUEST_EVENT,
  JS_RESULT_TARGET_ATTRIBUTE,
} from "./js-result-click-bridge";
import type { SearchSession } from "./search-session";

const session = {
  race: <T>(promise: Promise<T>) => promise,
} as SearchSession;
const nonce = "12345678-1234-1234-1234-123456789abc";

function link(href = "javascript:chooseRegion('ST||서울특별시||KOR');") {
  document.body.innerHTML = `<a href="${href}">서울특별시</a>`;
  return document.querySelector<HTMLAnchorElement>("a")!;
}

beforeAll(() => installVerifiedJsResultClickBridge(document));
afterEach(() => {
  document.body.innerHTML = "";
});

describe("verified JavaScript result click bridge", () => {
  it("acknowledges and clicks only the exact original link once", async () => {
    const anchor = link();
    let clicks = 0;
    anchor.addEventListener("click", (event) => {
      clicks++;
      event.preventDefault();
    });
    expect(await clickVerifiedJsResult(anchor, session)).toBe(true);
    expect(clicks).toBe(1);
    expect(anchor.hasAttribute(JS_RESULT_TARGET_ATTRIBUTE)).toBe(false);
  });

  it("rejects a script that includes a second statement", async () => {
    const anchor = link(
      "javascript:chooseRegion('ST||서울특별시||KOR');alert(1)",
    );
    let clicks = 0;
    anchor.addEventListener("click", () => clicks++);
    expect(await clickVerifiedJsResult(anchor, session)).toBe(false);
    expect(clicks).toBe(0);
  });

  it("refuses a changed href even when the marker and label match", () => {
    const anchor = link();
    let clicks = 0;
    anchor.addEventListener("click", () => clicks++);
    anchor.setAttribute(JS_RESULT_TARGET_ATTRIBUTE, nonce);
    document.dispatchEvent(
      new CustomEvent(JS_RESULT_REQUEST_EVENT, {
        detail: JSON.stringify({
          nonce,
          href: "javascript:chooseRegion('ST||경기도||KOR');",
          label: "서울특별시",
        }),
      }),
    );
    expect(clicks).toBe(0);
  });

  it("refuses ambiguous marked links", () => {
    const first = link();
    const second = first.cloneNode(true) as HTMLAnchorElement;
    document.body.append(second);
    let clicks = 0;
    first.addEventListener("click", () => clicks++);
    second.addEventListener("click", () => clicks++);
    first.setAttribute(JS_RESULT_TARGET_ATTRIBUTE, nonce);
    second.setAttribute(JS_RESULT_TARGET_ATTRIBUTE, nonce);
    document.dispatchEvent(
      new CustomEvent(JS_RESULT_REQUEST_EVENT, {
        detail: JSON.stringify({
          nonce,
          href: first.getAttribute("href"),
          label: "서울특별시",
        }),
      }),
    );
    expect(clicks).toBe(0);
  });
});
