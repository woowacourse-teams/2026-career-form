import type { OptionSelectionResult } from "./executor";

function usable(element: Element): boolean {
  if (
    !element.isConnected ||
    element.matches(":disabled, [readonly]") ||
    element.closest(
      "[hidden], [inert], [aria-hidden='true'], [aria-disabled='true']",
    )
  )
    return false;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      style?.display === "none" ||
      ["hidden", "collapse"].includes(style?.visibility ?? "")
    )
      return false;
  }
  return true;
}

function uniqueOption(
  element: HTMLSelectElement,
  label: string,
): HTMLOptionElement | undefined {
  const options = Array.from(element.options);
  const matches = options.filter(
    (option) => option.textContent?.trim() === label,
  );
  if (matches.length !== 1) return undefined;
  const option = matches[0];
  return option.value &&
    usable(option) &&
    options.filter((candidate) => candidate.value === option.value).length === 1
    ? option
    : undefined;
}

/** Company-specific code contracts must pass the adapter gate before this boundary. */
export function selectNativeProfileOption(
  element: HTMLSelectElement,
  value: string,
  adapterAllowsSelection?: boolean,
): OptionSelectionResult {
  if (adapterAllowsSelection === false || !usable(element))
    return "action-not-ready";
  const option = uniqueOption(element, value);
  if (!option) return "option-label-mismatch";
  const code = option.value;
  if (element.value && element.value !== code) return "action-not-ready";
  if (element.value === code && element.selectedOptions[0] === option)
    return "selected";
  element.value = code;
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return usable(element) &&
    uniqueOption(element, value) === option &&
    element.value === code &&
    element.selectedOptions[0] === option
    ? "selected"
    : "action-not-ready";
}
