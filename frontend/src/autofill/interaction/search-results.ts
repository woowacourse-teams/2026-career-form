import {
  controlSignature,
  normalized,
  type SearchResult,
} from "./readonly-search";
import { SearchFailure, type SearchSession } from "./search-session";
import type { SearchSurface } from "./search-surface";
import { elements, safeActivation, shown } from "./search-surface-dom";
import {
  hasExplicitResultSignal,
  listItems,
  LocalMutationRecord,
  localReadiness,
  zeroNoticeConsistency,
} from "./local-result-readiness";

type RootState = {
  root: HTMLElement;
  signature: string;
  busy: string | null;
  items: readonly Element[];
};
export function resultBaseline(surface: SearchSurface): RootState[] {
  return surface.resultRoots().map((root) => ({
    root,
    signature: root.textContent ?? "",
    busy: root.getAttribute("aria-busy"),
    items: listItems(root),
  }));
}
export function observeResults(
  surface: SearchSurface,
  session: SearchSession,
  baseline: RootState[],
  query: string | undefined,
) {
  const generation = surface.queryGeneration;
  let busySeen = false;
  const mutations = new LocalMutationRecord();
  const now = () => surface.document.defaultView?.performance.now() ?? 0;
  const observe = () => {
    for (const root of surface.resultRoots()) {
      if (
        root.getAttribute("aria-busy") === "true" ||
        root.closest("[aria-busy='true']")
      )
        busySeen = true;
    }
  };
  const Observer = surface.document.defaultView?.MutationObserver;
  const observer = Observer
    ? new Observer((records) => {
        for (const record of records) mutations.record(record, now());
        for (const record of records)
          if (
            record.attributeName === "aria-busy" &&
            (record.oldValue === "true" ||
              (record.target as Element).getAttribute("aria-busy") === "true")
          )
            busySeen = true;
        observe();
      })
    : undefined;
  observer?.observe(surface.root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
  });
  session.addCleanup(() => observer?.disconnect());

  return {
    exact(
      expected: readonly string[],
    ): { element: SearchResult; signature: string } | undefined {
      if (surface.queryGeneration !== generation)
        throw new SearchFailure("result_stale");
      if (surface.navigationPending()) return undefined;
      surface.revalidate();
      observe();
      const roots = surface.resultRoots();
      if (!roots.length) return undefined;
      if (roots.length !== 1) throw new SearchFailure("surface_ambiguous");
      const root = roots[0]!;
      if (
        root.getAttribute("aria-busy") === "true" ||
        root.closest("[aria-busy='true']")
      )
        return undefined;
      const resultActions = () =>
        elements<HTMLElement>(root, "[role='option'], a, button").filter(
          (element) =>
            shown(element) &&
            !element.querySelector("[role='option'], a, button"),
        );
      // Role-less layer without explicit signals: judge by observed list replacement (C12).
      const localMode =
        surface.kind === "same-document-layer" &&
        query !== undefined &&
        !surface.hasCompletedNavigation(query) &&
        !hasExplicitResultSignal(surface, root, resultActions(), busySeen);
      if (
        localMode &&
        localReadiness(
          root,
          baseline.find((item) => item.root === root),
          mutations,
          now(),
        ) === "pending"
      )
        return undefined;
      const previous = baseline.find((item) => item.root === root);
      const changed =
        !previous || previous.signature !== (root.textContent ?? "");
      const queryTagged =
        query !== undefined &&
        normalized(root.getAttribute("data-search-query") ?? "") ===
          normalized(query);
      const completeMarker =
        root.getAttribute("data-search-complete") === "true";
      const ready =
        query === undefined ||
        surface.hasCompletedNavigation(query) ||
        (queryTagged && completeMarker) ||
        (busySeen && changed && root.getAttribute("aria-busy") === "false");
      if (!ready && !localMode) return undefined;
      const paging = elements<HTMLElement>(
        surface.root,
        "[rel='next'], [aria-label*='pagination' i], [aria-label*='페이지'], [data-has-more='true'], [data-virtualized='true'], [data-search-complete='false']",
      );
      if (paging.some(shown)) throw new SearchFailure("result_set_incomplete");
      if (
        elements<HTMLElement>(surface.root, "button, a").some(
          (control) =>
            shown(control) &&
            /^(더\s*보기|다음\s*(페이지|결과)|load more|next page)$/i.test(
              normalized(control.textContent ?? ""),
            ),
        )
      )
        throw new SearchFailure("result_set_incomplete");
      const actions = resultActions();
      if (localMode) {
        const notice = zeroNoticeConsistency(surface, root, actions);
        if (notice === "incomplete")
          throw new SearchFailure("result_set_incomplete");
        if (notice === "pending") return undefined;
      }
      const positions = actions.filter((element) =>
        element.hasAttribute("aria-setsize"),
      );
      if (
        positions.some(
          (element) =>
            Number(element.getAttribute("aria-setsize")) !== actions.length,
        ) ||
        root.getAttribute("aria-setsize") === "-1"
      )
        throw new SearchFailure("result_set_incomplete");
      const declared =
        root.getAttribute("data-result-count") ??
        root.getAttribute("aria-setsize");
      if (
        declared !== null &&
        (!/^\d+$/.test(declared) || Number(declared) !== actions.length)
      )
        throw new SearchFailure("result_set_incomplete");
      // Absence of a Next button alone cannot establish a complete result set.
      const allPositionsDeclared =
        actions.length > 0 && positions.length === actions.length;
      if (
        !localMode &&
        !completeMarker &&
        declared === null &&
        !allPositionsDeclared
      )
        throw new SearchFailure("result_set_incomplete");
      const ordinals = actions.map((element) =>
        element.getAttribute("aria-posinset"),
      );
      if (
        ordinals.some((ordinal) => ordinal !== null) &&
        (ordinals.some(
          (ordinal) =>
            ordinal === null ||
            !/^\d+$/.test(ordinal) ||
            Number(ordinal) < 1 ||
            Number(ordinal) > actions.length,
        ) ||
          new Set(ordinals).size !== actions.length)
      )
        throw new SearchFailure("result_set_incomplete");
      const matches = actions.filter((element) =>
        expected.some(
          (value) =>
            normalized(value) === normalized(element.textContent ?? ""),
        ),
      );
      if (matches.length > 1)
        throw new SearchFailure("multiple_matching_results");
      if (!matches.length) throw new SearchFailure("search_results_not_found");
      const element = matches[0]!;
      if (
        !safeActivation(element, expected, {
          resultRoot: root,
          surfaceKind: surface.kind,
        })
      )
        throw new SearchFailure("result_activation_unsafe");
      return { element, signature: controlSignature(element) };
    },
  };
}
