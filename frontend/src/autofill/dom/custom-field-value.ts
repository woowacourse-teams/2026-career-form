import type { FieldCandidateHandle } from "./types";

/** Reads only custom controls already bound by the collector. */
export function customFieldValue(
  handle: FieldCandidateHandle,
): string | undefined {
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
  const placeholder = ["data-placeholder", "data-placeholder-shown"].some(
    (name) => {
      const marker = element.getAttribute(name);
      return marker !== null && marker !== "false";
    },
  );
  return placeholder || value === "선택" ? "" : value;
}
