import {
  captureDomSnapshot,
  restoreDomSnapshot,
  type DomSnapshot,
} from "../dom-snapshot";
import { runDomPlan, evaluatePlanConditions } from "../action-plan";
import { hiddenCodeRules } from "../runtime-rules";
import { policyResultMatches } from "./result-match";
// Common executor for forms with hidden codes and DOM-backed option controls.
import {
  contractValue,
  contractText,
  contractPattern,
  type HiddenCodeContract,
} from "./contract";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { FailureReporter, WriteFailureCode } from "../../write/failure";
import { selectDirectInput } from "../../interaction/search-direct-input";
import { catalogApprovalForItem } from "../../profile/catalog-identity";
import {
  matchesApprovedCatalog,
  type CatalogApproval,
  type CatalogEvidence,
} from "../../profile/catalog-match";
import { catalogEvidenceForElement } from "../../profile/catalog-evidence";
import {
  rememberCatalogSelection,
  retainedCatalogSelection,
} from "../../profile/catalog-receipt";

export function createCodedSearchModule(
  document: Document,
  contract: HiddenCodeContract,
) {
  const SEARCH_TIMEOUT_MILLISECONDS = contractValue<number>(
    contract.definitions.searchTimeoutMs,
  );

  type SearchSpec = HiddenCodeContract["behavior"]["searches"][number];

  interface SearchField {
    display: HTMLInputElement;
    hidden: HTMLInputElement;
    results: HTMLElement;
  }

  interface FieldState {
    snapshot: DomSnapshot;
    displayValue: string;
    hiddenValue: string;
    searchResult: string | null;
    hasExistClass: boolean;
  }

  function normalize(value: string | undefined): string {
    return (
      value
        ?.normalize("NFKC" as "NFKC")
        .replace(contractPattern(contract.patterns.whitespace), " ")
        .trim() ?? ""
    );
  }

  function searchSpec(handle: FieldCandidateHandle): SearchSpec | undefined {
    const matches = contract.behavior.searches.filter(
      (rule) =>
        rule.domName === handle.candidate.domName &&
        rule.group === handle.itemGroupId,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  function verifiedItem(
    item: ReviewPlanItem,
    handle: FieldCandidateHandle,
    spec: SearchSpec,
  ): boolean {
    const binding = item.analysis?.valueBinding;
    return (
      item.candidateId === handle.candidateId &&
      item.selected &&
      !item.disabled &&
      item.analysis?.candidateId === item.candidateId &&
      item.analysis.mappingStatus === "ADAPTER_VERIFIED" &&
      item.analysis.interactionStatus === "READY" &&
      item.analysis.writePlan?.command === "SET_TEXT" &&
      binding?.type === "DIRECT" &&
      binding.profileFieldKey === spec.profileFieldKey &&
      normalize(item.profileValue) !== ""
    );
  }

  function uniqueOwnedElement<T extends Element>(
    field: HTMLElement,
    selector: string,
  ): T | undefined {
    const matches = Array.from(field.querySelectorAll<T>(selector)).filter(
      (element) => element.closest(contract.targets.searchField) === field,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  function verifiedField(
    document: Document,
    handle: FieldCandidateHandle,
    spec: SearchSpec,
  ): SearchField | undefined {
    const display = handle.elements[0];
    const expectedId = new RegExp(
      contractText(contract.templates.indexedControl, [spec.domName]),
    );
    if (
      document.location.host !== contract.host ||
      document.location.pathname !== contract.path ||
      handle.isCurrentContext?.() === false ||
      handle.elements.length !== 1 ||
      handle.candidate.domName !== spec.domName ||
      !handle.candidate.domId ||
      !expectedId.test(handle.candidate.domId) ||
      handle.candidate.element !== "input" ||
      handle.candidate.control !== "text" ||
      !(display instanceof HTMLInputElement) ||
      display.ownerDocument !== document ||
      !display.isConnected ||
      display.disabled ||
      display.readOnly ||
      display.id !== handle.candidate.domId ||
      display.name !== spec.domName ||
      display.type !== "text" ||
      display.dataset[contract.behavior.datasetKeys.autoType] !==
        spec.autoType ||
      display.dataset[contract.behavior.datasetKeys.autoApi] !==
        contract.tokens.searchCategory ||
      display.dataset[contract.behavior.datasetKeys.autoParams] !== spec.params
    ) {
      return undefined;
    }
    const field = display.closest<HTMLElement>(contract.targets.searchField);
    if (!field || field.matches(contract.targets.inaccessibleAncestors)) {
      return undefined;
    }
    const ownedDisplay = uniqueOwnedElement<HTMLInputElement>(
      field,
      contractText(contract.templates.namedSearchInput, [
        display.id,
        spec.domName,
      ]),
    );
    const hidden = uniqueOwnedElement<HTMLInputElement>(
      field,
      contractText(contract.templates.hiddenByName, [spec.hiddenName]),
    );
    const results = uniqueOwnedElement<HTMLElement>(
      field,
      contract.targets.searchResults,
    );
    return ownedDisplay === display && hidden && results
      ? { display, hidden, results }
      : undefined;
  }

  function validResultCode(value: string | undefined): value is string {
    return Boolean(
      value?.trim() && !contract.behavior.searchRejectedCodes.includes(value),
    );
  }

  function isConfirmed(field: SearchField, query: string): boolean {
    return evaluatePlanConditions(
      contract.behavior.confirmations["coded-search"],
      { display: field.display, hidden: field.hidden },
      { query },
    );
  }

  function isBlank(field: SearchField): boolean {
    return evaluatePlanConditions(
      contract.behavior.confirmations.blank,
      { display: field.display, hidden: field.hidden },
      {},
    );
  }

  function currentState(field: SearchField): FieldState {
    return {
      snapshot: captureDomSnapshot(
        contract.behavior.snapshots["coded-search"],
        {
          display: field.display,
          hidden: field.hidden,
          container: field.display.closest<HTMLElement>(
            contract.targets.searchField ?? "[data-no-snapshot-container]",
          ),
        },
      ),
      displayValue: field.display.value,
      hiddenValue: field.hidden.value,
      searchResult: field.display.getAttribute(
        contract.tokens.selectedLabelAttribute,
      ),
      hasExistClass:
        field.display
          .closest(contract.targets.searchField)
          ?.classList.contains(contract.tokens.completedClass) ?? false,
    };
  }

  function setNativeValue(input: HTMLInputElement, value: string): boolean {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) return false;
    setter.call(input, value);
    return input.value === value;
  }

  function restoreIfUnchanged(
    field: SearchField,
    query: string,
    before: FieldState,
  ): void {
    if (
      !field.display.isConnected ||
      field.display.value !== query ||
      field.hidden.value !== before.hiddenValue ||
      field.display.getAttribute(contract.tokens.selectedLabelAttribute) !==
        before.searchResult
    ) {
      return;
    }
    restoreDomSnapshot(
      before.snapshot,
      () => field.display.isConnected && field.hidden.isConnected,
    );
  }

  function restoreOwnedSelectionIfUnchanged(
    field: SearchField,
    query: string,
    code: string,
    before: FieldState,
  ): void {
    if (
      !field.display.isConnected ||
      field.display.value !== query ||
      field.hidden.value !== code ||
      normalize(
        field.display.dataset[contract.behavior.datasetKeys.searchResult],
      ) !== query
    ) {
      return;
    }
    restoreDomSnapshot(
      before.snapshot,
      () => field.display.isConnected && field.hidden.isConnected,
    );
  }

  // The site closes result views with an animation, and its document-level
  // click handler reads every view still visible as one set: when the first
  // one holds no selection it blanks the display of all of them, hidden codes
  // included or not. A view left open after a search that selected nothing,
  // or a view still sliding up, can therefore wipe a row committed moments
  // ago. Searches end only once no view is visible.
  const SEARCH_VIEW_CLOSE_MILLISECONDS = 1500;
  function visibleSearchViews(doc: Document): HTMLElement[] {
    return Array.from(
      doc.querySelectorAll<HTMLElement>(contract.targets.searchDisplay),
    ).filter(
      (view) =>
        view.isConnected &&
        (view.offsetWidth > 0 ||
          view.offsetHeight > 0 ||
          view.getClientRects().length > 0),
    );
  }
  function waitForSearchViewsClosed(
    doc: Document,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const view = doc.defaultView;
    if (!view) return Promise.resolve(visibleSearchViews(doc).length === 0);
    return new Promise((resolve) => {
      const deadline = Date.now() + SEARCH_VIEW_CLOSE_MILLISECONDS;
      const check = () => {
        if (signal?.aborted) return resolve(false);
        if (visibleSearchViews(doc).length === 0) return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        view.setTimeout(check, 50);
      };
      check();
    });
  }
  // After a search that selected nothing, the restored query is empty but the
  // site still shows the list. Notifying it of the empty query makes the site
  // close the view and drop the list, as it would for a user clearing the box.
  async function dismissStaleResults(
    field: SearchField,
    before: FieldState,
    signal?: AbortSignal,
  ): Promise<void> {
    if (
      signal?.aborted ||
      !field.display.isConnected ||
      !field.results.isConnected ||
      before.hiddenValue !== "" ||
      before.searchResult ||
      field.display.value !== "" ||
      field.hidden.value !== ""
    )
      return;
    const doc = field.display.ownerDocument;
    if (
      field.results.childElementCount === 0 &&
      visibleSearchViews(doc).length === 0
    )
      return;
    runDomPlan(
      contract.behavior.actionPlans.searchNotify,
      { input: field.display },
      { value: "" },
      () =>
        !signal?.aborted &&
        field.display.isConnected &&
        field.display.value === "",
    );
    await waitForSearchViewsClosed(doc, signal);
  }

  function markConfirmed(field: SearchField): void {
    const container = field.display.closest<HTMLElement>(
      contract.targets.searchField,
    );
    if (container)
      runDomPlan(
        contract.behavior.actionPlans.searchConfirmed,
        { container },
        {},
        () => field.display.isConnected,
      );
  }

  function isVisibleAction(button: HTMLButtonElement): boolean {
    if (!button.isConnected || button.disabled || button.matches(":disabled")) {
      return false;
    }
    const view = button.ownerDocument.defaultView;
    if (!view) return false;
    for (
      let current: HTMLElement | null = button;
      current;
      current = current.parentElement
    ) {
      const style = view.getComputedStyle(current);
      if (
        current.hidden ||
        current.matches(contract.targets.maskedAncestors) ||
        style.display === "none" ||
        style.visibility === "hidden"
      ) {
        return false;
      }
    }
    return true;
  }

  interface SearchResult {
    button: HTMLButtonElement;
    code: string;
    label: string;
    evidence: CatalogEvidence;
  }

  function exactResult(
    results: HTMLElement,
    query: string,
    approval: CatalogApproval,
    onFailure?: FailureReporter,
    spec?: SearchSpec,
  ): SearchResult | undefined {
    const visibleResults = Array.from(
      results.querySelectorAll<HTMLButtonElement>(
        contract.targets.searchResultButton,
      ),
    ).filter(
      (button) =>
        button.closest(contract.targets.searchResults) === results &&
        isVisibleAction(button),
    );
    const matches = visibleResults.filter(
      (button) =>
        normalize(button.dataset[contract.behavior.datasetKeys.search]) ===
          query &&
        (spec?.resultMatch
          ? policyResultMatches(
              spec.resultMatch,
              approval,
              query,
              catalogEvidenceForElement(button, results),
              hiddenCodeRules(document).schoolMatch,
            )
          : approval.status === "selected"
            ? normalize(
                button.dataset[contract.behavior.datasetKeys.result],
              ) ===
                normalize(catalogEvidenceForElement(button, results).label) &&
              matchesApprovedCatalog(
                approval.match,
                catalogEvidenceForElement(button, results),
              )
            : normalize(
                button.dataset[contract.behavior.datasetKeys.result],
              ) === query),
    );
    if (matches.length !== 1) {
      onFailure?.(
        matches.length > 1
          ? "SEARCH_AMBIGUOUS"
          : visibleResults.some(
                (button) =>
                  normalize(
                    button.dataset[contract.behavior.datasetKeys.search],
                  ) === query &&
                  normalize(
                    button.dataset[contract.behavior.datasetKeys.result],
                  ) !== "" &&
                  validResultCode(
                    button.dataset[contract.behavior.datasetKeys.code],
                  ),
              )
            ? ("SEARCH_NO_EXACT_MATCH" as WriteFailureCode)
            : "SEARCH_UNCONFIRMED",
      );
      return undefined;
    }
    const button = matches[0]!;
    const code = button.dataset[contract.behavior.datasetKeys.code];
    if (!validResultCode(code)) {
      onFailure?.("SEARCH_UNCONFIRMED");
      return undefined;
    }
    return {
      button,
      code,
      label: button.dataset[contract.behavior.datasetKeys.result]!,
      evidence: catalogEvidenceForElement(button, results),
    };
  }

  function waitForFreshExactResult(
    document: Document,
    field: SearchField,
    query: string,
    approval: CatalogApproval,
    signal?: AbortSignal,
    onFailure?: FailureReporter,
    spec?: SearchSpec,
  ): Promise<SearchResult | undefined> {
    const view = document.defaultView;
    if (!view || signal?.aborted) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const before = currentState(field);
      let finished = false;
      let changed = false;
      const finish = (result: SearchResult | undefined) => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        view.clearTimeout(timeout);
        signal?.removeEventListener("abort", aborted);
        resolve(result);
      };
      const aborted = () => finish(undefined);
      const inspect = () => {
        if (
          signal?.aborted ||
          !field.display.isConnected ||
          !field.hidden.isConnected ||
          !field.results.isConnected ||
          field.display.value !== query
        ) {
          finish(undefined);
          return;
        }
        if (
          (contract.behavior.searchObservation.requireMutation && !changed) ||
          field.results.childElementCount === 0
        )
          return;
        finish(exactResult(field.results, query, approval, onFailure, spec));
      };
      const observer = new view.MutationObserver(() => {
        changed = true;
        inspect();
      });
      observer.observe(field.results, {
        childList: contract.behavior.searchObservation.childList,
        subtree: contract.behavior.searchObservation.subtree,
      });
      const timeout = view.setTimeout(() => {
        if (
          !signal?.aborted &&
          field.display.isConnected &&
          field.hidden.isConnected &&
          field.results.isConnected &&
          field.display.value === query &&
          field.hidden.value === before.hiddenValue &&
          field.display.getAttribute(contract.tokens.selectedLabelAttribute) ===
            before.searchResult
        ) {
          onFailure?.("SEARCH_TIMEOUT" as WriteFailureCode);
        }
        finish(undefined);
      }, SEARCH_TIMEOUT_MILLISECONDS);
      signal?.addEventListener("abort", aborted, {
        once: true,
      });

      if (signal?.aborted || !setNativeValue(field.display, query)) {
        finish(undefined);
        return;
      }
      if (
        !runDomPlan(
          contract.behavior.actionPlans.searchNotify,
          { input: field.display },
          { value: query },
          () =>
            !signal?.aborted &&
            field.display.isConnected &&
            field.display.value === query,
        )
      )
        finish(undefined);
    });
  }

  async function runCodedSearch(
    document: Document,
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
    signal?: AbortSignal,
    onFailure?: FailureReporter,
  ): Promise<boolean> {
    if (signal?.aborted) return false;
    const spec = searchSpec(handle);
    if (!spec || !verifiedItem(item, handle, spec)) return false;
    const approval = catalogApprovalForItem(item);
    if (
      approval.status === "invalid" ||
      (approval.status === "selected" &&
        approval.match.kind !== spec.catalogKind)
    )
      return false;
    const field = verifiedField(document, handle, spec);
    if (!field) return false;
    const owner = field.display.closest(contract.targets.searchField);
    const row = field.display.closest(contract.targets.row);
    const rowOwner = row?.parentElement;
    let query = normalize(
      approval.status === "selected" ? approval.match.query : item.profileValue,
    );
    for (const replacement of spec.resultMatch?.nameReplacements ?? []) {
      if (replacement.from && query.endsWith(replacement.from))
        query = query.slice(0, -replacement.from.length) + replacement.to;
    }
    if (
      approval.status === "selected"
        ? retainedCatalogSelection(item, field.display) !== undefined
        : isConfirmed(field, query)
    ) {
      markConfirmed(field);
      return true;
    }
    if (
      normalize(item.currentValue) !== normalize(field.display.value) ||
      (!hiddenCodeRules(document).overwriteSelections && !isBlank(field))
    ) {
      return false;
    }

    const before = currentState(field);
    let searchFailure: WriteFailureCode | undefined;
    const result = await waitForFreshExactResult(
      document,
      field,
      query,
      approval,
      signal,
      (code) => {
        searchFailure = code;
      },
      spec,
    );
    if (
      spec.allowDirectInput &&
      !result &&
      approval.status !== "selected" &&
      searchFailure !== "SEARCH_AMBIGUOUS"
    ) {
      const root = field.results.closest<HTMLElement>(
        contract.targets.searchDisplay,
      );
      const current = () => {
        const live = verifiedField(document, handle, spec);
        return (
          !signal?.aborted &&
          handle.isCurrentContext?.() !== false &&
          live?.display === field.display &&
          live.hidden === field.hidden &&
          live.results === field.results &&
          field.display.closest(contract.targets.searchField) === owner &&
          field.display.closest(contract.targets.row) === row &&
          row?.parentElement === rowOwner
        );
      };
      const hasExactResult = Array.from(
        field.results.querySelectorAll<HTMLButtonElement>(
          contract.targets.directResultButton,
        ),
      ).some(
        (button) =>
          isVisibleAction(button) &&
          normalize(button.dataset[contract.behavior.datasetKeys.search]) ===
            query &&
          normalize(button.dataset[contract.behavior.datasetKeys.result]) ===
            query,
      );
      if (
        root &&
        !hasExactResult &&
        field.hidden.value === before.hiddenValue &&
        field.display.getAttribute(contract.tokens.selectedLabelAttribute) ===
          before.searchResult &&
        (await selectDirectInput({
          root,
          input: field.display,
          query,
          isCurrent: current,
          isConfirmed: () =>
            field.hidden.value === spec.directInputCode &&
            normalize(
              field.display.dataset[contract.behavior.datasetKeys.searchResult],
            ) === query,
        }))
      ) {
        markConfirmed(field);
        return true;
      }
    }
    if (!result && searchFailure) onFailure?.(searchFailure);
    if (
      signal?.aborted ||
      !result ||
      handle.isCurrentContext?.() === false ||
      !field.display.isConnected ||
      !field.hidden.isConnected ||
      !field.results.isConnected ||
      field.display.value !== query ||
      field.hidden.value !== before.hiddenValue ||
      field.display.getAttribute(contract.tokens.selectedLabelAttribute) !==
        before.searchResult ||
      !result.button.isConnected ||
      result.button.closest(contract.targets.searchResults) !== field.results
    ) {
      restoreIfUnchanged(field, query, before);
      await dismissStaleResults(field, before, signal);
      if (result && !signal?.aborted) onFailure?.("SEARCH_UNCONFIRMED");
      return false;
    }

    const verifiedBeforeClick = verifiedField(document, handle, spec);
    if (
      approval.status === "selected" &&
      (verifiedBeforeClick?.display !== field.display ||
        verifiedBeforeClick.hidden !== field.hidden ||
        verifiedBeforeClick.results !== field.results ||
        field.display.closest(contract.targets.searchField) !== owner ||
        field.display.closest(contract.targets.row) !== row ||
        row?.parentElement !== rowOwner ||
        result.button.dataset[contract.behavior.datasetKeys.code] !==
          result.code ||
        result.button.dataset[contract.behavior.datasetKeys.result] !==
          result.label ||
        normalize(
          result.button.dataset[contract.behavior.datasetKeys.search],
        ) !== query ||
        !isVisibleAction(result.button) ||
        !(spec.resultMatch
          ? policyResultMatches(
              spec.resultMatch,
              approval,
              query,
              catalogEvidenceForElement(result.button, field.results),
              hiddenCodeRules(document).schoolMatch,
            )
          : matchesApprovedCatalog(
              approval.match,
              catalogEvidenceForElement(result.button, field.results),
            )))
    ) {
      restoreIfUnchanged(field, query, before);
      await dismissStaleResults(field, before, signal);
      onFailure?.("SEARCH_UNCONFIRMED");
      return false;
    }
    result.button.click();
    const verifiedAfterClick = verifiedField(document, handle, spec);
    if (
      verifiedAfterClick?.display !== field.display ||
      verifiedAfterClick.hidden !== field.hidden ||
      verifiedAfterClick.results !== field.results ||
      !isConfirmed(field, normalize(result.label)) ||
      field.hidden.value !== result.code
    ) {
      restoreOwnedSelectionIfUnchanged(
        field,
        result.label,
        result.code,
        before,
      );
      await dismissStaleResults(field, before, signal);
      onFailure?.("SEARCH_UNCONFIRMED");
      return false;
    }
    if (
      approval.status === "selected" &&
      !rememberCatalogSelection(item, {
        element: field.display,
        evidence: result.evidence,
        ...(spec.resultMatch
          ? {
              matchesEvidence: (
                _approval: unknown,
                evidence: CatalogEvidence,
              ) =>
                policyResultMatches(
                  spec.resultMatch!,
                  approval,
                  query,
                  evidence,
                  hiddenCodeRules(document).schoolMatch,
                ),
            }
          : {}),
        verify: () => {
          const current = verifiedField(document, handle, spec);
          return (
            current?.display === field.display &&
            current.hidden === field.hidden &&
            current.results === field.results &&
            field.display.closest(contract.targets.searchField) === owner &&
            field.display.closest(contract.targets.row) === row &&
            row?.parentElement === rowOwner &&
            field.display.value === result.label &&
            field.display.dataset[
              contract.behavior.datasetKeys.searchResult
            ] === result.label &&
            field.hidden.value === result.code
          );
        },
      })
    ) {
      restoreOwnedSelectionIfUnchanged(
        field,
        result.label,
        result.code,
        before,
      );
      await dismissStaleResults(field, before, signal);
      onFailure?.("SEARCH_UNCONFIRMED");
      return false;
    }
    markConfirmed(field);
    // The site is still sliding this view up; a click elsewhere before it is
    // gone would blank the display just confirmed.
    await waitForSearchViewsClosed(document, signal);
    return true;
  }

  return { runCodedSearch };
}
