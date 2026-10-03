import { calendarUnitEvidence } from "./calendar-unit";
import { hasCalendarOwnershipConflict } from "./calendar-ownership";

/**
 * Detects readonly inputs bound to a ui-datepicker family day calendar.
 *
 * The family renders one shared root (`.ui-datepicker`) for every bound input
 * and marks each bound input with `hasDatepicker`. The root is empty until it
 * opens, so ownership is proven at execution time: the calendar must be closed
 * before the target's own opener is activated and be the only calendar shown
 * afterwards.
 */
export interface DayCalendarSurface {
  target: HTMLInputElement;
  /** The adjacent trigger button, or the target itself for focus-to-open. */
  opener: HTMLElement;
  popup: HTMLElement;
  openBy: "trigger" | "target";
}

const HIDDEN = "[hidden], [inert], [aria-hidden='true']";

/** True when neither the element nor an ancestor is hidden or undisplayed. */
export function isDisplayed(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest(HIDDEN)) return false;
  const view = element.ownerDocument.defaultView;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const style = view?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden"))
      return false;
  }
  return true;
}

/** Popup (non-inline) ui-datepicker roots in the document. */
export function dayCalendarRoots(document: Document): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".ui-datepicker"),
  ).filter(
    (root) =>
      !root.classList.contains("ui-datepicker-inline") &&
      !root.parentElement?.closest(".ui-datepicker"),
  );
}

export function displayedDayCalendarRoots(document: Document): HTMLElement[] {
  return dayCalendarRoots(document).filter(isDisplayed);
}

function adjacentTriggers(target: HTMLInputElement): HTMLElement[] {
  return [target.previousElementSibling, target.nextElementSibling].filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement &&
      element.classList.contains("ui-datepicker-trigger"),
  );
}

function usableTrigger(trigger: HTMLElement): boolean {
  return (
    (trigger instanceof HTMLButtonElement ||
      trigger instanceof HTMLImageElement) &&
    !trigger.closest(HIDDEN) &&
    !trigger.closest("[aria-disabled='true']") &&
    !(trigger instanceof HTMLButtonElement && trigger.disabled) &&
    !(
      trigger instanceof HTMLButtonElement &&
      trigger.form !== null &&
      trigger.type !== "button"
    )
  );
}

export function dayCalendarSurfaceFor(
  target: HTMLInputElement,
): DayCalendarSurface | undefined {
  const unit = calendarUnitEvidence(target);
  if (
    target.type !== "text" ||
    !target.readOnly ||
    target.disabled ||
    !target.isConnected ||
    target.closest(HIDDEN) ||
    unit?.unit !== "day" ||
    unit.unitEvidence === "unconfirmed" ||
    !target.classList.contains("hasDatepicker")
  )
    return undefined;
  const roots = dayCalendarRoots(target.ownerDocument);
  if (roots.length !== 1 || roots[0]!.contains(target)) return undefined;
  const triggers = adjacentTriggers(target);
  if (triggers.length > 1) return undefined;
  const trigger = triggers[0];
  if (trigger && !usableTrigger(trigger)) return undefined;
  if (hasCalendarOwnershipConflict(target, trigger ?? target, roots[0]!))
    return undefined;
  return trigger
    ? { target, opener: trigger, popup: roots[0]!, openBy: "trigger" }
    : { target, opener: target, popup: roots[0]!, openBy: "target" };
}
