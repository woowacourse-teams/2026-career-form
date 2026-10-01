import { isTrustedId, trustedLabels } from "./trusted-id";

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
    ).filter((control) => !inExcludedBranch(control, group!, element));
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

/**
 * A control inside a hidden or display:none subtree that does not also hold
 * the target is an inactive branch, so it does not compete for the label.
 */
function inExcludedBranch(
  control: Element,
  group: Element,
  target: Element,
): boolean {
  const view = control.ownerDocument.defaultView;
  for (
    let node: Element | null = control;
    node && node !== group;
    node = node.parentElement
  ) {
    if (node.contains(target)) return false;
    if (
      node.hasAttribute("hidden") ||
      view?.getComputedStyle(node).display === "none"
    )
      return true;
  }
  return false;
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
    const root = element.getRootNode() as Document | ShadowRoot;
    const text = ariaLabelledBy
      .split(/\s+/)
      .filter((id) => isTrustedId(root, id))
      .map((id) => root.getElementById(id)?.textContent ?? "")
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
      (trustedLabels(element)[0] ?? unassociatedLabelOf(element))?.textContent,
    );
    if (labelText) return labelText;
    const placeholder = metadata(element.getAttribute("placeholder"));
    if (placeholder) return placeholder;
  }
  const definitionListLabel = definitionListLabelOf(element);
  if (definitionListLabel) return definitionListLabel;
  // A select's text is its option list, never its label.
  if (element instanceof HTMLSelectElement) {
    const first = element.options[0];
    return first?.value === "" ? metadata(first.textContent) : undefined;
  }
  return metadata(element.textContent);
}

export function sectionName(container: Element | null): string | undefined {
  if (!container) return undefined;
  return (
    metadata(container.getAttribute("aria-label")) ??
    metadata(
      container.querySelector(
        ":scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > * > h1, :scope > * > h2, :scope > * > h3, :scope > * > h4, :scope > * > h5, :scope > * > h6",
      )?.textContent,
    )
  );
}
