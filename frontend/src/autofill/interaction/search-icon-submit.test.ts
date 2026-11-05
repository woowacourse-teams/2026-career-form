import { afterEach, describe, expect, it } from "vitest";

import { clickSubmitHandledByPage } from "./readonly-search-executor";
import { searchDestination, submitControls } from "./search-controls";
import { SearchFailure } from "./search-session";
import { SearchSurface } from "./search-surface";

let listeners = new AbortController();

afterEach(() => {
  listeners.abort();
  listeners = new AbortController();
  document.body.replaceChildren();
});

function modalForm(extra = ""): {
  surface: SearchSurface;
  query: HTMLInputElement;
  icon: HTMLButtonElement;
} {
  document.body.innerHTML = `<div id="page"><input id="target" readonly><button id="opener" type="button">검색</button></div><div id="layer"><div role="dialog" aria-modal="true"><form><div class="field"><input id="query" type="text"><button id="icon"><svg viewBox="0 0 20 20"><path d="M1 1"></path></svg></button></div><ul></ul><button id="confirm" type="submit">등록하기</button>${extra}</form></div></div>`;
  const container = document.querySelector<HTMLElement>("#layer")!;
  return {
    surface: new SearchSurface(
      "same-document-layer",
      container,
      container,
      document.querySelector<HTMLElement>("#opener")!,
      document.querySelector<HTMLInputElement>("#target")!,
    ),
    query: document.querySelector<HTMLInputElement>("#query")!,
    icon: document.querySelector<HTMLButtonElement>("#icon")!,
  };
}

describe("icon-only submit beside a modal search query", () => {
  it("is the only search submit candidate, never the labelled confirmation", () => {
    const { surface, icon } = modalForm();
    expect(submitControls(surface)).toEqual([icon]);
  });

  it("is not a candidate when it shares its wrapper with a second text input", () => {
    const { surface, icon } = modalForm();
    icon.parentElement!.insertAdjacentHTML("afterbegin", '<input type="text">');
    expect(submitControls(surface)).toEqual([]);
  });

  it("binds no native navigation for the page-handled form", () => {
    const { surface, query, icon } = modalForm();
    expect(searchDestination(surface, query, icon)).toBeUndefined();
  });

  it("lets a page submit handler run and keeps the page in place", () => {
    const { icon } = modalForm();
    let handled = 0;
    document.addEventListener(
      "submit",
      (event) => {
        handled++;
        event.preventDefault();
      },
      { signal: listeners.signal },
    );
    expect(() => clickSubmitHandledByPage(icon)).not.toThrow();
    expect(handled).toBe(1);
  });

  it("cancels a submit no page handler takes and fails closed", () => {
    const { icon } = modalForm();
    let submitted: Event | undefined;
    document.addEventListener(
      "submit",
      (event) => {
        submitted = event;
      },
      { signal: listeners.signal },
    );
    expect(() => clickSubmitHandledByPage(icon)).toThrow(SearchFailure);
    expect(submitted?.defaultPrevented).toBe(true);
  });
});
