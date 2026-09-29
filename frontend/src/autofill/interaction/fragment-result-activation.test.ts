import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { observeResults, resultBaseline } from "./search-results";
import { SearchSurface } from "./search-surface";
import { safeActivation } from "./search-surface-dom";
import { SearchSession } from "./search-session";

const VALUE = "<학교명>";
const PAGE_URL = "https://careers.example.test/apply?step=1";

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

function setup(
  anchorAttributes = 'href="#n" onclick="return true;"',
  text = VALUE,
) {
  document.body.innerHTML = `<div id="layer"><h4>학교명 조회</h4><ul id="results"><li><a ${anchorAttributes}>${text}</a></li></ul><form><a id="outside" href="#n" onclick="return true;">${VALUE}</a></form></div>`;
  return {
    root: document.querySelector<HTMLElement>("#results")!,
    link: document.querySelector<HTMLAnchorElement>("#results a")!,
  };
}

beforeEach(() => setPageUrl(PAGE_URL));
afterEach(() => {
  document.body.replaceChildren();
  setPageUrl(PAGE_URL);
});

describe("fragment result link activation (C10)", () => {
  it("accepts the owned exact fragment link with one onclick", () => {
    const { root, link } = setup();
    expect(
      safeActivation(link, [VALUE], {
        resultRoot: root,
        surfaceKind: "same-document-layer",
      }),
    ).toBe(true);
  });

  it.each([
    ["no scope", 'href="#n" onclick="return true;"', undefined],
    [
      "iframe surface",
      'href="#n" onclick="return true;"',
      "same-origin-iframe",
    ],
    ["listbox surface", 'href="#n" onclick="return true;"', "inline-listbox"],
    ["no handler", 'href="#n"', "same-document-layer"],
    [
      "two handlers",
      'href="#n" onclick="return true;" onmousedown="x()"',
      "same-document-layer",
    ],
    ["other handler", 'href="#n" onmouseup="x()"', "same-document-layer"],
    [
      "other path",
      'href="/other#n" onclick="return true;"',
      "same-document-layer",
    ],
    [
      "other query",
      'href="?step=2#n" onclick="return true;"',
      "same-document-layer",
    ],
    [
      "other origin",
      'href="https://other.example.test/apply?step=1#n" onclick="return true;"',
      "same-document-layer",
    ],
    [
      "download",
      'href="#n" onclick="return true;" download',
      "same-document-layer",
    ],
    [
      "new window",
      'href="#n" onclick="return true;" target="_blank"',
      "same-document-layer",
    ],
  ] as const)("rejects %s", (_name, attributes, surfaceKind) => {
    const { root, link } = setup(attributes);
    const scope = surfaceKind ? { resultRoot: root, surfaceKind } : undefined;
    expect(safeActivation(link, [VALUE], scope)).toBe(false);
  });

  it("rejects text mismatches, high-risk wording, links outside the root and in a form", () => {
    const mismatch = setup(undefined, "<다른학교>");
    const scope = {
      resultRoot: mismatch.root,
      surfaceKind: "same-document-layer",
    } as const;
    expect(safeActivation(mismatch.link, [VALUE], scope)).toBe(false);

    const risky = setup(undefined, "삭제");
    expect(
      safeActivation(risky.link, ["삭제"], {
        resultRoot: risky.root,
        surfaceKind: "same-document-layer",
      }),
    ).toBe(false);

    const { root } = setup();
    const outside = document.querySelector<HTMLAnchorElement>("#outside")!;
    expect(
      safeActivation(outside, [VALUE], {
        resultRoot: document.querySelector("#layer")!,
        surfaceKind: "same-document-layer",
      }),
    ).toBe(false);
    expect(
      safeActivation(outside, [VALUE], {
        resultRoot: root,
        surfaceKind: "same-document-layer",
      }),
    ).toBe(false);
  });

  it("accepts an owned link when the application form encloses the whole layer", () => {
    document.body.innerHTML = `<form action="/apply/save"><div id="layer"><ul id="results"><li><a href="#n" onclick="return true;">${VALUE}</a></li></ul></div></form>`;
    const root = document.querySelector<HTMLElement>("#results")!;
    const link = root.querySelector<HTMLAnchorElement>("a")!;
    expect(
      safeActivation(link, [VALUE], {
        resultRoot: root,
        surfaceKind: "same-document-layer",
      }),
    ).toBe(true);

    document.body.innerHTML = `<div id="layer"><ul id="results"><li><form><a href="#n" onclick="return true;">${VALUE}</a></form></li></ul></div>`;
    const inner = document.querySelector<HTMLElement>("#results")!;
    expect(
      safeActivation(inner.querySelector("a")!, [VALUE], {
        resultRoot: inner,
        surfaceKind: "same-document-layer",
      }),
    ).toBe(false);
  });

  it("never offers the zero notice, manual input or confirm button as results", () => {
    document.body.innerHTML = `<div id="layer"><h4>학교명 조회</h4><h5>검색 결과</h5><ul data-search-query="${VALUE}" data-search-complete="true"><li><a href="#n" onclick="return true;">${VALUE}</a></li></ul><p>검색 결과가 없습니다.</p><button type="button">직접입력</button><input type="text" placeholder="학교명 직접입력"><button type="button">확인</button></div>`;
    const container = document.querySelector<HTMLElement>("#layer")!;
    const surface = new SearchSurface(
      "same-document-layer",
      container,
      container,
      container,
      document.createElement("input"),
    );
    const session = new SearchSession({
      document,
      registry: undefined as never,
      targetCandidateId: "field-1",
      canonicalFieldKey: "education.university.schoolName",
      expectedValue: VALUE,
    });
    try {
      const result = observeResults(
        surface,
        session,
        resultBaseline(surface),
        VALUE,
      ).exact([VALUE]);
      expect(result?.element).toBe(container.querySelector("ul a"));
    } finally {
      session.stop();
    }
  });
});
