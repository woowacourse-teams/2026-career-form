import { displayState } from "./read-pass";
import type { FieldCandidateHandle } from "./types";

type NativeFieldElement =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

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
 * contain hidden duplicates; writes and their readback must use this target.
 */
export function primaryWriteElement(
  handle: FieldCandidateHandle,
): NativeFieldElement | undefined {
  const visibleEnabled = handle.elements.filter(isVisibleEnabledElement);
  return visibleEnabled.find(isWritableWriteElement) ?? visibleEnabled[0];
}
