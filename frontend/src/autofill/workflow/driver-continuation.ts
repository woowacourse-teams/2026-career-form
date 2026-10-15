import type { FieldCandidateHandle } from "../dom/types";
import { labelOf } from "../dom/metadata";

/** Captures metadata, never values. Live registry checks remain mandatory. */
export function driverContinuationGuard(handle: FieldCandidateHandle): () => boolean {
  const elements = [...handle.elements, ...(handle.customElements ?? [])];
  const options = [...handle.optionElements.values()];
  const describe = () => JSON.stringify([
    elements.map(element => [element.tagName, element.id,
      element.getAttribute("name"), element.getAttribute("type"),
      element.getAttribute("role"), element.getAttribute("aria-label"),
      element.getAttribute("aria-labelledby"), element.getAttribute("placeholder"),
      // Custom combobox text is its changing value, not a field label.
      element instanceof HTMLInputElement || element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement ? labelOf(element) : undefined,
      element instanceof HTMLSelectElement ? [...element.options].map(option =>
        [option.value, option.textContent, option.disabled]) : undefined]),
    options.map(option => [option.textContent, option.getAttribute("value"),
      option.getAttribute("disabled"), option.getAttribute("aria-disabled")]),
  ]);
  const original = describe();
  return () => elements.every(element => element.isConnected) &&
    options.every(option => option.isConnected) && describe() === original;
}
