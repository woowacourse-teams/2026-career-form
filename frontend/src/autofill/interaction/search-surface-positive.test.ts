import { afterEach, describe, expect, it } from "vitest";
import { SearchSession } from "./search-session";
import { resultBaseline, observeResults } from "./search-results";
import { SearchSurface, type SearchSurfaceKind } from "./search-surface";

type SurfaceFixture = {
  kind: SearchSurfaceKind;
  container: HTMLElement;
  root: Document | HTMLElement;
};

function resultMarkup(root: Document | HTMLElement): void {
  const owner = root instanceof Document ? root : root.ownerDocument;
  const scope = owner.createElement("ul");
  scope.setAttribute("data-search-results", "true");
  scope.setAttribute("data-search-query", "가상값");
  scope.setAttribute("data-search-complete", "true");
  scope.setAttribute("data-result-count", "1");
  const item = owner.createElement("button");
  item.type = "button";
  item.textContent = "가상값";
  scope.append(item);
  if (root instanceof Document) root.body.append(scope);
  else root.append(scope);
}

function fixture(kind: SearchSurfaceKind): SurfaceFixture {
  const container = document.createElement("div");
  const opener = document.createElement("button");
  opener.type = "button";
  const target = document.createElement("input");
  target.readOnly = true;
  document.body.append(opener, target, container);

  if (kind === "same-origin-iframe") {
    const root = document.implementation.createHTMLDocument("popup");
    resultMarkup(root);
    return { kind, container, root };
  }
  if (kind === "inline-listbox") {
    container.setAttribute("role", "listbox");
    container.setAttribute("data-search-query", "가상값");
    container.setAttribute("data-search-complete", "true");
    container.setAttribute("data-result-count", "1");
    resultMarkup(container);
    return { kind, container, root: container };
  }
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-modal", "true");
  resultMarkup(container);
  return { kind, container, root: container };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("SearchSurface positive result contract", () => {
  it.each([
    "same-document-dialog",
    "same-origin-iframe",
    "inline-listbox",
  ] as const)(
    "accepts one exact complete result with current query evidence for %s",
    (kind) => {
      const setup = fixture(kind);
      const opener = document.querySelector("button")!;
      const target = document.querySelector("input")!;
      const surface = new SearchSurface(
        kind,
        setup.container,
        setup.root,
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
      const results = observeResults(
        surface,
        session,
        resultBaseline(surface),
        "가상값",
      );
      const result = results.exact(["가상값"]);
      expect(result?.element.textContent).toBe("가상값");
      session.stop();
    },
  );
});

describe("SearchSurface lifecycle and navigation guards", () => {
  it("tracks containment, closure, and linked inline queries", () => {
    const setup = fixture("inline-listbox");
    const opener = document.querySelector("button")!;
    const target = document.querySelector<HTMLInputElement>("input")!;
    const query = document.createElement("input");
    query.type = "text";
    query.setAttribute("aria-controls", setup.container.id || "results");
    setup.container.id = "results";
    setup.container.parentElement?.append(query);
    const surface = new SearchSurface(
      "inline-listbox",
      setup.container,
      setup.container,
      opener,
      target,
    );
    expect(surface.contains(setup.container)).toBe(true);
    expect(surface.closure()).toBe("open");
    expect(surface.linkedQueries()).toContain(query);
    setup.container.hidden = true;
    expect(surface.closure()).toBe("closed");
  });

  it("rejects unsafe navigation and records a safe same-origin path", () => {
    const setup = fixture("same-origin-iframe");
    const opener = document.querySelector("button")!;
    const target = document.querySelector<HTMLInputElement>("input")!;
    const frame = document.createElement("iframe");
    setup.container.append(frame);
    const surface = new SearchSurface(
      "same-origin-iframe",
      setup.container,
      setup.root,
      opener,
      target,
      frame,
    );
    expect(surface.settleNavigation()).toBe(true);
    expect(surface.hasCompletedNavigation()).toBe(false);
    expect(() =>
      surface.expectNavigation(new URL("https://other.test/search")),
    ).toThrow();
  });

  it("detects stale opener, root, and frame identities", () => {
    const setup = fixture("same-document-dialog");
    const opener = document.querySelector("button")!;
    const target = document.querySelector<HTMLInputElement>("input")!;
    const surface = new SearchSurface(
      "same-document-dialog",
      setup.container,
      setup.root,
      opener,
      target,
    );
    opener.setAttribute("aria-label", "changed");
    expect(() => surface.revalidate()).toThrow();

    const second = fixture("same-document-dialog");
    const surface2 = new SearchSurface(
      "same-document-dialog",
      second.container,
      second.root,
      document.querySelectorAll("button")[1]!,
      document.querySelectorAll("input")[1]!,
    );
    surface2.root = document.createElement("div");
    expect(() => surface2.revalidate()).toThrow();
  });
});
