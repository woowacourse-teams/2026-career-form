import { basicValue } from "../adapters/hplace/basic-write";
import { runtimeRules } from "../policy/runtime-rules";
import type { FieldCandidateHandle } from "./types";
import { dropdownValue } from "./button-dropdown";
import { registrationValue } from "../adapters/hplace/registration";

/** Reads only custom controls already bound by the collector. */
export function customFieldValue(
  handle: FieldCandidateHandle,
): string | undefined {
  const basic = basicValue(handle);
  if (basic !== undefined) return basic;
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
