import { stagedAddressReceipt } from "../policy/staged-address-receipt";
import { v1HistoryPickedValue } from "../adapters/hplace/v1-history-controls";
import { v1ExtraPickedValue } from "../adapters/hplace/v1-extra-controls";
import { componentEmploymentStatusValue } from "../policy/components/write";
import { customFieldValue } from "../dom/custom-field-value";
import {
  hasVisibleWriteElement,
  isVisibleWriteElement,
  readbackWriteElement,
} from "../dom/write-target";
import type { CandidateRegistry } from "../dom/candidate-registry";

export function resultFieldState(
  registry: CandidateRegistry | undefined,
  pageDocument: Document,
  id: string,
) {
  const lookup = registry?.lookupField(id);
  if (!lookup || (lookup.status !== "ready" && lookup.status !== "blocked")) {
    // v1 steps 2 and 3: a picked search input is replaced by the chip showing it.
    const picked = registry?.registeredField(id);
    const chip =
      picked && (v1HistoryPickedValue(picked) ?? v1ExtraPickedValue(picked));
    return chip !== undefined && picked
      ? { visible: true, value: chip, handle: picked }
      : undefined;
  }
  const handle = lookup.handle;
  const visible = hasVisibleWriteElement(handle);
  const target = readbackWriteElement(handle);
  const element = target ?? handle.customElements?.[0];
  if (!element) return { visible: false, value: "", handle };
  const style = visible
    ? undefined
    : pageDocument.defaultView?.getComputedStyle(element);
  const address = stagedAddressReceipt(handle);
  const hidden =
    !address?.visible &&
    (visible
      ? false
      : handle.candidate.visibility === "hidden" ||
        (lookup.status === "blocked" && lookup.reason === "hidden") ||
        style?.display === "none" ||
        style?.visibility === "hidden");
  let value =
    element instanceof HTMLSelectElement
      ? (element.selectedOptions[0]?.textContent ?? "")
      : element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ? element.value
        : "";
  if (
    handle.candidate.control === "radio" ||
    handle.candidate.control === "checkbox"
  ) {
    const selected = handle.candidate.options?.filter((option) => {
      const control = handle.optionElements.get(option.optionId);
      return (
        control instanceof HTMLInputElement &&
        control.checked &&
        (!visible || isVisibleWriteElement(control))
      );
    });
    value = selected?.map((option) => option.displayName).join(", ") ?? "";
  }
  return {
    visible: !hidden,
    value:
      componentEmploymentStatusValue(handle) ??
      customFieldValue(handle) ??
      value,
    handle,
  };
}

export function resultFieldOptions(
  registry: CandidateRegistry | undefined,
  id: string,
): string[] {
  const lookup = registry?.lookupField(id);
  return lookup?.status === "ready" || lookup?.status === "blocked"
    ? (lookup.handle.candidate.options ?? [])
        .map((option) => option.displayName)
        .filter(Boolean)
    : [];
}
