import {
  captureDomSnapshot,
  restoreDomSnapshot,
  type DomSnapshot,
} from "../dom-snapshot";
import { runDomPlan, evaluatePlanConditions } from "../action-plan";
import { hiddenCodeRules } from "../runtime-rules";
// Common executor for forms with hidden codes and DOM-backed option controls.
import {
  contractValue,
  contractText,
  contractPattern,
  type HiddenCodeContract,
} from "./contract";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

function createFixedSearchRunner(
  document: Document,
  contract: HiddenCodeContract,
  spec: HiddenCodeContract["behavior"]["fixedCodeSearches"][number],
  selection: { label: string; code: string },
) {
  const DISPLAY_NAME = selection.label;
  const EXPECTED_CODE = selection.code;
  const PROFILE_FIELD_KEY = spec.key;
  const SEARCH_TIMEOUT_MILLISECONDS = contractValue<number>(
    contract.definitions.searchTimeoutMs,
  );

  interface FixedSearchField {
    display: HTMLInputElement;
    hidden: HTMLInputElement;
    results: HTMLElement;
  }

  interface FieldState {
    snapshot: DomSnapshot;
    displayValue: string;
    hiddenValue: string;
    searchResult: string | null;
  }

  function normalize(value: string | undefined): string {
    return (
      value
        ?.normalize("NFKC" as "NFKC")
        .replace(contractPattern(contract.patterns.whitespace), " ")
        .trim() ?? ""
    );
  }

  function verifiedProfileBinding(item: ReviewPlanItem): boolean {
    const binding = item.analysis?.valueBinding;
    if (
      binding?.profileFieldKey !== PROFILE_FIELD_KEY ||
      normalize(item.profileValue) !== DISPLAY_NAME
    ) {
      return false;
    }
    if (binding.type === "DIRECT") return true;
    return (
      binding.type === "LOOKUP" &&
      normalize(binding.optionMap[item.profileValue ?? ""]) === DISPLAY_NAME
    );
  }

  function verifiedItem(
    item: ReviewPlanItem,
    handle: FieldCandidateHandle,
  ): boolean {
    return (
      item.candidateId === handle.candidateId &&
      item.selected &&
      !item.disabled &&
      item.analysis?.candidateId === item.candidateId &&
      item.analysis.mappingStatus === "ADAPTER_VERIFIED" &&
      item.analysis.interactionStatus === "READY" &&
      item.analysis.writePlan?.command === "SET_TEXT" &&
      verifiedProfileBinding(item)
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
  ): FixedSearchField | undefined {
    const display = handle.elements[0];
    if (
      document.location.host !== contract.host ||
      document.location.pathname !== contract.path ||
      handle.elements.length !== 1 ||
      handle.candidate.domId !== spec.name ||
      handle.candidate.domName !== spec.name ||
      handle.candidate.element !== "input" ||
      handle.candidate.control !== "text" ||
      !(display instanceof HTMLInputElement) ||
      display.ownerDocument !== document ||
      !display.isConnected ||
      display.disabled ||
      display.readOnly ||
      display.id !== spec.name ||
      display.name !== spec.name ||
      display.type !== "text" ||
      !Object.entries(spec.attributes).every(
        ([name, value]) => display.getAttribute(name) === value,
      )
    ) {
      return undefined;
    }
    const field = display.closest<HTMLElement>(contract.targets.searchField);
    if (!field || field.matches(contract.targets.inaccessibleAncestors)) {
      return undefined;
    }
    const ownedDisplay = uniqueOwnedElement<HTMLInputElement>(
      field,
      spec.displaySelector,
    );
    const hidden = uniqueOwnedElement<HTMLInputElement>(
      field,
      spec.hiddenSelector,
    );
    const results = uniqueOwnedElement<HTMLElement>(
      field,
      contract.targets.searchResults,
    );
    return ownedDisplay === display && hidden && results
      ? { display, hidden, results }
      : undefined;
  }

  function currentState(field: FixedSearchField): FieldState {
    return {
      snapshot: captureDomSnapshot(
        contract.behavior.snapshots["fixed-code-search"],
        {
          display: field.display,
          hidden: field.hidden,
          container: contract.targets.searchField
            ? field.display.closest<HTMLElement>(contract.targets.searchField)
            : undefined,
        },
      ),
      displayValue: field.display.value,
      hiddenValue: field.hidden.value,
      searchResult: field.display.getAttribute(
        contract.tokens.selectedLabelAttribute,
      ),
    };
  }

  function isConfirmed(field: FixedSearchField): boolean {
    return evaluatePlanConditions(
      contract.behavior.confirmations["fixed-code-search"],
      { display: field.display, hidden: field.hidden },
      { query: DISPLAY_NAME, code: EXPECTED_CODE },
    );
  }

  function isBlank(field: FixedSearchField): boolean {
    return evaluatePlanConditions(
      contract.behavior.confirmations.blank,
      { display: field.display, hidden: field.hidden },
      {},
    );
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
    field: FixedSearchField,
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

  function exactResultButtons(
    results: HTMLElement,
    query: string,
  ): HTMLButtonElement[] {
    const matches = Array.from(
      results.querySelectorAll<HTMLButtonElement>(
        contract.targets.searchResultButton,
      ),
    ).filter(
      (button) =>
        button.closest(contract.targets.searchResults) === results &&
        isVisibleAction(button) &&
        normalize(button.dataset[contract.behavior.datasetKeys.search]) ===
          query &&
        normalize(button.dataset[contract.behavior.datasetKeys.result]) ===
          query,
    );
    return matches.length === 1 &&
      matches[0]?.dataset[contract.behavior.datasetKeys.code] === EXPECTED_CODE
      ? matches
      : [];
  }

  function waitForFreshExactResult(
    document: Document,
    field: FixedSearchField,
    query: string,
    signal?: AbortSignal,
  ): Promise<HTMLButtonElement | undefined> {
    const view = document.defaultView;
    if (!view || signal?.aborted) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      let finished = false;
      let changed = false;
      const finish = (button: HTMLButtonElement | undefined) => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        view.clearTimeout(timeout);
        signal?.removeEventListener("abort", aborted);
        resolve(button);
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
        const matches = exactResultButtons(field.results, query);
        finish(matches.length === 1 ? matches[0] : undefined);
      };
      const observer = new view.MutationObserver(() => {
        changed = true;
        inspect();
      });
      observer.observe(field.results, {
        childList: contract.behavior.searchObservation.childList,
        subtree: contract.behavior.searchObservation.subtree,
      });
      const timeout = view.setTimeout(
        () => finish(undefined),
        SEARCH_TIMEOUT_MILLISECONDS,
      );
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

  async function runFixedCodeSearch(
    document: Document,
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (signal?.aborted || !verifiedItem(item, handle)) return false;
    const field = verifiedField(document, handle);
    if (!field) return false;
    if (isConfirmed(field)) return true;
    if (normalize(item.currentValue) !== normalize(field.display.value)) {
      return false;
    }
    if (!hiddenCodeRules(document).overwriteSelections && !isBlank(field))
      return false;

    const before = currentState(field);
    const result = await waitForFreshExactResult(
      document,
      field,
      DISPLAY_NAME,
      signal,
    );
    if (
      signal?.aborted ||
      !result ||
      !field.display.isConnected ||
      !field.hidden.isConnected ||
      !field.results.isConnected ||
      field.display.value !== DISPLAY_NAME ||
      field.hidden.value !== before.hiddenValue ||
      field.display.getAttribute(contract.tokens.selectedLabelAttribute) !==
        before.searchResult ||
      !result.isConnected ||
      result.closest(contract.targets.searchResults) !== field.results
    ) {
      restoreIfUnchanged(field, DISPLAY_NAME, before);
      return false;
    }

    result.click();
    const verifiedAfterClick = verifiedField(document, handle);
    if (
      verifiedAfterClick?.display !== field.display ||
      verifiedAfterClick.hidden !== field.hidden ||
      verifiedAfterClick.results !== field.results ||
      !isConfirmed(field)
    ) {
      restoreIfUnchanged(field, DISPLAY_NAME, before);
      return false;
    }
    return true;
  }

  return { runFixedCodeSearch };
}

export function createFixedCodeSearchModule(
  document: Document,
  contract: HiddenCodeContract,
) {
  return {
    runFixedCodeSearch: async (
      doc: Document,
      handle: FieldCandidateHandle,
      item: ReviewPlanItem,
      signal?: AbortSignal,
    ) => {
      const specs = contract.behavior.fixedCodeSearches.filter(
        (spec) =>
          spec.name === handle.candidate.domName &&
          spec.key === item.analysis?.valueBinding?.profileFieldKey,
      );
      if (specs.length !== 1) return false;
      const spec = specs[0];
      const label = item.profileValue
        ?.normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim();
      const code = label ? spec.options[label] : undefined;
      if (!label || !code) return false;
      return createFixedSearchRunner(doc, contract, spec, {
        label,
        code,
      }).runFixedCodeSearch(doc, handle, item, signal);
    },
  };
}
