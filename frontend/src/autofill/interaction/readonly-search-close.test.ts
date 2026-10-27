import { afterEach, describe, expect, it } from "vitest";

import {
  closeModalOpenedBy,
  closeOwnedSurface,
} from "./readonly-search-executor";
import { SearchSurface } from "./search-surface";

let listeners = new AbortController();

afterEach(() => {
  listeners.abort();
  listeners = new AbortController();
  document.body.replaceChildren();
});

function onEscape(remove: string): () => number {
  let escapes = 0;
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      escapes++;
      // A modal library removes its dialog after a short leave transition.
      setTimeout(() => document.querySelector(remove)?.remove(), 50);
    },
    { signal: listeners.signal },
  );
  return () => escapes;
}

function modalSurface(): SearchSurface {
  document.body.innerHTML = `<div id="page"><input id="target" readonly><button id="opener" type="button">검색</button></div><div id="layer"><div id="dialog" role="dialog" aria-modal="true"><form><input type="text"><button type="submit">등록하기</button></form></div></div>`;
  const container = document.querySelector<HTMLElement>("#layer")!;
  return new SearchSurface(
    "same-document-layer",
    container,
    container,
    document.querySelector<HTMLElement>("#opener")!,
    document.querySelector<HTMLInputElement>("#target")!,
  );
}

describe("closing an owned search surface after a failure", () => {
  it("dismisses a modal without a close control by Escape and confirms closure", async () => {
    const surface = modalSurface();
    const escapes = onEscape("#layer");
    expect(await closeOwnedSurface(surface, false)).toBeUndefined();
    expect(escapes()).toBe(1);
    expect(surface.closure()).toBe("closed");
  });

  it("reports a modal that stays open after Escape", async () => {
    const surface = modalSurface();
    onEscape("#layer");
    document.addEventListener(
      "keydown",
      (event) => event.stopImmediatePropagation(),
      { capture: true, signal: listeners.signal },
    );
    expect(await closeOwnedSurface(surface, false)).toBe("close_not_confirmed");
    expect(surface.closure()).toBe("open");
  });

  it("never clicks a confirmation button to close the modal", async () => {
    const surface = modalSurface();
    onEscape("#layer");
    let confirmed = 0;
    document
      .querySelector("[type='submit']")!
      .addEventListener("click", () => confirmed++);
    await closeOwnedSurface(surface, false);
    expect(confirmed).toBe(0);
  });
});

describe("closing a modal the opener click opened without a detected surface", () => {
  function pageWithOldModal(): Set<Element> {
    document.body.innerHTML = `<div id="old" role="dialog" aria-modal="true"></div>`;
    return new Set(document.querySelectorAll("[role='dialog']"));
  }

  function openNewModal(): void {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="new" role="dialog" aria-modal="true"><input type="text"></div>',
    );
  }

  it("closes only the single modal that appeared after the click", async () => {
    const before = pageWithOldModal();
    openNewModal();
    onEscape("#new");
    expect(await closeModalOpenedBy(before, document)).toBeUndefined();
    expect(document.querySelector("#new")).toBeNull();
    expect(document.querySelector("#old")).not.toBeNull();
  });

  it("does not touch the page when the click opened no modal", async () => {
    const before = pageWithOldModal();
    const escapes = onEscape("#old");
    expect(await closeModalOpenedBy(before, document)).toBeUndefined();
    expect(escapes()).toBe(0);
  });

  it("leaves two new modals open and reports them", async () => {
    const before = pageWithOldModal();
    openNewModal();
    openNewModal();
    const escapes = onEscape("#new");
    expect(await closeModalOpenedBy(before, document)).toBe(
      "no_safe_close_control",
    );
    expect(escapes()).toBe(0);
  });
});
