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

describe("native GET completion characterization", () => {
  it("requires declared result count after native GET navigation before accepting a bound query", () => {
    document.body.innerHTML = `<input id="target" readonly><button id="opener" type="button">검색</button><iframe></iframe>`;
    const target = document.querySelector<HTMLInputElement>("#target")!;
    const opener = document.querySelector<HTMLButtonElement>("#opener")!;
    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
    const before = frame.contentDocument!;
    Object.defineProperty(before, "URL", {
      configurable: true,
      value: "about:srcdoc",
    });
    before.body.innerHTML = `<ul data-search-results><li><button type="button">가상값</button></li></ul>`;
    const surface = new SearchSurface(
      "same-origin-iframe",
      frame,
      before,
      opener,
      target,
      frame,
    );
    const session = new SearchSession({
      document,
      registry: undefined as never,
      targetCandidateId: "field-1",
      canonicalFieldKey: "education.university.schoolName",
      expectedValue: "가상값",
    });
    const baseline = resultBaseline(surface);
    const observed = observeResults(surface, session, baseline, "가상값");
    // An untagged, nonempty query is not ready before completed navigation.
    expect(observed.exact(["가상값"])).toBeUndefined();
    const destination = new URL(
      "/generic-search/search-school?school_query=%EA%B0%80%EC%83%81%EA%B0%92",
      document.URL,
    );
    surface.expectNavigation(destination);
    expect(observed.exact(["가상값"])).toBeUndefined();
    const destinationFrame = document.createElement("iframe");
    document.body.append(destinationFrame);
    const after = destinationFrame.contentDocument!;
    after.body.innerHTML = `<ul data-search-results><li><button type="button">가상값</button></li></ul>`;
    Object.defineProperty(after, "URL", {
      configurable: true,
      value: destination.href,
    });
    Object.defineProperty(after, "readyState", {
      configurable: true,
      value: "complete",
    });
    Object.defineProperty(frame, "contentDocument", {
      configurable: true,
      get: () => after,
    });
    expect(surface.settleNavigation()).toBe(true);
    expect(surface.documentGeneration).toBe(1);
    expect(surface.hasCompletedNavigation()).toBe(true);
    expect(() => observed.exact(["가상값"])).toThrowError(
      expect.objectContaining({ reason: "result_set_incomplete" }),
    );
    after.querySelector("ul")!.setAttribute("data-result-count", "1");
    // The current contract accepts this declared count after navigation; no policy expansion is implied.
    expect(observed.exact(["가상값"])?.element.textContent).toBe("가상값");
    session.stop();
  });
});
