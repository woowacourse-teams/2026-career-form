import { committedSearchValue } from "../policy/committed-search";
import { basicValue } from "../adapters/hplace/basic-write";
import { runtimeRules } from "../policy/runtime-rules";
import type { FieldCandidateHandle } from "./types";
import { dropdownValue } from "./button-dropdown";
import { registrationValue } from "../adapters/hplace/registration";
import { v1Value } from "../adapters/hplace/v1-basic-controls";
import { v1HistoryValue } from "../adapters/hplace/v1-history-controls";

/** Reads only custom controls already bound by the collector. */
export function customFieldValue(
  handle: FieldCandidateHandle,
): string | undefined {
  const search = committedSearchValue(handle);
  if (search !== undefined) return search;
  const basic = basicValue(handle);
  if (basic !== undefined) return basic;
  const v1 = v1Value(handle);
  if (v1 !== undefined) return v1;
  const history = v1HistoryValue(handle);
  if (history !== undefined) return history;
  const registration = registrationValue(handle);
  if (registration !== undefined) return registration;
  if (handle.buttonDropdown) return dropdownValue(handle.buttonDropdown);
  const element = handle.customElements?.[0];
  if (!element) return undefined;
  if (
    handle.candidate.control === "radio" ||
    handle.candidate.control === "checkbox"
  ) {
    return (handle.candidate.options ?? [])
      .filter(
        (option) =>
          handle.optionElements
            .get(option.optionId)
            ?.getAttribute("aria-checked") === "true",
      )
      .map((option) => option.displayName)
      .join(", ");
  }
  const value = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const placeholder = (
    runtimeRules(element.ownerDocument)?.placeholderAttributes ?? []
  ).some((name) => {
    const marker = element.getAttribute(name);
    return marker !== null && marker !== "false";
  });
  return placeholder ||
    runtimeRules(element.ownerDocument)?.placeholderValues.includes(value)
    ? ""
    : value;
}
