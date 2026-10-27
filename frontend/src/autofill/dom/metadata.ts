import { cachedDomRead, displayState } from "./read-pass";
import { isTrustedId, trustedLabels } from "./trusted-id";
import { genericRows } from "./repeatable-rows";

const MAX_METADATA_LENGTH = 120;
const DEFINITION_LIST_CONTROL_SELECTOR =
  "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='reset']):not([type='image']), select, textarea, [contenteditable='true']";
const LABEL_BOUNDARY_SELECTOR =
  "[data-repeatable-group], [data-repeater-item], fieldset, [role='group']";
const EDITABLE = "[contenteditable]:not([contenteditable='false' i])";
const FIELD_CONTROLS = `input:not([type='hidden']), select, textarea, ${EDITABLE}`;
const INTERACTIVE = [
  FIELD_CONTROLS, "button", "a[href]", "[tabindex]", "[aria-haspopup]", "[aria-expanded]",
  ...["button", "checkbox", "combobox", "listbox", "menu", "menuitem", "option",
    "radio", "searchbox", "slider", "spinbutton", "switch", "tab", "textbox", "treeitem"]
    .map((role) => `[role='${role}']`),
].join(", ");
const STRUCTURAL_STOP = "form, body, fieldset, section, table, [role='group'], [role='region']";
const ROW_STOP = "tr, dl, [data-repeatable-group], [data-repeater-item]";

/** Normalized fixed form prose, not a vocabulary projection or a current value. */
export function formText(value: string | null | undefined): string | undefined {
  const text = value?.normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  return text ? Array.from(text).slice(0, MAX_METADATA_LENGTH).join("").trim() : undefined;
}

function hiddenTextNode(element: Element): boolean {
  const style = displayState(element);
  return element.matches("[hidden], [aria-hidden='true'], [inert]") ||
    style.display === "none" || style.visibility === "hidden";
}

function interactiveTextNode(element: Element): boolean {
  if (element.matches(INTERACTIVE)) return true;
  return cachedDomRead(element, "label-pointer", () => {
    const view = element.ownerDocument.defaultView;
    return view?.getComputedStyle(element).cursor === "pointer" &&
      (!element.parentElement || view.getComputedStyle(element.parentElement).cursor !== "pointer");
  });
}

/** Read fixed text only; keep block boundaries for question/description ownership. */
export function fixedTextChunks(
  root: Element,
  choiceWrapper = false,
  /** The root is the control's own <label>: clicking it only focuses the control. */
  explicitLabel = false,
): string[] {
  for (let ancestor: Element | null = root; ancestor; ancestor = ancestor.parentElement) {
    if (hiddenTextNode(ancestor) || ancestor.matches(EDITABLE) ||
      (ancestor !== root && interactiveTextNode(ancestor))) return [];
  }
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    const text = formText(current);
    if (text) chunks.push(text);
    current = "";
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent ?? "";
      return;
    }
    if (!(node instanceof Element) ||
      node.matches("script, style, template, noscript, svg, option") ||
      hiddenTextNode(node)) return;
    if (interactiveTextNode(node) &&
      !(node === root && choiceWrapper && !node.matches(INTERACTIVE)) &&
      !(node === root && explicitLabel && node instanceof HTMLLabelElement)) return;
    const block = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DIV|DT|FIGCAPTION|FOOTER|H[1-6]|HEADER|LEGEND|LI|OL|P|PRE|TD|TH|UL|BR)$/.test(node.tagName);
    if (block) flush();
    node.childNodes.forEach(walk);
    if (block) flush();
  };
  walk(root);
  flush();
  return chunks;
}

function activeControls(scope: Element, target: Element): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FIELD_CONTROLS))
    .filter((control) => !inExcludedBranch(control, scope, target));
}

export function structuralRow(element: Element): Element | undefined {
  return cachedDomRead(element, "label-row", () => {
    const document = element.ownerDocument;
    const rows = cachedDomRead(document, "label-rows", () => genericRows(document.body));
    return rows.find((row) => row === element || row.contains(element)) ??
      element.closest(ROW_STOP) ?? undefined;
  });
}

export interface StructuralLabel {
  label: string;
  description?: string;
}

/** Only preceding, control-free sibling text inside this question and row. */
export function structuralLabelOf(controls: readonly HTMLElement[]): StructuralLabel | undefined {
  const target = controls[0];
  if (!target) return undefined;
  const row = structuralRow(target);
  if (controls.some((control) => structuralRow(control) !== row)) return undefined;
  let node: Element | null = target;
  while (node && !controls.every((control) => node!.contains(control))) node = node.parentElement;
  for (let depth = 0; node && depth < 10; depth += 1) {
    if (node === row || node.matches(ROW_STOP)) break;
    const parent: Element | null = node.parentElement;
    if (!parent || parent.matches(STRUCTURAL_STOP)) break;
    if (activeControls(parent, target).some((control) => !controls.includes(control) &&
      (control.matches("input, select, textarea") || node!.contains(control)))) break;
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (hiddenTextNode(sibling) || interactiveTextNode(sibling) ||
        sibling.querySelector("input, select, textarea")) continue;
      const labels = [
        ...(sibling instanceof HTMLLabelElement ? [sibling] : []),
        ...sibling.querySelectorAll<HTMLLabelElement>("label[for]"),
      ];
      if (labels.some((label) => label.htmlFor &&
        (!isTrustedId(label.getRootNode() as Document | ShadowRoot, label.htmlFor) ||
          (label.control !== null && !controls.includes(label.control))))) continue;
      const [label, ...description] = fixedTextChunks(sibling);
      if (label) return {
        label,
        ...(description.length ? { description: formText(description.join(" ")) } : {}),
      };
    }
    node = parent;
  }
  return undefined;
}

/** No name means no group unless a bounded block has its own question. */
export function unnamedRadioGroupOf(radio: HTMLInputElement): HTMLInputElement[] {
  const row = structuralRow(radio);
  let node: Element = radio;
  for (let depth = 0; depth < 10; depth += 1) {
    if (node === row || node.matches(ROW_STOP)) break;
    const parent: Element | null = node.parentElement;
    if (!parent || parent.matches(STRUCTURAL_STOP)) break;
    const controls = activeControls(parent, radio);
    if (!controls.every((control): control is HTMLInputElement =>
      control instanceof HTMLInputElement && control.type === "radio" &&
      !control.name && structuralRow(control) === row)) break;
    if (controls.length > 1 && structuralLabelOf(controls)) return controls;
    node = parent;
  }
  return [radio];
}

/** The nearest single-choice wrapper owns the option, not the group question. */
function choiceLabelOf(input: HTMLInputElement): string | undefined {
  const row = structuralRow(input);
  let node: Element = input;
  for (let depth = 0; depth < 4; depth += 1) {
    const parent: Element | null = node.parentElement;
    if (!parent || parent === row || parent.matches(`${STRUCTURAL_STOP}, ${ROW_STOP}`) ||
      activeControls(parent, input).some((control) => control !== input)) return undefined;
    const text = formText(fixedTextChunks(parent, true).join(" "));
    if (text) return text;
    node = parent;
  }
  return undefined;
}

function genericLabelOf(element: HTMLElement): string | undefined {
  const label = uncheckedGenericLabelOf(element);
  // A control's own current value never names the control (it shows the choice).
  if (
    label &&
    element instanceof HTMLInputElement &&
    element.readOnly &&
    formText(element.value) === label
  ) {
    const placeholder = formText(element.getAttribute("placeholder"));
    return placeholder && placeholder !== label ? placeholder : undefined;
  }
  return label;
}

function uncheckedGenericLabelOf(element: HTMLElement): string | undefined {
  const root = element.getRootNode() as Document | ShadowRoot;
  const labelled = formText((element.getAttribute("aria-labelledby")?.trim().split(/\s+/) ?? [])
    .filter((id) => isTrustedId(root, id))
    .flatMap((id) => {
      const label = root.getElementById(id);
      return label ? fixedTextChunks(label) : [];
    }).join(" "));
  if (labelled) return labelled;
  const aria = formText(element.getAttribute("aria-label"));
  if (aria) return aria;
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement) {
    const label = trustedLabels(element)[0] ?? unassociatedLabelOf(element);
    const explicit = label ? formText(fixedTextChunks(label, false, true).join(" ")) : undefined;
    if (explicit) return explicit;
    if (element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)) {
      const choice = choiceLabelOf(element);
      if (choice) return choice;
    } else {
      const defined = definitionListLabelOf(element, true);
      if (defined) return defined;
      const structural = structuralLabelOf([element]);
      if (structural) return structural.label;
    }
    const placeholder = formText(element.getAttribute("placeholder"));
    if (placeholder) return placeholder;
    if (element instanceof HTMLSelectElement) {
      return element.options[0]?.value === "" ? formText(element.options[0].textContent) : undefined;
    }
    return undefined;
  }
  return formText(fixedTextChunks(element).join(" "));
}

export function metadata(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_METADATA_LENGTH);
}

/** Generic context may also recover a broken label over one select cluster. */
export function unassociatedLabelOf(
  element: HTMLElement,
  generic = false,
): HTMLLabelElement | undefined {
  const row = generic ? structuralRow(element) : undefined;
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
    const single = controls.length === 1 && controls[0] === element;
    if (!single && (
      !generic ||
      controls.length < 2 ||
      controls.length > 3 ||
      !controls.includes(element) ||
      !controls.every((control) => control instanceof HTMLSelectElement)
    )) return undefined;
    if (generic && controls.some((control) => structuralRow(control) !== row))
      return undefined;
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
    if (labels.length === 1) {
      const label = labels[0]!;
      if (generic) {
        if (structuralRow(label) !== row || !fixedTextChunks(label).length)
          return undefined;
        if (!single) {
          if (!label.htmlFor || group.querySelectorAll("label").length !== 1)
            return undefined;
          const branches = Array.from(group.children).filter((child) =>
            controls.some((control) => child === control || child.contains(control)));
          if (branches.length > 1 &&
            branches.some((branch) => !(branch instanceof HTMLSelectElement)))
            return undefined;
          const boundary = "fieldset, section, [role='group']";
          if (controls.some((control) =>
            control.closest(boundary) !== label.closest(boundary)))
            return undefined;
        }
      }
      return label;
    }
    if (group.matches("form, fieldset, section") ||
      (generic && (group === row || group.matches("[role='group']")))) break;
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
      displayState(node).display === "none"
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
  generic = false,
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
  return generic
    ? formText(fixedTextChunks(nearestTerm).join(" "))
    : metadata(nearestTerm.textContent);
}

export function labelOf(element: HTMLElement, generic = false): string | undefined {
  return cachedDomRead(element, generic ? "generic-label" : "label", () =>
    generic ? genericLabelOf(element) : uncachedLabelOf(element));
}

function uncachedLabelOf(element: HTMLElement): string | undefined {
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
