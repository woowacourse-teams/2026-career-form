import { afterEach, describe, expect, it } from "vitest";

import { SearchSurface } from "./search-surface";

function surface(resultMarkup: string, allowUnlabelledResultRoot = false) {
  document.body.innerHTML = `<button id="opener" type="button">검색</button><input id="target" readonly><section id="layer"><h4>시험종류검색</h4><input type="text"><button type="button">검색</button>${resultMarkup}</section>`;
  const container = document.querySelector<HTMLElement>("#layer")!;
  return new SearchSurface(
    "same-document-layer",
    container,
    container,
    document.querySelector<HTMLElement>("#opener")!,
    document.querySelector<HTMLInputElement>("#target")!,
    undefined,
    ...(allowUnlabelledResultRoot ? [{ allowUnlabelledResultRoot: true }] : []),
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("unlabelled result roots for generic popup recovery", () => {
  it("accepts the only unlabelled list through a wrapper without a semantic preceding sibling when enabled", () => {
    const searchSurface = surface("<div><ul></ul></div>", true);

    expect(searchSurface.resultRoots()).toEqual([document.querySelector("ul")]);
  });

  it("keeps the default rejection for an unlabelled list", () => {
    const searchSurface = surface("<div><ul></ul></div>");

    expect(searchSurface.resultRoots()).toEqual([]);
  });

  it("rejects multiple unlabelled lists even when enabled", () => {
    const searchSurface = surface("<div><ul></ul><ul></ul></div>", true);

    expect(searchSurface.resultRoots()).toEqual([]);
  });
});
