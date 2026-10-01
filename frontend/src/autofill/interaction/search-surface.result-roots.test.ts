import { afterEach, describe, expect, it } from "vitest";

import { SearchSurface } from "./search-surface";

function layer(markup: string) {
  document.body.innerHTML = `<button id="opener" type="button">검색</button><input id="target" readonly><div id="layer"><h4>학교명 조회</h4><input type="text"><button type="button">검색</button>${markup}</div>`;
  const container = document.querySelector<HTMLElement>("#layer")!;
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

describe("resultRoots() for a role-less layer (T1-7, T1-8)", () => {
  it("accepts the initially empty result list and not the zero-result notice", () => {
    const surface = layer(
      '<div><p>검색 결과가 없습니다.</p><ul class="list"></ul></div>',
    );
    expect(surface.resultRoots()).toEqual([document.querySelector("ul.list")]);
  });

  it("keeps the list after the zero-result notice is hidden", () => {
    const surface = layer(
      '<div><p>검색 결과가 없습니다.</p><ul class="list"></ul></div>',
    );
    document.querySelector<HTMLElement>("p")!.hidden = true;
    expect(surface.resultRoots()).toEqual([document.querySelector("ul.list")]);
  });
});
