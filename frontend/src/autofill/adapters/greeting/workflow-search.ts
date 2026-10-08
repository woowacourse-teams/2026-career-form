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
import { greetingFieldLabel } from "./collection";
import { greetingText, greetingUsable } from "./write";
import { currentTrigger, mayMutate, waitFor } from "./workflow-controls";
import { ownedPopup, retainedSearchPopup } from "./workflow-popup";
import { catalogApprovalForItem } from "../../profile/catalog-identity";
import {
  hasCatalogSelection,
  rememberCatalogSelection,
  retainedCatalogSelection,
} from "../../profile/catalog-receipt";

const receiptCleanup = new WeakMap<HTMLInputElement, () => void>();

function rememberGreetingSelection(
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
      const popups = [
        ...target.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
      ].filter((node) => node.id === popupId);
      // Closed Greeting menus are unmounted. Preserve the last observed code only
      // while the target is unchanged; reopening must expose that same code.
      if (!popups.length)
        return target.getAttribute("aria-expanded") === "false";
      const checked =
        popups.length === 1
          ? [
              ...popups[0].querySelectorAll<HTMLElement>(
                '[data-part="item"][role="option"][data-state="checked"]',
              ),
            ]
          : [];
      const valid =
        checked.length === 1 &&
        checked[0].getAttribute("data-value") === selected.code &&
        searchOptionLabel(checked[0]) === selected.label &&
        (selected.detail === undefined ||
          normalizedCatalogLabel(
            checked[0].querySelector('[data-part="item-description"]')
              ?.textContent ?? "",
          ) ===
            normalizedCatalogLabel(selected.description ?? selected.detail));
      if (!valid) invalidate();
      return valid;
    },
  });
  if (!remembered) invalidate();
  return remembered;
}

function nationalitySearch(input: HTMLInputElement): boolean {
  return (
    input.name === "basicInformation.nationalityCode" &&
    greetingFieldLabel(input) === "국적" &&
    !input.closest('[data-scope="accordion"][data-part="item"]') &&
    input.ownerDocument.querySelectorAll(
      '[name="basicInformation.nationalityCode"]',
    ).length === 1
  );
}

function searchOptionLabel(option: HTMLElement): string {
  const copy = option.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll(
      '[data-part="item-description"], [data-part="item-indicator"]',
    )
    .forEach((node) => node.remove());
  return greetingText(copy);
}
/** Visible language chosen in the same Greeting exam row, if any. */
function rowLanguage(input: HTMLInputElement): string | undefined {
  const row =
    /^(languagesCertificationsAndOtherActivity\.certifiedLanguageTests\.\d+)\.testName$/.exec(
      input.name,
    );
  if (!row) return undefined;
  const triggers = [
    ...input.ownerDocument.querySelectorAll<HTMLElement>("[name]"),
  ].filter((node) => node.getAttribute("name") === `${row[1]}.foreignLanguage`);
  const trigger = triggers[0];
  if (
    triggers.length !== 1 ||
    !trigger ||
    !greetingUsable(trigger) ||
    trigger.hasAttribute("data-placeholder-shown")
  )
    return undefined;
  const text = greetingText(trigger);
  return text && !text.includes("선택") ? text : undefined;
}
/** The single visible description of one option; "" when none is rendered. */
function optionDescription(option: HTMLElement): string | undefined {
  const descriptions = option.querySelectorAll<HTMLElement>(
    '[data-part="item-description"]',
  );
  if (descriptions.length === 0) return "";
  return descriptions.length === 1 && greetingUsable(descriptions[0])
    ? greetingText(descriptions[0])
    : undefined;
}
function canCreateSearch(input: HTMLInputElement): boolean {
  return /^(?:educationalBackground\.highSchool\.schoolName|workHistory\.workExperiences\.\d+\.companyName|languagesCertificationsAndOtherActivity\.certificatesLicenses\.\d+\.credentials)$/.test(
    input.name,
  );
}
function matchesSearchOption(
  input: HTMLInputElement,
  option: HTMLElement,
  value: string,
): boolean {
  const code = option.getAttribute("data-value");
  if (code === "[[new]]")
    return (
      canCreateSearch(input) &&
      searchOptionLabel(option) === `직접 입력하기:“${value}”`
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
  if (
    !(input instanceof HTMLInputElement) ||
    input.readOnly ||
    !input.matches(
      '[data-scope="combobox"][data-part="input"][role="combobox"][aria-controls]',
    ) ||
    (!/^(?:educationalBackground\.(?:(?:universities|graduateSchools)\.\d+\.(?:schoolName|majors\.\d+)|highSchool\.schoolName)|workHistory\.workExperiences\.\d+\.companyName|languagesCertificationsAndOtherActivity\.(?:certifiedLanguageTests\.\d+\.testName|certificatesLicenses\.\d+\.credentials))$/.test(
      input.name,
    ) &&
      !nationalitySearch(input))
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
    const inputKind =
      /^languagesCertificationsAndOtherActivity\.certificatesLicenses\.\d+\.credentials$/.test(
        input.name,
      )
        ? "certificate"
        : /^languagesCertificationsAndOtherActivity\.certifiedLanguageTests\.\d+\.testName$/.test(
              input.name,
            )
          ? "languageTest"
          : input.name === "educationalBackground.highSchool.schoolName"
            ? "highSchool"
            : /^educationalBackground\.universities\.\d+\.schoolName$/.test(
                  input.name,
                )
              ? "university"
              : /^educationalBackground\.graduateSchools\.\d+\.schoolName$/.test(
                    input.name,
                  )
                ? "graduateSchool"
                : undefined;
    if (catalog.kind !== inputKind) return false;
  }
  const language =
    catalog?.kind === "languageTest" ? rowLanguage(input) : undefined;
  // Greeting qualifies some exams by the row's language, e.g. "OPIc(영어)".
  const catalogLabelOf = (label: string): string | undefined => {
    if (!catalog) return undefined;
    if (matchesCatalogLabel(catalog, label)) return label;
    const suffix = language ? `(${language})` : undefined;
    if (!suffix || !label.endsWith(suffix)) return undefined;
    const base = label.slice(0, -suffix.length).trim();
    return base && matchesCatalogLabel(catalog, base) ? base : undefined;
  };
  const matchesOption = (option: HTMLElement) => {
    if (!catalog) return matchesSearchOption(input, option, item.profileValue!);
    if (
      option.getAttribute("data-value") === "[[new]]" ||
      catalogLabelOf(searchOptionLabel(option)) === undefined
    )
      return false;
    if (catalog.kind === "certificate" || catalog.kind === "languageTest")
      return true;
    if (
      !option.querySelector('[data-part="item-description"]') &&
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
    (input.name !== "basicInformation.nationalityCode" ||
      nationalitySearch(input)) &&
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
    if (original) {
      // Greeting unmounts closed search popups. Reopen the existing selection
      // without issuing another input event or choosing a different result.
      if (!retainedSearchPopup(input)) {
        input.focus();
        if (!current() || input.value !== original) return false;
        input.click();
      }
      if (!current() || input.value !== original) return false;
      let emptyList = false;
      let retainedCode: string | undefined;
      let retainedDescription: string | undefined;
      const retained = await waitFor(() => {
        if (!current() || input.value !== original) return false;
        const retainedPopup = retainedSearchPopup(input);
        if (!retainedPopup) return undefined;
        emptyList = !retainedPopup.popup.querySelector(
          '[data-scope="combobox"][data-part="item"]',
        );
        const checked = [
          ...retainedPopup.popup.querySelectorAll<HTMLElement>(
            '[data-scope="combobox"][data-part="item"][role="option"][data-state="checked"]',
          ),
        ];
        if (checked.length > 1) return false;
        if (checked.length === 0) return undefined;
        const verified =
          !!checked[0].getAttribute("data-value") &&
          retainedPopup.usable(checked[0]) &&
          searchOptionLabel(checked[0]) === original &&
          matchesOption(checked[0]);
        if (verified) {
          retainedCode = checked[0].getAttribute("data-value") ?? undefined;
          retainedDescription = optionDescription(checked[0]);
        }
        return (
          verified &&
          (!catalog ||
            !hasCatalogSelection(input) ||
            retainedCatalogSelection(item, input) === original)
        );
      }, signal);
      // Some Greeting forms reopen an exact value without rendering options.
      if (retained === undefined && emptyList && original === item.profileValue)
        report?.("SEARCH_SELECTION_UNVERIFIED");
      if (
        retained !== true ||
        !(await mayMutate(signal, beforeMutation)) ||
        !current() ||
        input.value !== original
      )
        return false;
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      const closed = await waitFor(() => {
        if (!current() || input.value !== original) return false;
        if (input.getAttribute("aria-expanded") !== "false") return undefined;
        const linked = [
          ...input.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
        ].filter((node) => node.id === popupId);
        return linked.length === 0 ? true : undefined;
      }, signal);
      if (closed !== true) return false;
      input.blur();
      success = current() && input.value === original;
      if (success && catalog) {
        success =
          !!retainedCode &&
          rememberGreetingSelection(input, item, {
            label: original,
            evidenceLabel: catalogLabelOf(original),
            code: retainedCode,
            ...(catalog.kind === "certificate" ||
            catalog.kind === "languageTest"
              ? {}
              : {
                  detail: catalog.detail,
                  description: retainedDescription,
                }),
          });
      }
      return success;
    }
    input.focus();
    input.click();
    if (!current() || input.value !== original) return false;
    attemptedWrite = true;
    setter.call(input, item.profileValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      input.value !== item.profileValue ||
      input.ownerDocument.activeElement !== input
    )
      return false;
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    let popup = await waitFor(() => ownedPopup(input), signal, 5000);
    if (
      !current() ||
      input.value !== item.profileValue ||
      !popup?.matches(
        '[data-scope="scroll-area"][data-part="viewport"][role="presentation"][data-state="open"]',
      )
    )
      return false;
    const option = await waitFor(
      () => {
        const livePopup = ownedPopup(input);
        if (
          !livePopup?.matches(
            '[data-scope="scroll-area"][data-part="viewport"][role="presentation"][data-state="open"]',
          )
        )
          return undefined;
        popup = livePopup;
        const options = [
          ...popup.querySelectorAll<HTMLElement>(
            '[data-scope="combobox"][data-part="item"][role="option"][data-value]',
          ),
        ].filter(
          (node) =>
            greetingUsable(node) &&
            !!node.getAttribute("data-value") &&
            matchesOption(node),
        );
        const canonical = options.filter(
          (node) => node.getAttribute("data-value") !== "[[new]]",
        );
        const preferred = canonical.length ? canonical : options;
        return preferred.length === 1
          ? preferred[0]
          : preferred.length > 1
            ? null
            : undefined;
      },
      signal,
      5000,
    );
    if (
      !option ||
      !current() ||
      input.value !== item.profileValue ||
      ownedPopup(input) !== popup ||
      !greetingUsable(option)
    )
      return false;
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      input.value !== item.profileValue ||
      ownedPopup(input) !== popup ||
      !greetingUsable(option)
    )
      return false;
    const selectedId = option.getAttribute("data-value");
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
            '[data-scope="combobox"][data-part="item"][role="option"]',
          ) ?? []),
        ].filter(
          (node) => node.id === input.getAttribute("aria-activedescendant"),
        );
        if (
          active.length !== 1 ||
          active[0].id !== option.id ||
          active[0].getAttribute("data-value") !== selectedId ||
          !matchesOption(active[0]) ||
          !greetingUsable(active[0])
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
    if (option.id) {
      const count = popup.querySelectorAll(
        '[data-scope="combobox"][data-part="item"][role="option"]',
      ).length;
      const navigationLimit = nationalitySearch(input) ? 256 : 128;
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
          250,
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
      const popups = [
        ...input.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
      ].filter(
        (node) =>
          node.id === popupId &&
          node.matches(
            '[data-scope="scroll-area"][data-part="viewport"][role="presentation"]',
          ),
      );
      if (popups.length !== 1) return undefined;
      const checked = [
        ...popups[0].querySelectorAll<HTMLElement>(
          '[data-scope="combobox"][data-part="item"][role="option"][data-state="checked"]',
        ),
      ];
      return checked.length === 1 &&
        checked[0].getAttribute("data-value") ===
          (selectedId === "[[new]]"
            ? `[[new]]-${item.profileValue}`
            : selectedId) &&
        searchOptionLabel(checked[0]) === expectedValue &&
        matchesOption(checked[0])
        ? true
        : undefined;
    };
    success = !!(await waitFor(selected, signal));
    if (
      !success &&
      option.id &&
      current() &&
      input.value === expectedValue &&
      input.getAttribute("aria-expanded") === "false" &&
      (await key("ArrowDown"))
    ) {
      success = !!(await waitFor(selected, signal, 5000));
    }
    if (success && catalog) {
      success =
        !!selectedId &&
        rememberGreetingSelection(input, item, {
          label: input.value,
          evidenceLabel: catalogLabelOf(input.value),
          code: selectedId,
          ...(catalog.kind === "certificate" || catalog.kind === "languageTest"
            ? {}
            : {
                detail: catalog.detail,
                description: optionDescription(option),
              }),
        });
    }
    return success;
  } finally {
    if (
      attemptedWrite &&
      !success &&
      (await mayMutate(signal, beforeMutation)) &&
      current() &&
      (input.value === item.profileValue || input.value === expectedValue)
    ) {
      setter.call(input, original);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (
      (await mayMutate(signal, beforeMutation)) &&
      current() &&
      input.getAttribute("aria-expanded") === "true"
    )
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
  }
}
