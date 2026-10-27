import { afterEach, describe, expect, it } from "vitest";

import { closeOwnedSurface } from "./readonly-search-executor";
import { SearchSurface } from "./search-surface";

function modalSurface(closeButton: string): {
  surface: SearchSurface;
  escapes: () => number;
} {
  document.body.innerHTML = `<div id="page"><input id="target" readonly><button id="opener" type="button">검색</button></div><div id="layer"><div id="dialog" role="dialog" aria-modal="true"><form><input type="text"><button type="submit">등록하기</button></form>${closeButton}</div></div>`;
  let escapes = 0;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    escapes++;
    // A modal library removes its dialog after a short leave transition.
    setTimeout(() => document.querySelector("#layer")?.remove(), 50);
  });
  const container = document.querySelector<HTMLElement>("#layer")!;
  return {
    surface: new SearchSurface(
      "same-document-layer",
      container,
      container,
      document.querySelector<HTMLElement>("#opener")!,
      document.querySelector<HTMLInputElement>("#target")!,
    ),
    escapes: () => escapes,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("closing an owned search surface after a failure", () => {
  it("dismisses a modal without a close control by Escape and confirms closure", async () => {
    const { surface, escapes } = modalSurface("");
    expect(await closeOwnedSurface(surface, false)).toBeUndefined();
    expect(escapes()).toBe(1);
    expect(surface.closure()).toBe("closed");
  });

  it("reports a modal that stays open after Escape", async () => {
    const { surface } = modalSurface("");
    document.addEventListener(
      "keydown",
      (event) => event.stopImmediatePropagation(),
      { capture: true },
    );
    expect(await closeOwnedSurface(surface, false)).toBe("close_not_confirmed");
    expect(surface.closure()).toBe("open");
  });

  it("never clicks a confirmation button to close the modal", async () => {
    const { surface } = modalSurface("");
    let confirmed = 0;
    document
      .querySelector("[type='submit']")!
      .addEventListener("click", () => confirmed++);
    await closeOwnedSurface(surface, false);
    expect(confirmed).toBe(0);
  });
});
