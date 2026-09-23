import { afterEach, describe, expect, it } from "vitest";
import { SearchSession } from "./search-session";
import { resultBaseline, observeResults } from "./search-results";
import { SearchSurface } from "./search-surface";

function setup(rootMarkup: string) {
  document.body.innerHTML = `<button id="opener" type="button">검색</button><input id="target" readonly><div id="surface" role="dialog" aria-modal="true">${rootMarkup}</div>`;
  const container = document.querySelector<HTMLElement>("#surface")!;
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const surface = new SearchSurface(
    "same-document-dialog",
    container,
    container,
    opener,
    target,
  );
  const session = new SearchSession({
    document,
    registry: undefined as never,
    targetCandidateId: "field-1",
    canonicalFieldKey: "education.university.schoolName",
    expectedValue: "가상값",
  });
  return {
    surface,
    session,
    root: container.querySelector<HTMLElement>("[data-search-results]")!,
  };
}

function resultRoot(extra = "") {
  return `<ul data-search-results data-search-query="가상값" data-search-complete="true" data-result-count="1" ${extra}><li><button type="button">가상값</button></li></ul>`;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("search result completeness and exactness", () => {
  it("returns one exact result only after complete current-query evidence", () => {
    const { surface, session } = setup(resultRoot());
    const observed = observeResults(
      surface,
      session,
      resultBaseline(surface),
      "가상값",
    );
    expect(observed.exact(["가상값"])?.element.textContent).toBe("가상값");
    session.stop();
  });

  it("rejects pending and incomplete result sets", () => {
    const pending = setup(resultRoot('aria-busy="true"'));
    const pendingObserved = observeResults(
      pending.surface,
      pending.session,
      [],
      "가상값",
    );
    expect(pendingObserved.exact(["가상값"])).toBeUndefined();
    pending.session.stop();

    const incomplete = setup(
      `<ul data-search-results data-search-query="가상값"><li><button type="button">가상값</button></li></ul>`,
    );
    const incompleteObserved = observeResults(
      incomplete.surface,
      incomplete.session,
      [],
      "가상값",
    );
    expect(incompleteObserved.exact(["가상값"])).toBeUndefined();
    incomplete.session.stop();
  });

  it("rejects pagination, virtualized, and count-mismatched result sets", () => {
    for (const marker of ['data-has-more="true"', 'data-virtualized="true"']) {
      const test = setup(resultRoot(marker));
      const observed = observeResults(test.surface, test.session, [], "가상값");
      expect(() => observed.exact(["가상값"])).toThrowError(
        expect.objectContaining({ reason: "result_set_incomplete" }),
      );
      test.session.stop();
    }
    const countMismatch = setup(
      `<ul data-search-results data-search-query="가상값" data-search-complete="true" data-result-count="2"><button type="button">가상값</button></ul>`,
    );
    const countObserved = observeResults(
      countMismatch.surface,
      countMismatch.session,
      [],
      "가상값",
    );
    expect(() => countObserved.exact(["가상값"])).toThrowError(
      expect.objectContaining({ reason: "result_set_incomplete" }),
    );
    countMismatch.session.stop();
  });

  it("rejects duplicates, missing matches, unsafe activations, and stale results", () => {
    const duplicate = setup(
      `<ul data-search-results data-search-query="가상값" data-search-complete="true" data-result-count="2"><button type="button">가상값</button><button type="button">가상값</button></ul>`,
    );
    const duplicateObserved = observeResults(
      duplicate.surface,
      duplicate.session,
      [],
      "가상값",
    );
    expect(() => duplicateObserved.exact(["가상값"])).toThrowError(
      expect.objectContaining({ reason: "multiple_matching_results" }),
    );
    duplicate.session.stop();

    const missing = setup(resultRoot());
    const missingObserved = observeResults(
      missing.surface,
      missing.session,
      [],
      "다른값",
    );
    expect(missingObserved.exact(["다른값"])).toBeUndefined();
    missing.session.stop();
  });
});
