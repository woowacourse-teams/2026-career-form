export function elementSignature(element: Element): string {
  const input = isInputElement(element) ? element.type : "";
  const name =
    isInputElement(element) ||
    isTextareaElement(element) ||
    isSelectElement(element)
      ? element.name
      : "";
  return [element.tagName, input, element.id, name].join("|");
}

/** Tag checks remain valid for elements owned by a same-origin iframe realm. */
export function isInputElement(element: Element): element is HTMLInputElement {
  return element.tagName === "INPUT";
}

export function isTextareaElement(
  element: Element,
): element is HTMLTextAreaElement {
  return element.tagName === "TEXTAREA";
}

export function isSelectElement(
  element: Element,
): element is HTMLSelectElement {
  return element.tagName === "SELECT";
}

export function isButtonElement(
  element: Element,
): element is HTMLButtonElement {
  return element.tagName === "BUTTON";
}

export function isAnchorElement(
  element: Element,
): element is HTMLAnchorElement {
  return element.tagName === "A";
}

export function isVisible(element: HTMLElement, allowInert = false): boolean {
  if (
    element.hidden ||
    element.matches(":disabled") ||
    element.closest(
      allowInert
        ? "[hidden], [aria-hidden='true'], [aria-disabled='true']"
        : "[hidden], [aria-hidden='true'], [aria-disabled='true'], [inert]",
    )
  )
    return false;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden")
      return false;
  }
  return true;
}
