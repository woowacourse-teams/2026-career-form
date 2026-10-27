import { afterEach, describe, expect, it } from "vitest";

import { SearchSurface } from "./search-surface";

function surfaceInside(dialogAttributes: string) {
  document.body.innerHTML = `<div id="page"><input id="target" readonly><button id="opener" type="button">검색</button></div><div ${dialogAttributes}><div id="panel"><input type="text"><button type="button">검색</button></div></div>`;
  const container = document.querySelector<HTMLElement>("#panel")!;
  return new SearchSurface(
    "same-document-layer",
    container,
    container,
    document.querySelector<HTMLElement>("#opener")!,
    document.querySelector<HTMLInputElement>("#target")!,
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("search surface modal ownership", () => {
  it("reports the open modal that contains the surface panel", () => {
    const surface = surfaceInside(
      'id="dialog" role="dialog" aria-modal="true"',
    );
    expect(surface.modal).toBe(document.querySelector("#dialog"));
  });

  it("reports no modal for a panel inside a non-modal dialog", () => {
    const surface = surfaceInside('id="dialog" role="dialog"');
    expect(surface.modal).toBeUndefined();
  });
});
