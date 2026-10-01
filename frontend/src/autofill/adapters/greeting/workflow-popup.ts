import { greetingUsable } from "./write";

export function ownedPopup(trigger: HTMLElement): HTMLElement | undefined {
  const id = trigger.getAttribute("aria-controls");
  if (!id || /\s/.test(id)) return undefined;
  const matches = [
    ...trigger.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
  ].filter((node) => node.id === id);
  return matches.length === 1 && greetingUsable(matches[0])
    ? matches[0]
    : undefined;
}
export function retainedSearchPopup(
  input: HTMLInputElement,
):
  | { popup: HTMLElement; usable: (element: HTMLElement) => boolean }
  | undefined {
  const id = input.getAttribute("aria-controls");
  if (!id || /\s/.test(id) || input.getAttribute("aria-expanded") !== "true")
    return undefined;
  const matches = [
    ...input.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
  ].filter((node) => node.id === id);
  if (matches.length !== 1) return undefined;
  const popup = matches[0];
  const root = popup.parentElement;
  const positioner = root?.parentElement;
  if (
    !popup.matches(
      '[data-scope="scroll-area"][data-part="viewport"][role="presentation"][data-state="open"]',
    ) ||
    !root?.matches('[data-scope="scroll-area"][data-part="root"]') ||
    !positioner?.matches('[data-scope="combobox"][data-part="positioner"]')
  )
    return undefined;
  const usable = (element: HTMLElement) => {
    if (
      !element.isConnected ||
      element.matches(':disabled, [aria-disabled="true"]')
    )
      return false;
    for (
      let node: HTMLElement | null = element;
      node;
      node = node.parentElement
    ) {
      if (
        node.hasAttribute("hidden") ||
        node.hasAttribute("inert") ||
        (node.getAttribute("aria-hidden") === "true" && node !== positioner)
      )
        return false;
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (!style || style.display === "none" || style.visibility === "hidden")
        return false;
    }
    return true;
  };
  return usable(popup) ? { popup, usable } : undefined;
}
