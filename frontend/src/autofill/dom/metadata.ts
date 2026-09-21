const MAX_METADATA_LENGTH = 120;

export function metadata(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_METADATA_LENGTH);
}

/** Accept a sibling label only inside a bounded, single-control group. */
export function unassociatedLabelOf(
  element: HTMLElement,
): HTMLLabelElement | undefined {
  let group = element.parentElement;
  for (
    let depth = 0;
    group && depth < 4;
    depth += 1, group = group.parentElement
  ) {
    const controls = Array.from(
      group.querySelectorAll(
        "input:not([type='hidden']), select, textarea, [contenteditable='true']",
      ),
    );
    if (controls.length !== 1 || controls[0] !== element) return undefined;
    const labels = Array.from(
      group.querySelectorAll<HTMLLabelElement>(":scope > label"),
    ).filter(
      (label) =>
        (!label.htmlFor ||
          !element.ownerDocument.getElementById(label.htmlFor)) &&
        !label.control &&
        !label.closest("[hidden], [aria-hidden='true'], [inert]"),
    );
    if (labels.length > 1) return undefined;
    if (labels.length === 1) return labels[0];
    if (group.matches("form, fieldset, section")) break;
  }
  return undefined;
}

export function labelOf(element: HTMLElement): string | undefined {
  const ariaLabelledBy = metadata(element.getAttribute("aria-labelledby"));
  if (ariaLabelledBy) {
    const text = ariaLabelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    const labelledText = metadata(text);
    if (labelledText) return labelledText;
  }
  const ariaLabel = metadata(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labelText = metadata(
      (element.labels?.[0] ?? unassociatedLabelOf(element))?.textContent,
    );
    if (labelText) return labelText;
    const placeholder = metadata(element.getAttribute("placeholder"));
    if (placeholder) return placeholder;
  }
  return metadata(element.textContent);
}

export function sectionName(container: Element | null): string | undefined {
  if (!container) return undefined;
  return (
    metadata(container.getAttribute("aria-label")) ??
    metadata(
      container.querySelector(
        ":scope > legend, :scope > h1, :scope > h2, :scope > h3",
      )?.textContent,
    )
  );
}
