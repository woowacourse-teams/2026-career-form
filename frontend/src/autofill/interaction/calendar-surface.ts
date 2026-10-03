import { calendarMonths, calendarYears } from "./calendar-controls";
import { calendarUnitEvidence } from "./calendar-unit";
import { hasCalendarOwnershipConflict } from "./calendar-ownership";
import { isDisplayed } from "./day-calendar-surface";

export interface CalendarSurface {
  target: HTMLInputElement;
  opener: HTMLElement;
  popup: HTMLElement;
  rendering: "rendered" | "deferred-jquery";
}

function accessibleName(element: HTMLElement): string {
  const document = element.ownerDocument;
  const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  return [element.getAttribute("aria-label"), labelledBy, element.textContent]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();
}

function hasMonthUnitClue(opener: HTMLElement): boolean {
  return /(?:월|month)/iu.test(accessibleName(opener));
}

function visible(element: HTMLElement): boolean {
  return isDisplayed(element);
}

function isOpener(element: HTMLElement): boolean {
  return (
    element.matches("button, input[type='button'], [role='button']") &&
    !element.closest(
      "[hidden], [inert], [aria-hidden='true'], [aria-disabled='true']",
    ) &&
    !(element instanceof HTMLButtonElement && element.disabled) &&
    !(element instanceof HTMLInputElement && element.disabled)
  );
}

function calendarRoot(root: HTMLElement): boolean {
  const inspection = { inspectHidden: true };
  return (
    calendarYears(root, inspection).length > 0 &&
    calendarMonths(root, inspection).length === 12
  );
}

function explicitSurface(
  target: HTMLInputElement,
): CalendarSurface | undefined {
  if (!target.id) return undefined;
  const document = target.ownerDocument;
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>("[aria-controls]"),
  )
    .filter(isOpener)
    .filter((opener) =>
      (opener.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .includes(target.id!),
    )
    .flatMap((opener) =>
      (opener.getAttribute("aria-controls") ?? "")
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(
          (popup): popup is HTMLElement =>
            popup instanceof HTMLElement && calendarRoot(popup),
        )
        .map((popup) => ({
          target,
          opener,
          popup,
          rendering: "rendered" as const,
        })),
    );
  return matches.length === 1 ? matches[0] : undefined;
}

function containedSurface(
  target: HTMLInputElement,
): CalendarSurface | undefined {
  const container = target.parentElement;
  if (!container || container.matches("body, html, form")) return undefined;
  const inputs = Array.from(
    container.querySelectorAll<HTMLInputElement>("input[type='text']"),
  ).filter(
    (input) => !input.closest("[hidden], [inert], [aria-hidden='true']"),
  );
  if (inputs.length !== 1 || inputs[0] !== target) return undefined;
  const popups = Array.from(
    container.querySelectorAll<HTMLElement>(
      "[role='dialog'], [role='listbox'], [role='grid']",
    ),
  ).filter(calendarRoot);
  const openers = Array.from(
    container.querySelectorAll<HTMLElement>(
      "button, input[type='button'], [role='button']",
    ),
  )
    .filter(isOpener)
    .filter(hasMonthUnitClue)
    .filter((opener) => !popups.some((popup) => popup.contains(opener)));
  return openers.length === 1 && popups.length === 1
    ? {
        target,
        opener: openers[0]!,
        popup: popups[0]!,
        rendering: "rendered",
      }
    : undefined;
}

function jqueryMonthpickerSurface(
  target: HTMLInputElement,
): CalendarSurface | undefined {
  const unit = calendarUnitEvidence(target);
  if (
    unit?.unit !== "month" ||
    unit.unitEvidence === "unconfirmed" ||
    !target.classList.contains("hasDatepicker")
  )
    return undefined;
  const container = target.parentElement;
  if (!container || container.matches("body, html, form")) return undefined;
  const inputs = Array.from(
    container.querySelectorAll<HTMLInputElement>("input[type=text]"),
  ).filter((input) => !input.closest("[hidden], [inert], [aria-hidden=true]"));
  if (inputs.length !== 1 || inputs[0] !== target) return undefined;
  const triggers = [target.previousElementSibling, target.nextElementSibling]
    .filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element.classList.contains("ui-datepicker-trigger"),
    )
    .filter(
      (element) =>
        (element instanceof HTMLImageElement ||
          element instanceof HTMLButtonElement) &&
        !element.closest("[hidden], [inert], [aria-hidden=true]") &&
        !(element instanceof HTMLButtonElement && element.disabled) &&
        !(
          element instanceof HTMLButtonElement &&
          element.form !== null &&
          element.type !== "button"
        ),
    );
  const roots = Array.from(
    target.ownerDocument.querySelectorAll<HTMLElement>(
      "#ui-datepicker-div.ui-datepicker",
    ),
  );
  return triggers.length === 1 &&
    roots.length === 1 &&
    !roots[0]!.contains(target)
    ? {
        target,
        opener: triggers[0]!,
        popup: roots[0]!,
        rendering: "deferred-jquery",
      }
    : undefined;
}

export function openCalendarPopups(document: Document): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "[role='dialog'], [role='listbox'], [role='grid']",
    ),
  )
    .concat(
      Array.from(
        document.querySelectorAll<HTMLElement>(
          "#ui-datepicker-div.ui-datepicker",
        ),
      ),
    )
    .filter(
      (popup, index, roots) =>
        roots.indexOf(popup) === index &&
        visible(popup) &&
        (calendarRoot(popup) ||
          (popup.querySelectorAll("select.ui-datepicker-year").length === 1 &&
            popup.querySelectorAll("select.ui-datepicker-month").length === 1 &&
            !Array.from(popup.querySelectorAll<HTMLElement>("table")).some(
              isDisplayed,
            ))),
    );
}

export function calendarSurfaceFor(
  target: HTMLInputElement,
): CalendarSurface | undefined {
  const unit = calendarUnitEvidence(target);
  if (
    target.type !== "text" ||
    !target.readOnly ||
    target.disabled ||
    !target.isConnected ||
    unit?.unit === "day" ||
    unit?.unit === "conflict" ||
    target.closest("[hidden], [inert], [aria-hidden='true']")
  )
    return undefined;
  const surface =
    explicitSurface(target) ??
    containedSurface(target) ??
    jqueryMonthpickerSurface(target);
  return surface &&
    !hasCalendarOwnershipConflict(target, surface.opener, surface.popup)
    ? surface
    : undefined;
}
