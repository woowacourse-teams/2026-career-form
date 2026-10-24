import { componentPolicy } from "../component-policy";
import { componentSelector } from "../component-dom";
import { executionPolicy } from "../../workflow/execution-policy";
import { componentUsable } from "./write";

export function ownedPopup(trigger: HTMLElement): HTMLElement | undefined {
  const id = trigger.getAttribute("aria-controls");
  if (!id || /\s/.test(id)) return undefined;
  const matches = [
    ...trigger.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
  ].filter((node) => node.id === id);
  return matches.length === 1 && componentUsable(matches[0])
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
  const policy = componentPolicy(input.ownerDocument).widget;
  const ancestor = (depth: number) => {
    let node: Element | null = popup;
    for (let i = 0; i < depth; i++) node = node?.parentElement ?? null;
    return node;
  };
  const root = ancestor(policy.popupRootDepth);
  const positioner = ancestor(policy.popupPositionerDepth);
  if (
    !popup.matches(componentSelector(popup, "openSearchPopup")) ||
    !root?.matches(componentSelector(root, "scrollRoot")) ||
    !positioner?.matches(componentSelector(positioner, "searchPositioner"))
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
        (node.getAttribute("aria-hidden") === "true" &&
          (!policy.ignorePositionerAriaHidden || node !== positioner))
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

const ESCAPE = () =>
  new KeyboardEvent("keydown", { key: "Escape", bubbles: true });

/**
 * Close floating Component forms widgets a driver left open. An open combobox,
 * calendar or choice menu makes the page mark everything else `aria-hidden`
 * (a modal-style popover), so the next snapshot sees no visible fields and the
 * run would end with silent gaps. Only closes widgets, never changes a value.
 */
export function dismissLeftoverComponentPopups(document: Document): boolean {
  if (!executionPolicy(document)?.componentPolicy) return false;
  const dismissed: HTMLElement[] = [];
  const open = [
    ...document.querySelectorAll<HTMLElement>(
      `${componentSelector(document, "searchInput")}[aria-expanded="true"]`,
    ),
    ...document.querySelectorAll<HTMLElement>(
      `${componentSelector(document, "calendarTrigger")}[${componentPolicy(document).widget.stateAttribute}="${componentPolicy(document).widget.openState}"]`,
    ),
    ...document.querySelectorAll<HTMLElement>(
      'button[aria-controls][aria-expanded="true"]',
    ),
  ].filter((element) => element.isConnected && componentUsable(element));
  for (const element of new Set(open)) {
    element.dispatchEvent(ESCAPE());
    dismissed.push(element);
  }
  const active = document.activeElement;
  if (
    dismissed.length &&
    active instanceof HTMLElement &&
    dismissed.includes(active)
  )
    active.blur();
  return dismissed.length > 0;
}
