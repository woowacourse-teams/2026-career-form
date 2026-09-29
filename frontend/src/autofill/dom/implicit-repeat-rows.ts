import {
  ADD_LABEL,
  CONTROL_SELECTOR,
  FORBIDDEN_LABEL,
  actionLabel,
  genericFormGroupFor,
  genericFormGroups,
} from "./generic-form-groups";
import { isGenericRepeatableRow } from "./repeatable-rows";

/**
 * Repeat rows that carry no marker, item class or trusted id. The only
 * evidence is one add action plus sibling rows with the same control
 * structure; anything ambiguous is left undetected (fail-closed).
 */
export interface ImplicitRepeatGroup {
  container: Element;
  rows: Element[];
  action: HTMLElement;
}

const RESET_LABEL = /초기화|reset|clear/i;
const ADD_ACTION_SELECTOR = "button, input[type='button']";
const MAX_ANCESTOR_DEPTH = 6;

export function isAddAction(element: Element): element is HTMLElement {
  if (
    !(element instanceof HTMLElement) ||
    !element.matches(ADD_ACTION_SELECTOR)
  )
    return false;
  const label = actionLabel(element);
  return (
    ADD_LABEL.test(label) &&
    !FORBIDDEN_LABEL.test(label) &&
    !RESET_LABEL.test(label) &&
    !element.closest("[hidden], [aria-hidden='true'], [inert]") &&
    !element.closest("template, [data-template]")
  );
}

function controlsOf(element: Element): Element[] {
  return Array.from(element.querySelectorAll(CONTROL_SELECTOR));
}

/** Document-order tag:type list plus normalized name set; ignores visibility and ids. */
export function rowSignature(row: Element): string | undefined {
  const controls = controlsOf(row);
  if (controls.length < 2) return undefined;
  const shape = controls
    .map((control) =>
      [control.tagName.toLowerCase(), control.getAttribute("type") ?? ""].join(
        ":",
      ),
    )
    .join("|");
  const names = [
    ...new Set(
      controls.map((control) =>
        (control.getAttribute("name") ?? "").replace(/\d+/g, "#"),
      ),
    ),
  ].sort();
  return `${shape}#${names.join(",")}`;
}

function isControl(element: Element): boolean {
  return element.matches(CONTROL_SELECTOR);
}

function rowChildren(element: Element): Element[] {
  return Array.from(element.children).filter(
    (child) => isControl(child) || child.querySelector(CONTROL_SELECTOR),
  );
}

function hasDirectControl(element: Element): boolean {
  return Array.from(element.children).some(isControl);
}

function sameSignature(
  rows: Element[],
  signature: string | undefined,
): boolean {
  return (
    signature !== undefined &&
    rows.length >= 1 &&
    rows.every((row) => rowSignature(row) === signature)
  );
}

/** Rendered-state lookup shared by one detection pass. */
function renderedCheck(): (element: Element) => boolean {
  const cache = new Map<Element, boolean>();
  const rendered = (element: Element | null): boolean => {
    if (!element) return true;
    const known = cache.get(element);
    if (known !== undefined) return known;
    const own =
      !element.hasAttribute("hidden") &&
      element.ownerDocument.defaultView?.getComputedStyle(element).display !==
        "none";
    const result = own && rendered(element.parentElement);
    cache.set(element, result);
    return result;
  };
  return rendered;
}

/**
 * A rendered block whose row siblings are all unrendered and structurally
 * different reads as one kind branch of its parent row (per-kind branches
 * that each carry their own add action). Returns that row and the hidden
 * branches, or undefined when the reading is not proven.
 */
function kindBranchRow(
  block: Element,
  rendered: (element: Element) => boolean,
): { row: Element; hiddenBranches: Element[] } | undefined {
  const row = block.parentElement;
  if (!row || row.matches("form, body") || hasDirectControl(row))
    return undefined;
  const branches = rowChildren(row);
  const hiddenBranches = branches.filter((branch) => branch !== block);
  const signature = rowSignature(block);
  if (
    !rendered(block) ||
    !branches.includes(block) ||
    hiddenBranches.length === 0 ||
    signature === undefined ||
    hiddenBranches.some(
      (branch) => rendered(branch) || rowSignature(branch) === signature,
    )
  )
    return undefined;
  return { row, hiddenBranches };
}

function overlapsExistingDetection(
  container: Element,
  action: HTMLElement,
): boolean {
  if (genericFormGroupFor(action)) return true;
  for (
    let node: Element | null = container;
    node && !node.matches("form, body");
    node = node.parentElement
  )
    if (isGenericRepeatableRow(node)) return true;
  if (Array.from(container.querySelectorAll("*")).some(isGenericRepeatableRow))
    return true;
  return genericFormGroups(container.ownerDocument).some((group) =>
    [group.area, ...group.rows].some(
      (element) =>
        element === container ||
        element.contains(container) ||
        container.contains(element),
    ),
  );
}

export function groupForAddAction(
  action: HTMLElement,
  rendered: (element: Element) => boolean = renderedCheck(),
): ImplicitRepeatGroup | undefined {
  if (!isAddAction(action)) return undefined;
  let x: Element | null = action.parentElement;
  for (
    let depth = 0;
    x && !x.matches("form, body") && controlsOf(x).length < 2;
    depth += 1, x = x.parentElement
  )
    if (depth >= MAX_ANCESTOR_DEPTH) return undefined;
  if (!x || x.matches("form, body")) return undefined;
  const branchRow = kindBranchRow(x, rendered);
  if (branchRow) x = branchRow.row;

  const xRows = rowChildren(x);
  const asContainer =
    !xRows.some((child) => child.contains(action)) &&
    !hasDirectControl(x) &&
    sameSignature(xRows, rowSignature(xRows[0] ?? x));

  const c = x.parentElement;
  const cRows = c ? rowChildren(c) : [];
  const asRow =
    c !== null &&
    !c.matches("form, body") &&
    !hasDirectControl(c) &&
    sameSignature(cRows, rowSignature(x)) &&
    cRows[0] === x;

  // Both readings fit: the add action's owner row is ambiguous.
  if (asContainer && asRow) return undefined;
  let group: { container: Element; rows: Element[] } | undefined;
  if (asContainer) {
    const signature = rowSignature(x);
    const peers = x.parentElement ? Array.from(x.parentElement.children) : [];
    if (
      signature &&
      peers.some((peer) => peer !== x && rowSignature(peer) === signature)
    )
      return undefined;
    group = { container: x, rows: xRows };
  } else if (asRow && c) {
    if (xRows.length >= 2 && sameSignature(xRows, rowSignature(xRows[0]!)))
      return undefined;
    group = { container: c, rows: cRows };
  }
  if (!group) return undefined;
  // fieldset/group rows belong to the existing detection path, and a row
  // that only wraps one inner block could equally be that inner block.
  if (
    group.rows.some(
      (row) =>
        row.matches("fieldset, [role='group']") ||
        (!hasDirectControl(row) && rowChildren(row).length === 1),
    )
  )
    return undefined;

  const actions = Array.from(
    group.container.querySelectorAll(ADD_ACTION_SELECTOR),
  )
    .filter(isAddAction)
    // A hidden branch's add action is the same action for another kind.
    .filter(
      (candidate) =>
        !branchRow?.hiddenBranches.some((branch) => branch.contains(candidate)),
    );
  if (actions.length !== 1 || actions[0] !== action) return undefined;
  if (group.rows.slice(1).some((row) => row.contains(action))) return undefined;
  if (
    group.rows.some(
      (row) =>
        controlsOf(row).filter((control) => rendered(control)).length < 2,
    )
  )
    return undefined;
  if (overlapsExistingDetection(group.container, action)) return undefined;
  return { ...group, action };
}

export function implicitRepeatGroups(root: ParentNode): ImplicitRepeatGroup[] {
  const rendered = renderedCheck();
  const groups = Array.from(root.querySelectorAll(ADD_ACTION_SELECTOR))
    .filter(isAddAction)
    .map((action) => groupForAddAction(action, rendered))
    .filter((group): group is ImplicitRepeatGroup => group !== undefined);
  return groups.filter(
    (group) =>
      !groups.some(
        (other) =>
          other !== group &&
          (other.container.contains(group.container) ||
            group.container.contains(other.container) ||
            other.rows.some((row) => row.contains(group.container)) ||
            group.rows.some((row) => row.contains(other.container))),
      ),
  );
}

/**
 * Detection results per document, reused until the document mutates
 * (childList, attributes or option selection changes).
 */
const cachedGroups = new WeakMap<
  Document,
  { groups: ImplicitRepeatGroup[]; observer: MutationObserver; dirty: boolean }
>();

/** Detection for the whole document, recomputed only after a DOM change. */
export function documentImplicitRepeatGroups(
  document: Document,
): ImplicitRepeatGroup[] {
  const view = document.defaultView;
  const cached = cachedGroups.get(document);
  if (cached && !cached.dirty && cached.observer.takeRecords().length === 0)
    return cached.groups;
  const groups = implicitRepeatGroups(document);
  if (!view?.MutationObserver) return groups;
  const entry = cached ?? {
    groups,
    dirty: false,
    observer: new view.MutationObserver(() => {
      entry.dirty = true;
    }),
  };
  if (!cached) {
    entry.observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    cachedGroups.set(document, entry);
  }
  entry.groups = groups;
  entry.dirty = false;
  return groups;
}

export function implicitRepeatGroupFor(
  element: Element,
): ImplicitRepeatGroup | undefined {
  return documentImplicitRepeatGroups(element.ownerDocument).find(
    (group) =>
      group.action === element ||
      group.rows.some((row) => row === element || row.contains(element)),
  );
}
