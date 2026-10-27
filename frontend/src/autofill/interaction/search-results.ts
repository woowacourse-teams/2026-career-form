import { localWorkflowLog } from "../debug/local-workflow";
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
  LOCAL_ZERO_RESULT_SETTLE_MS,
  LocalMutationRecord,
  zeroNotices,
  localReadiness,
  zeroNoticeConsistency,
} from "./local-result-readiness";

import { interpretResultStructure } from "./search-result-structure";
import { catalogEvidenceForElement } from "../profile/catalog-evidence";
import {
  matchesApprovedCatalog,
  type ApprovedCatalogMatch,
  type CatalogEvidence,
} from "../profile/catalog-match";

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
  queryCommitted: () => boolean = () => false,
) {
  const generation = surface.queryGeneration;
  let busySeen = false;
  const mutations = new LocalMutationRecord();
  const now = () => surface.document.defaultView?.performance.now() ?? 0;
  const startedAt = now();
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

  let pendingReason = "";
  const pend = (reason: string): undefined => {
    pendingReason = reason;
    return undefined;
  };
  const readyRoot = () => {
    if (surface.queryGeneration !== generation)
      throw new SearchFailure("result_stale");
    if (surface.navigationPending()) return pend("navigation");
    surface.revalidate();
    observe();
    const roots = surface.resultRoots();
    if (!roots.length) return pend("no-root");
    if (roots.length !== 1) throw new SearchFailure("surface_ambiguous");
    const root = roots[0]!;
    if (
      root.getAttribute("aria-busy") === "true" ||
      root.closest("[aria-busy='true']")
    )
      return pend("busy");
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
        session.args.genericPopupRecovery === true && queryCommitted(),
      ) === "pending"
    ) {
      const entry = baseline.find((item) => item.root === root);
      const current = listItems(root);
      const added = mutations.addedItems(root);
      const last = mutations.lastMutationAt(root);
      // An empty list that never changed is either still loading or a real
      // zero-result answer. After a bounded settle time a visible zero-result
      // notice decides it, so the search can fail as "not found" and try its
      // next query instead of waiting out the whole deadline.
      const settledEmpty =
        session.args.genericPopupRecovery === true &&
        current.length === 0 &&
        added.size === 0 &&
        now() - startedAt >= LOCAL_ZERO_RESULT_SETTLE_MS &&
        zeroNotices(surface, root).some(shown);
      if (!settledEmpty) {
        pendingReason = JSON.stringify({
          local: true,
          hasBaseline: Boolean(entry),
          baselineItems: entry?.items.length ?? -1,
          current: current.length,
          added: added.size,
          overlap: entry
            ? entry.items.filter((item) => current.includes(item)).length
            : -1,
          unadded: current.filter((item) => !added.has(item)).length,
          sinceLast: last === undefined ? -1 : now() - last,
        });
        return undefined;
      }
    }
    const previous = baseline.find((item) => item.root === root);
    const changed =
      !previous || previous.signature !== (root.textContent ?? "");
    const queryTagged =
      query !== undefined &&
      normalized(root.getAttribute("data-search-query") ?? "") ===
        normalized(query);
    const completeMarker = root.getAttribute("data-search-complete") === "true";
    const ready =
      query === undefined ||
      surface.hasCompletedNavigation(query) ||
      (queryTagged && completeMarker) ||
      (busySeen && changed && root.getAttribute("aria-busy") === "false");
    if (!ready && !localMode) return pend("not-ready");
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
      if (notice === "pending") return pend("zero-notice-pending");
    }
    return { root, localMode, actions };
  };
  return {
    pendingReason: () => pendingReason,
    empty() {
      const ready = readyRoot();
      return Boolean(
        ready &&
        ready.actions.length === 0 &&
        listItems(ready.root).length === 0 &&
        (ready.root.getAttribute("data-result-count") === "0" ||
          zeroNotices(surface, ready.root).some(shown)),
      );
    },
    async interpret() {
      const root = readyRoot()?.root;
      if (!root) throw new SearchFailure("result_pending");
      return interpretResultStructure(root, session, () => {
        if (readyRoot()?.root !== root) throw new SearchFailure("result_stale");
      });
    },
    exact(
      expected: readonly string[],
      catalogMatch?: ApprovedCatalogMatch,
    ):
      | { element: SearchResult; signature: string; evidence: CatalogEvidence }
      | undefined {
      const ready = readyRoot();
      if (!ready) return undefined;
      const { root, localMode, actions } = ready;
      const completeMarker =
        root.getAttribute("data-search-complete") === "true";
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
      const evidenceFor = (element: HTMLElement) =>
        catalogEvidenceForElement(element, root);
      const approved = actions.filter((element) =>
        catalogMatch
          ? matchesApprovedCatalog(catalogMatch, evidenceFor(element))
          : expected.some(
              (value) =>
                normalized(value) === normalized(element.textContent ?? ""),
            ),
      );
      // Two approved names of one certificate: the one named exactly as the
      // approved query is the applicant's own wording.
      const queryNamed = catalogMatch
        ? approved.filter(
            (element) =>
              normalized(evidenceFor(element).label) ===
              normalized(catalogMatch.query),
          )
        : [];
      const matches =
        approved.length > 1 && queryNamed.length === 1 ? queryNamed : approved;
      if (matches.length > 1)
        throw new SearchFailure("multiple_matching_results");
      if (!matches.length) {
        // Local QA: booleans and counts only, never labels or profile values.
        const wanted = (catalogMatch ? catalogMatch.labels : expected).map(
          normalized,
        );
        const found = actions.map((element) =>
          normalized(
            catalogMatch
              ? evidenceFor(element).label
              : (element.textContent ?? ""),
          ),
        );
        localWorkflowLog("search-no-match", {
          results: actions.length,
          catalog: Boolean(catalogMatch),
          resultContainsWanted: found.some((label) =>
            wanted.some((value) => label.includes(value)),
          ),
          wantedContainsResult: found.some((label) =>
            wanted.some((value) => value.includes(label)),
          ),
        });
        throw new SearchFailure("search_results_not_found");
      }
      const element = matches[0]!;
      const evidence = evidenceFor(element);
      if (
        !safeActivation(element, catalogMatch ? [evidence.label] : expected, {
          resultRoot: root,
          surfaceKind: surface.kind,
          allowEmptyJavascriptLink: session.args.genericPopupRecovery === true,
        })
      )
        throw new SearchFailure("result_activation_unsafe");
      return { element, signature: controlSignature(element), evidence };
    },
  };
}
