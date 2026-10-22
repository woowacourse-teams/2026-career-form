import { displayState } from "./read-pass";
import type { FieldCandidateHandle } from "./types";

type NativeFieldElement =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function nodeIdentity(element: Element): string {
  return JSON.stringify([
    element.tagName,
    element.getAttribute("type"),
    element.id,
    element.getAttribute("name"),
    element.getAttribute("role"),
    element.getAttribute("aria-label"),
    element.getAttribute("aria-labelledby"),
    element.getAttribute("data-item-id"),
    element.getAttribute("data-item-group-id"),
    element.getAttribute("placeholder"),
    element instanceof HTMLLabelElement
      ? [element.htmlFor, element.textContent?.replace(/\s+/g, " ").trim()]
      : undefined,
  ]);
}

/** Capture while connected: detached nodes no longer retain their section/row. */
function controlStructure(control: NativeFieldElement): string {
  const ancestors: unknown[] = [];
  for (let node = control.parentElement; node; node = node.parentElement) {
    const identity = nodeIdentity(node);
    const peers = Array.from(node.parentElement?.children ?? []).filter(
      (peer) => nodeIdentity(peer) === identity,
    );
    ancestors.push([identity, peers.indexOf(node), peers.length]);
  }
  return JSON.stringify([
    nodeIdentity(control),
    ancestors,
  ]);
}

export function controlIdentity(control: NativeFieldElement): string {
  return JSON.stringify([
    controlStructure(control),
    Array.from(control.labels ?? [], (label) => nodeIdentity(label)),
    control.getAttribute("aria-label"),
    (control.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => [id, control.ownerDocument.getElementById(id)?.textContent]),
  ]);
}

export function captureControlState(controls: readonly NativeFieldElement[]) {
  return controls.map((control) => ({
    control,
    structure: controlStructure(control),
    identity: controlIdentity(control),
    value: control.value,
    checked:
      control instanceof HTMLInputElement &&
      (control.type === "checkbox" || control.type === "radio")
        ? control.checked
        : undefined,
  }));
}

/**
 * Existing nodes retain object identity. Replacements need one unique structural
 * match; neither their ordinal nor their value may disambiguate duplicate nodes.
 * New controls are allowed, but no old control may disappear or change state.
 */
export function correspondingControls(
  before: ReturnType<typeof captureControlState>,
  controls: readonly NativeFieldElement[],
  target?: NativeFieldElement,
): Map<NativeFieldElement, NativeFieldElement> | undefined {
  const current = captureControlState(controls);
  const matches = new Map<NativeFieldElement, NativeFieldElement>();
  const used = new Set<NativeFieldElement>();
  for (const old of before) {
    const candidates = current.filter(
      ({ structure }) => structure === old.structure,
    );
    const same = candidates.find(({ control }) => control === old.control);
    const match = same ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (
      !match ||
      match.identity !== old.identity ||
      used.has(match.control) ||
      (old.control === target && match.control !== target) ||
      (old.control !== target &&
        (match.value !== old.value || match.checked !== old.checked))
    )
      return undefined;
    used.add(match.control);
    matches.set(old.control, match.control);
  }
  return matches;
}

/** The same visibility rule used by collection, without site-specific cases. */
export function isVisibleWriteElement(element: HTMLElement): boolean {
  if (
    element.hidden ||
    element.closest("[hidden], [aria-hidden='true'], [inert]")
  )
    return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return true;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const style = displayState(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    )
      return false;
  }
  return true;
}

export function isVisibleEnabledElement(element: HTMLElement): boolean {
  if (!isVisibleWriteElement(element)) return false;
  return !(
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLButtonElement) &&
    element.disabled
  );
}

export function isWritableWriteElement(element: HTMLElement): boolean {
  return (
    isVisibleEnabledElement(element) &&
    !(element instanceof HTMLInputElement && element.readOnly) &&
    !(element instanceof HTMLTextAreaElement && element.readOnly)
  );
}

/**
 * Pick the control the user can actually see and edit. A grouped handle may
 * contain hidden duplicates; writes must use this target.
 */
export function primaryWriteElement(
  handle: FieldCandidateHandle,
): NativeFieldElement | undefined {
  const visibleEnabled = handle.elements.filter(isVisibleEnabledElement);
  return visibleEnabled.find(isWritableWriteElement) ?? visibleEnabled[0];
}

/** Whether the group owns any visible native control at all. */
export function hasVisibleWriteElement(handle: FieldCandidateHandle): boolean {
  return handle.elements.some(isVisibleWriteElement);
}

/**
 * Pick the control used to read back a write. This is deliberately different
 * from the write target: a control that became disabled or readonly after a
 * successful write must still be read. Prefer the element actually written,
 * then the first visible control regardless of disabled/readOnly, and only
 * when the group has no visible control at all fall back to the pre-stage-A
 * first element (static adapters rely on that for hidden-only widgets).
 */
export function readbackWriteElement(
  handle: FieldCandidateHandle,
  written?: Element,
): NativeFieldElement | undefined {
  if (
    (written instanceof HTMLInputElement ||
      written instanceof HTMLSelectElement ||
      written instanceof HTMLTextAreaElement) &&
    handle.elements.includes(written)
  )
    return written;
  const visible = handle.elements.filter(isVisibleWriteElement);
  return visible[0] ?? handle.elements[0];
}
