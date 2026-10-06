import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { FailureReporter } from "../../write/failure";
import { greetingFieldLabel } from "./collection";
import { greetingText, greetingUsable } from "./write";
import { currentTrigger, mayMutate, waitFor } from "./workflow-controls";
import { ownedPopup, retainedSearchPopup } from "./workflow-popup";
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
  if (input.value && input.value !== item.profileValue) return false;
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
        return (
          !!checked[0].getAttribute("data-value") &&
          retainedPopup.usable(checked[0]) &&
          searchOptionLabel(checked[0]) === item.profileValue
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
            matchesSearchOption(input, node, item.profileValue!),
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
        input.value !== item.profileValue
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
          !matchesSearchOption(input, active[0], item.profileValue!) ||
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
    const selected = () => {
      if (!current() || input.value !== item.profileValue) return undefined;
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
        searchOptionLabel(checked[0]) === item.profileValue
        ? true
        : undefined;
    };
    success = !!(await waitFor(selected, signal));
    if (
      !success &&
      option.id &&
      current() &&
      input.value === item.profileValue &&
      input.getAttribute("aria-expanded") === "false" &&
      (await key("ArrowDown"))
    ) {
      success = !!(await waitFor(selected, signal, 5000));
    }
    return success;
  } finally {
    if (
      attemptedWrite &&
      !success &&
      (await mayMutate(signal, beforeMutation)) &&
      current() &&
      input.value === item.profileValue
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
