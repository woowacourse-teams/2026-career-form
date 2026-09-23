const MAX_METADATA_LENGTH = 120;
const DEFINITION_LIST_CONTROL_SELECTOR =
  "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='reset']):not([type='image']), select, textarea, [contenteditable='true']";
const LABEL_BOUNDARY_SELECTOR =
  "[data-repeatable-group], [data-repeater-item], fieldset, [role='group']";

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

function labelBoundary(element: Element): Element | null {
  return element.closest(LABEL_BOUNDARY_SELECTOR);
}

/**
 * Read a definition-list label without crossing a repeat row or group.
 * A dd is eligible only when it owns this single non-button control; its
 * current value and any other text inside the dd are intentionally ignored.
 */
export function definitionListLabelOf(
  element: HTMLElement,
): string | undefined {
  const definition = element.closest("dd");
  const list = definition?.closest("dl");
  if (
    !definition ||
    !list ||
    labelBoundary(definition) !== labelBoundary(element)
  ) {
    return undefined;
  }

  const controls = Array.from(
    definition.querySelectorAll<HTMLElement>(DEFINITION_LIST_CONTROL_SELECTOR),
  ).filter((control) => control.closest("dd") === definition);
  if (controls.length !== 1 || controls[0] !== element) return undefined;

  const precedingTerms = Array.from(list.querySelectorAll("dt")).filter(
    (term) =>
      term.closest("dl") === list &&
      Boolean(
        term.compareDocumentPosition(definition) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  );
  const nearestTerm = precedingTerms[precedingTerms.length - 1];
  if (!nearestTerm || labelBoundary(nearestTerm) !== labelBoundary(element)) {
    return undefined;
  }
  return metadata(nearestTerm.textContent);
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
  const definitionListLabel = definitionListLabelOf(element);
  if (definitionListLabel) return definitionListLabel;
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
