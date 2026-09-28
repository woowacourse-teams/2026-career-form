import { controlSignature } from "./readonly-search";
import { SearchFailure } from "./search-session";
import {
  accessibleDocument,
  elements,
  linked,
  shown,
  type SearchRoot,
} from "./search-surface-dom";

export type SearchSurfaceKind =
  "same-document-dialog" | "same-origin-iframe" | "inline-listbox";
export type SearchMode = "existing-options" | "query-only" | "query-and-submit";

function normalizedSearchValue(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

export class SearchSurface {
  documentGeneration = 0;
  queryGeneration = 0;
  mode?: SearchMode;
  private readonly frameSignature?: string;
  private expectedNavigation?: {
    url: URL;
    method: "get" | "post";
    query?: string;
  };
  private previousDocument?: Document;
  private acceptedSearchPath?: string;
  private acceptedSearchQuery?: string;
  private readonly origin: string;
  private readonly openerSignature: string;
  private rootIdentity: SearchRoot;
  constructor(
    readonly kind: SearchSurfaceKind,
    readonly container: HTMLElement,
    public root: SearchRoot,
    readonly opener: HTMLElement,
    readonly target: HTMLInputElement,
    readonly frame?: HTMLIFrameElement,
  ) {
    this.rootIdentity = root;
    this.frameSignature = frame
      ? [frame.getAttribute("sandbox"), frame.name].join("|")
      : undefined;
    this.origin = target.ownerDocument.location.origin;
    this.openerSignature = controlSignature(opener);
  }
  get document(): Document {
    return this.frame ? (this.root as Document) : this.container.ownerDocument;
  }
  get modal(): Element | undefined {
    return this.container.matches(
      "dialog[open], [role='dialog'][aria-modal='true']",
    )
      ? this.container
      : undefined;
  }
  contains(element: Element): boolean {
    if (this.root === element || this.root.contains(element)) return true;
    return this.linkedQueries().includes(element as HTMLInputElement);
  }
  linkedQueries(): HTMLInputElement[] {
    if (this.kind !== "inline-listbox") return [];
    // An external query is accepted only when it explicitly controls this list.
    const group = this.opener.parentElement;
    if (!group || !group.contains(this.target)) return [];
    return elements<HTMLInputElement>(group, "input").filter(
      (input) =>
        !input.readOnly &&
        linked(input, this.container) &&
        input.getRootNode() === this.target.getRootNode(),
    );
  }
  closure(): "open" | "closed" | "unknown" {
    if (!this.container.isConnected || !shown(this.container)) return "closed";
    return "open";
  }
  assertSelectionDocument(): void {
    // Removal is normal closure; a still-connected iframe must not navigate after selection.
    if (
      this.frame?.isConnected &&
      accessibleDocument(this.frame) !== this.document
    )
      throw new SearchFailure("surface_navigation_unsafe");
  }
  revalidate(): void {
    if (
      this.closure() !== "open" ||
      this.root !== this.rootIdentity ||
      !this.opener.isConnected ||
      controlSignature(this.opener) !== this.openerSignature
    )
      throw new SearchFailure("surface_stale");
    if (this.frame) {
      if (
        !this.frame.isConnected ||
        !shown(this.frame) ||
        (this.container !== this.frame &&
          !this.container.contains(this.frame)) ||
        [this.frame.getAttribute("sandbox"), this.frame.name].join("|") !==
          this.frameSignature
      )
        throw new SearchFailure("surface_stale");
      const live = accessibleDocument(this.frame);
      if (live !== this.document)
        throw new SearchFailure("surface_navigation_unsafe");
    }
  }
  expectNavigation(
    url: URL,
    query?: string,
    method: "get" | "post" = "get",
  ): void {
    if (!this.frame || url.origin !== this.origin)
      throw new SearchFailure("surface_navigation_unsafe");
    this.expectedNavigation = { url, method, ...(query ? { query } : {}) };
    this.acceptedSearchPath = undefined;
    this.acceptedSearchQuery = undefined;
    this.previousDocument = this.document;
  }
  navigationPending(): boolean {
    return this.expectedNavigation !== undefined;
  }
  settleNavigation(): boolean {
    if (!this.expectedNavigation || !this.frame) return true;
    if (!this.frame.isConnected || !shown(this.frame))
      throw new SearchFailure("surface_stale");
    const next = accessibleDocument(this.frame);
    if (
      !next ||
      next === this.previousDocument ||
      next.readyState !== "complete"
    )
      return false;
    const actual = new URL(next.URL);
    const expected = this.expectedNavigation;
    if (
      actual.origin !== expected.url.origin ||
      actual.pathname !== expected.url.pathname ||
      actual.searchParams.toString() !== expected.url.searchParams.toString()
    )
      throw new SearchFailure("surface_navigation_unsafe");
    this.acceptedSearchPath = actual.pathname;
    this.acceptedSearchQuery = expected.query;
    this.root = next;
    this.rootIdentity = next;
    this.documentGeneration++;
    this.expectedNavigation = undefined;
    return true;
  }
  hasCompletedNavigation(query?: string): boolean {
    if (this.acceptedSearchPath === undefined) return false;
    return query === undefined
      ? true
      : normalizedSearchValue(this.acceptedSearchQuery) ===
          normalizedSearchValue(query);
  }
  resultRoots(): HTMLElement[] {
    const root = this.root;
    const found = [
      ...("matches" in root &&
      root.matches("[role='listbox'], [data-search-results]")
        ? [root as HTMLElement]
        : []),
      ...elements<HTMLElement>(
        root,
        "[role='listbox'], [data-search-results], [role='list'], ul, ol, table",
      ),
    ].filter(
      (item) =>
        shown(item) &&
        (item.matches("[role='listbox'], [data-search-results]") ||
          /검색|결과|선택|result|select|search/i.test(
            [
              item.getAttribute("aria-label"),
              item.querySelector("caption")?.textContent,
              item.previousElementSibling?.textContent,
            ]
              .filter(Boolean)
              .join(" "),
          )),
    );
    // Keep the outer result scope; nested markup is not a second result set.
    return found.filter(
      (item) => !found.some((other) => other !== item && other.contains(item)),
    );
  }
}
