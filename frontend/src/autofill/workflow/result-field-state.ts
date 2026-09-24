import type { CandidateRegistry } from "../dom/candidate-registry";

export function resultFieldState(
  registry: CandidateRegistry | undefined,
  pageDocument: Document,
  id: string,
) {
  const lookup = registry?.lookupField(id);
  if (!lookup || (lookup.status !== "ready" && lookup.status !== "blocked"))
    return undefined;
  const handle = lookup.handle;
  const element = handle.elements[0];
  const style = element && pageDocument.defaultView?.getComputedStyle(element);
  const hidden =
    handle.candidate.visibility === "hidden" ||
    (lookup.status === "blocked" && lookup.reason === "hidden") ||
    style?.display === "none" ||
    style?.visibility === "hidden";
  let value =
    element instanceof HTMLSelectElement
      ? (element.selectedOptions[0]?.textContent ?? "")
      : (element?.value ?? "");
  if (
    handle.candidate.control === "radio" ||
    handle.candidate.control === "checkbox"
  ) {
    const selected = handle.candidate.options?.filter((option) => {
      const control = handle.optionElements.get(option.optionId);
      return control instanceof HTMLInputElement && control.checked;
    });
    value = selected?.map((option) => option.displayName).join(", ") ?? "";
  }
  return { visible: !hidden, value };
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
