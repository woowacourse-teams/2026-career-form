import { runFlowProgram } from "../flow-plan";
import { componentCapability } from "../component-policy";
import { runDomPlan } from "../action-plan";
import { componentRules, componentName } from "../runtime-rules";
import { componentSelector } from "../component-dom";
import {
  componentPolicy,
  componentPattern,
} from "../../policy/component-policy";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { FailureReporter } from "../../write/failure";
import {
  matchesCatalogHighSchoolRegion,
  matchesCatalogInstitution,
  matchesCatalogLabel,
  normalizedCatalogLabel,
  verifiedSearchCatalogEntry,
} from "../../profile/catalog-identity";
import { componentFieldLabel } from "./collection";
import { componentText, componentUsable } from "./write";
import { currentTrigger, mayMutate, waitFor } from "./workflow-controls";
import { ownedPopup, retainedSearchPopup } from "./workflow-popup";
import { catalogApprovalForItem } from "../../profile/catalog-identity";
import {
  hasCatalogSelection,
  rememberCatalogSelection,
  retainedCatalogSelection,
} from "../../profile/catalog-receipt";

const receiptCleanup = new WeakMap<HTMLInputElement, () => void>();

function nameOnlySearch(input: HTMLInputElement): boolean {
  return (
    componentPolicy(input.ownerDocument).searchKinds.find((rule) =>
      new RegExp(rule.pattern).test(input.name),
    )?.matchMode === "NAME_ONLY"
  );
}

function rememberComponentSelection(
  input: HTMLInputElement,
  item: ReviewPlanItem,
  selected: {
    label: string;
    code: string;
    detail?: string;
    /** Visible option description re-checked on reopen; defaults to detail. */
    description?: string;
    /** Catalog label proven inside a site label such as "OPIc(영어)". */
    evidenceLabel?: string;
  },
): boolean {
  const popupId = input.getAttribute("aria-controls");
  const name = input.name;
  const url = input.ownerDocument.URL;
  const parent = input.parentElement;
  receiptCleanup.get(input)?.();
  let invalidated = false;
  const invalidate = () => {
    invalidated = true;
    input.removeEventListener("input", invalidate);
    input.removeEventListener("change", invalidate);
  };
  input.addEventListener("input", invalidate);
  input.addEventListener("change", invalidate);
  receiptCleanup.set(input, invalidate);
  const remembered = rememberCatalogSelection(item, {
    element: input,
    ...(nameOnlySearch(input)
      ? {
          matchesEvidence: (
            approval: import("../../profile/catalog-match").ApprovedCatalogMatch,
            evidence: import("../../profile/catalog-match").CatalogEvidence,
          ) =>
            approval.labels.some(
              (label) =>
                normalizedCatalogLabel(label) ===
                normalizedCatalogLabel(evidence.label),
            ),
        }
      : {}),
    evidence: {
      label: selected.evidenceLabel ?? selected.label,
      ...(selected.detail === undefined ? {} : { detail: selected.detail }),
    },
    verify: (target) => {
      if (
        !(target instanceof HTMLInputElement) ||
        invalidated ||
        !target.isConnected ||
        target.parentElement !== parent ||
        target.name !== name ||
        target.ownerDocument.URL !== url ||
        target.getAttribute("aria-controls") !== popupId ||
        target.value !== selected.label
      )
        return false;
      if (
        componentRules(target.ownerDocument).search.confirmationMode === "VALUE"
      )
        return true;
      const popups = [
        ...target.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
      ].filter((node) => node.id === popupId);
      // Closed Component forms menus are unmounted. Preserve the last observed code only
      // while the target is unchanged; reopening must expose that same code.
      if (
        !popups.length ||
        (componentRules(target.ownerDocument).search.closedPopup ===
          "HIDDEN_OR_UNMOUNTED" &&
          popups.every((node) => !componentUsable(node)))
      )
        return target.getAttribute("aria-expanded") === "false";
      const checked =
        popups.length === 1
          ? [
              ...popups[0].querySelectorAll<HTMLElement>(
                componentSelector(popups[0], "checkedItem"),
              ),
            ]
          : [];
      const valid =
        checked.length === 1 &&
        checked[0].getAttribute(
          componentPolicy(checked[0].ownerDocument).widget.optionCodeAttribute,
        ) === selected.code &&
        searchOptionLabel(checked[0]) === selected.label &&
        (selected.detail === undefined ||
          normalizedCatalogLabel(
            checked[0].querySelector(
              componentSelector(checked[0], "optionDetail"),
            )?.textContent ?? "",
          ) ===
            normalizedCatalogLabel(selected.description ?? selected.detail));
      if (!valid) invalidate();
      return valid;
    },
  });
  if (!remembered) invalidate();
  return remembered;
}

function scopedSearchRule(input: HTMLInputElement) {
  return (componentPolicy(input.ownerDocument).scopedSearches ?? []).find(
    (rule) => rule.name === input.name,
  );
}
function scopedSearch(input: HTMLInputElement): boolean {
  const rule = scopedSearchRule(input);
  return (
    !!rule &&
    componentFieldLabel(input) === rule.label &&
    (!rule.excludeRows || !input.closest(componentSelector(input, "row"))) &&
    input.ownerDocument.querySelectorAll(`[name="${CSS.escape(rule.name)}"]`)
      .length === rule.count
  );
}

function searchOptionLabel(option: HTMLElement): string {
  const copy = option.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll(componentSelector(copy, "optionDecoration"))
    .forEach((node) => node.remove());
  return componentText(copy);
}
/** Visible language chosen in the same Component forms exam row, if any. */
function rowLanguage(input: HTMLInputElement): string | undefined {
  const row = componentPattern(input.ownerDocument, "examRow").exec(input.name);
  if (!row) return undefined;
  const triggers = [
    ...input.ownerDocument.querySelectorAll<HTMLElement>("[name]"),
  ].filter(
    (node) =>
      node.getAttribute("name") ===
      componentName(
        input.ownerDocument,
        row[1],
        componentPolicy(input.ownerDocument).languageSuffix,
      ),
  );
  const trigger = triggers[0];
  if (
    triggers.length !== 1 ||
    !trigger ||
    !componentUsable(trigger) ||
    trigger.hasAttribute(
      componentPolicy(input.ownerDocument).widget.searchPlaceholderAttribute,
    )
  )
    return undefined;
  const text = componentText(trigger);
  return text &&
    !text.includes(
      componentPolicy(input.ownerDocument).widget.languagePlaceholder,
    )
    ? text
    : undefined;
}
/** The single visible description of one option; "" when none is rendered. */
function optionDescription(option: HTMLElement): string | undefined {
  const descriptions = option.querySelectorAll<HTMLElement>(
    componentSelector(option, "optionDetail"),
  );
  if (descriptions.length === 0) return "";
  return descriptions.length === 1 && componentUsable(descriptions[0])
    ? componentText(descriptions[0])
    : undefined;
}
function canCreateSearch(input: HTMLInputElement): boolean {
  return componentPattern(input.ownerDocument, "directSearch").test(input.name);
}
function matchesSearchOption(
  input: HTMLInputElement,
  option: HTMLElement,
  value: string,
): boolean {
  const code = option.getAttribute(
    componentPolicy(option.ownerDocument).widget.optionCodeAttribute,
  );
  if (code === componentPolicy(input.ownerDocument).directSearch.code)
    return (
      canCreateSearch(input) &&
      searchOptionLabel(option) ===
        `${componentPolicy(input.ownerDocument).directSearch.labelPrefix}${value}${componentPolicy(input.ownerDocument).directSearch.labelSuffix}`
    );
  return searchOptionLabel(option) === value;
}

export async function search(
  input: HTMLElement,
  item: ReviewPlanItem,
  signal: AbortSignal,
  handle: FieldCandidateHandle,
  beforeMutation?: () => Promise<boolean>,
  report?: FailureReporter,
): Promise<boolean> {
  if (!componentCapability(input.ownerDocument, "search")) return false;
  if (
    !(input instanceof HTMLInputElement) ||
    input.readOnly ||
    !input.matches(componentSelector(input, "searchInput")) ||
    (!componentPattern(input.ownerDocument, "searchField").test(input.name) &&
      !scopedSearch(input))
  )
    return false;
  if (catalogApprovalForItem(item).status === "invalid") return false;
  const selectedIdentity = item.searchIdentity?.status === "selected";
  const catalog = selectedIdentity
    ? verifiedSearchCatalogEntry(
        item.searchIdentity!,
        item.profileFieldKey,
        item.profileValue,
      )
    : undefined;
  if (selectedIdentity && !catalog) return false;
  if (catalog) {
    const inputKind = componentPolicy(input.ownerDocument).searchKinds.find(
      (rule) => new RegExp(rule.pattern).test(input.name),
    )?.kind;
    if (catalog.kind !== inputKind) return false;
  }
  const language =
    catalog &&
    componentRules(input.ownerDocument).search.languageQualifierKinds.includes(
      catalog.kind,
    )
      ? rowLanguage(input)
      : undefined;
  // Component forms qualifies some exams by the row's language, e.g. "OPIc(영어)".
  const catalogLabelOf = (label: string): string | undefined => {
    if (!catalog) return undefined;
    if (matchesCatalogLabel(catalog, label)) return label;
    const suffix = language
      ? componentRules(
          input.ownerDocument,
        ).search.languageSuffixTemplate.replaceAll("{language}", language)
      : undefined;
    if (!suffix || !label.endsWith(suffix)) return undefined;
    const base = label.slice(0, -suffix.length).trim();
    return base && matchesCatalogLabel(catalog, base) ? base : undefined;
  };
  const matchesOption = (option: HTMLElement) => {
    if (!catalog) return matchesSearchOption(input, option, item.profileValue!);
    if (
      option.getAttribute(
        componentPolicy(option.ownerDocument).widget.optionCodeAttribute,
      ) === componentPolicy(input.ownerDocument).directSearch.code ||
      catalogLabelOf(searchOptionLabel(option)) === undefined
    )
      return false;
    if (nameOnlySearch(input) || !catalog.detail) return true;
    if (
      !option.querySelector(componentSelector(option, "optionDetail")) &&
      matchesCatalogInstitution(catalog, searchOptionLabel(option))
    )
      return true;
    const description = optionDescription(option);
    return (
      !!catalog.detail &&
      description !== undefined &&
      (normalizedCatalogLabel(description) ===
        normalizedCatalogLabel(catalog.detail) ||
        matchesCatalogHighSchoolRegion(
          catalog,
          searchOptionLabel(option),
          description,
        ))
    );
  };
  if (
    input.value &&
    input.value !== item.profileValue &&
    !(catalog && catalogLabelOf(input.value) !== undefined)
  )
    return false;
  let expectedValue = item.profileValue;
  const popupId = input.getAttribute("aria-controls");
  const current = () =>
    currentTrigger(handle, item, input, signal) &&
    !input.readOnly &&
    (!scopedSearchRule(input) || scopedSearch(input)) &&
    input.getAttribute("aria-controls") === popupId;
  if (!current()) return false;
  const original = input.value;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return false;
  let success = false;
  let attemptedWrite = false;
  try {
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      input.value !== original
    )
      return false;
    if (
      original &&
      componentRules(input.ownerDocument).search.confirmationMode === "VALUE"
    ) {
      success =
        current() &&
        (original === item.profileValue ||
          !!(catalog && catalogLabelOf(original)));
      if (success && catalog)
        success = rememberComponentSelection(input, item, {
          label: original,
          evidenceLabel: catalogLabelOf(original),
          code: "",
          ...(nameOnlySearch(input) || !catalog.detail
            ? {}
            : { detail: catalog.detail }),
        });
      return success;
    }
    if (original) {
      // Component forms unmounts closed search popups. Reopen the existing selection
      // without issuing another input event or choosing a different result.
      if (!retainedSearchPopup(input)) {
        if (
          !runDomPlan(
            componentPolicy(input.ownerDocument).actionPlans.searchReopen,
            { input },
            {},
            () => current() && input.value === original,
          )
        )
          return false;
      }
      if (!current() || input.value !== original) return false;
      let emptyList = false;
      let retainedCode: string | undefined;
      let retainedDescription: string | undefined;
      const retained = await waitFor(
        () => {
          if (!current() || input.value !== original) return false;
          const retainedPopup = retainedSearchPopup(input);
          if (!retainedPopup) return undefined;
          emptyList = !retainedPopup.popup.querySelector(
            componentSelector(retainedPopup.popup, "searchItem"),
          );
          const checked = [
            ...retainedPopup.popup.querySelectorAll<HTMLElement>(
              componentSelector(retainedPopup.popup, "checkedSearchItem"),
            ),
          ];
          if (checked.length > 1) return false;
          if (checked.length === 0) return undefined;
          const verified =
            !!checked[0].getAttribute(
              componentPolicy(checked[0].ownerDocument).widget
                .optionCodeAttribute,
            ) &&
            retainedPopup.usable(checked[0]) &&
            searchOptionLabel(checked[0]) === original &&
            matchesOption(checked[0]);
          if (verified) {
            retainedCode =
              checked[0].getAttribute(
                componentPolicy(checked[0].ownerDocument).widget
                  .optionCodeAttribute,
              ) ?? undefined;
            retainedDescription = optionDescription(checked[0]);
          }
          return (
            verified &&
            (!catalog ||
              !hasCatalogSelection(input) ||
              retainedCatalogSelection(item, input) === original)
          );
        },
        signal,
        input.ownerDocument,
      );
      // Some Component forms forms reopen an exact value without rendering options.
      if (retained === undefined && emptyList && original === item.profileValue)
        report?.("SEARCH_SELECTION_UNVERIFIED");
      if (
        retained !== true ||
        !(await mayMutate(signal, beforeMutation)) ||
        !current() ||
        input.value !== original
      )
        return false;
      const flows = componentPolicy(input.ownerDocument).searchFlows;
      const linked = () =>
        [...input.ownerDocument.querySelectorAll<HTMLElement>("[id]")].filter(
          (node) => node.id === popupId,
        );
      const completed = await runFlowProgram(
        flows.program,
        flows.retainedCompletion,
        {
          targets: { input },
          values: {
            closedPopup: componentRules(input.ownerDocument).search.closedPopup,
          },
          facts: {
            linkedPopupMissing: () => linked().length === 0,
            linkedPopupsHidden: () =>
              linked().every((node) => !componentUsable(node)),
          },
          current: () => current() && input.value === original,
        },
      );
      if (!completed) return false;
      success = current() && input.value === original;
      if (success && catalog) {
        success =
          !!retainedCode &&
          rememberComponentSelection(input, item, {
            label: original,
            evidenceLabel: catalogLabelOf(original),
            code: retainedCode,
            ...(nameOnlySearch(input) || !catalog.detail
              ? {}
              : {
                  detail: catalog.detail,
                  description: retainedDescription,
                }),
          });
      }
      return success;
    }
    const plans = componentPolicy(input.ownerDocument).actionPlans;
    if (
      !runDomPlan(
        plans.searchActivate,
        { input },
        {},
        () => current() && input.value === original,
      )
    )
      return false;
    attemptedWrite = true;
    if (
      !runDomPlan(
        plans.searchWrite,
        { input },
        { value: item.profileValue! },
        current,
      )
    )
      return false;
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      input.value !== item.profileValue ||
      input.ownerDocument.activeElement !== input
    )
      return false;
    if (
      !runDomPlan(
        plans.searchOpen,
        { input },
        {},
        () => current() && input.value === item.profileValue,
      )
    )
      return false;
    let popup = await waitFor(
      () => ownedPopup(input),
      signal,
      input.ownerDocument,
      componentRules(input.ownerDocument).timeouts.searchMs,
    );
    if (
      !current() ||
      input.value !== item.profileValue ||
      !popup?.matches(componentSelector(popup, "openSearchPopup"))
    )
      return false;
    // Coded options the list last rendered, matching or not: a rendered list
    // without a choosable option is a "no exact match", not a silent failure.
    let listed = 0;
    let everListed = 0;
    let sawOpenPopup = false;
    const option = await waitFor(
      () => {
        const livePopup = ownedPopup(input);
        if (
          !livePopup?.matches(componentSelector(livePopup, "openSearchPopup"))
        )
          return undefined;
        sawOpenPopup = true;
        popup = livePopup;
        const coded = [
          ...popup.querySelectorAll<HTMLElement>(
            componentSelector(popup, "codedSearchItem"),
          ),
        ].filter(
          (node) =>
            componentUsable(node) &&
            !!node.getAttribute(
              componentPolicy(node.ownerDocument).widget.optionCodeAttribute,
            ),
        );
        listed = coded.length;
        everListed = Math.max(everListed, listed);
        const options = coded.filter((node) => matchesOption(node));
        const canonical = options.filter(
          (node) =>
            node.getAttribute(
              componentPolicy(node.ownerDocument).widget.optionCodeAttribute,
            ) !== componentPolicy(input.ownerDocument).directSearch.code,
        );
        const preferred =
          componentRules(input.ownerDocument).search.preferCatalogOptions &&
          canonical.length
            ? canonical
            : options;
        return preferred.length === 1
          ? preferred[0]
          : preferred.length > 1
            ? null
            : undefined;
      },
      signal,
      input.ownerDocument,
      componentRules(input.ownerDocument).timeouts.searchMs,
    );
    if (!option && current() && input.value === item.profileValue) {
      // Several exact canonical options; a list of similar names whose create
      // option (if any) this field may not use; a client-side filter that
      // emptied a rendered list; or a list that never rendered in time.
      if (option === null) report?.("SEARCH_AMBIGUOUS");
      else if (listed > 0) report?.("SEARCH_NO_EXACT_MATCH");
      else if (everListed > 0) report?.("SEARCH_NO_RESULTS");
      else if (sawOpenPopup) report?.("SEARCH_TIMEOUT");
    }
    if (
      !option ||
      !current() ||
      input.value !== item.profileValue ||
      ownedPopup(input) !== popup ||
      !componentUsable(option)
    )
      return false;
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      input.value !== item.profileValue ||
      ownedPopup(input) !== popup ||
      !componentUsable(option)
    )
      return false;
    const selectedId = option.getAttribute(
      componentPolicy(option.ownerDocument).widget.optionCodeAttribute,
    );
    const key = async (value: "ArrowDown" | "Enter") => {
      if (
        !(await mayMutate(signal, beforeMutation)) ||
        !current() ||
        input.value !== expectedValue
      )
        return false;
      if (value === "Enter") {
        const active = [
          ...(ownedPopup(input)?.querySelectorAll<HTMLElement>(
            componentSelector(ownedPopup(input), "searchOption"),
          ) ?? []),
        ].filter(
          (node) => node.id === input.getAttribute("aria-activedescendant"),
        );
        if (
          active.length !== 1 ||
          active[0].id !== option.id ||
          active[0].getAttribute(
            componentPolicy(active[0].ownerDocument).widget.optionCodeAttribute,
          ) !== selectedId ||
          !matchesOption(active[0]) ||
          !componentUsable(active[0])
        )
          return false;
      }
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: value,
          code: value,
          bubbles: true,
        }),
      );
      input.dispatchEvent(
        new KeyboardEvent("keyup", { key: value, code: value, bubbles: true }),
      );
      return true;
    };
    if (
      option.id &&
      componentRules(input.ownerDocument).search.selectionMode ===
        "KEYBOARD_WHEN_IDENTIFIED"
    ) {
      const count = popup.querySelectorAll(
        componentSelector(popup, "searchOption"),
      ).length;
      const navigationLimit =
        scopedSearchRule(input)?.navigationLimit ??
        componentPolicy(input.ownerDocument).directSearch.normalNavigationLimit;
      for (
        let step = 0;
        input.getAttribute("aria-activedescendant") !== option.id &&
        step < Math.min(count + 1, navigationLimit);
        step++
      ) {
        const previous = input.getAttribute("aria-activedescendant");
        if (!(await key("ArrowDown"))) return false;
        const changed = await waitFor(
          () => {
            const active = input.getAttribute("aria-activedescendant");
            return active && active !== previous ? true : undefined;
          },
          signal,
          input.ownerDocument,
          componentRules(input.ownerDocument).timeouts.navigationMs,
        );
        if (!changed) return false;
      }
      if (!(await key("Enter"))) return false;
    } else {
      option.click();
    }
    expectedValue = catalog ? searchOptionLabel(option) : item.profileValue;
    const selected = () => {
      if (!current() || input.value !== expectedValue) return undefined;
      if (
        componentRules(input.ownerDocument).search.confirmationMode === "VALUE"
      )
        return true;
      const popups = [
        ...input.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
      ].filter(
        (node) =>
          node.id === popupId &&
          node.matches(componentSelector(node, "searchPopup")),
      );
      if (popups.length !== 1) return undefined;
      const checked = [
        ...popups[0].querySelectorAll<HTMLElement>(
          componentSelector(popups[0], "checkedSearchItem"),
        ),
      ];
      return checked.length === 1 &&
        checked[0].getAttribute(
          componentPolicy(checked[0].ownerDocument).widget.optionCodeAttribute,
        ) ===
          (selectedId === componentPolicy(input.ownerDocument).directSearch.code
            ? componentPolicy(input.ownerDocument)
                .widget.directCodeTemplate.replace(
                  "{code}",
                  componentPolicy(input.ownerDocument).directSearch.code,
                )
                .replace("{value}", () => item.profileValue ?? "")
            : selectedId) &&
        searchOptionLabel(checked[0]) === expectedValue &&
        matchesOption(checked[0])
        ? true
        : undefined;
    };
    success = !!(await waitFor(selected, signal, input.ownerDocument));
    const flows = componentPolicy(input.ownerDocument).searchFlows;
    success = await runFlowProgram(flows.program, flows.afterSelection, {
      targets: { input },
      values: {
        success: String(success),
        expected: expectedValue!,
        optionId: option.id,
        selectionMode: componentRules(input.ownerDocument).search.selectionMode,
      },
      facts: { selectionConfirmed: () => selected() === true },
      current,
      authorize: () => mayMutate(signal, beforeMutation),
    });
    if (success && catalog) {
      success =
        !!selectedId &&
        rememberComponentSelection(input, item, {
          label: input.value,
          evidenceLabel: catalogLabelOf(input.value),
          code: selectedId,
          ...(nameOnlySearch(input) || !catalog.detail
            ? {}
            : {
                detail: catalog.detail,
                description: optionDescription(option),
              }),
        });
    }
    return success;
  } finally {
    if (current()) {
      const flows = componentPolicy(input.ownerDocument).searchFlows;
      const completed = await runFlowProgram(flows.program, flows.cleanup, {
        targets: { input },
        values: {
          attempted: String(attemptedWrite),
          success: String(success),
          original,
          expected: expectedValue!,
          desired: item.profileValue!,
        },
        current,
        authorize: () => mayMutate(signal, beforeMutation),
      });
      if (!completed) return false;
    }
  }
}
