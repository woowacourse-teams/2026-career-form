import { calendarMonths, calendarYears } from "./calendar-controls";

export interface CalendarSurface {
  target: HTMLInputElement;
  opener: HTMLElement;
  popup: HTMLElement;
}

function isOpener(element: HTMLElement): boolean {
  return (
    element.matches("button, input[type='button'], [role='button']") &&
    !element.closest("[hidden], [inert], [aria-hidden='true']") &&
    !(element instanceof HTMLButtonElement && element.disabled)
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
        .map((popup) => ({ target, opener, popup })),
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
    .filter((opener) => !popups.some((popup) => popup.contains(opener)));
  return openers.length === 1 && popups.length === 1
    ? { target, opener: openers[0]!, popup: popups[0]! }
    : undefined;
}

export function calendarSurfaceFor(
  target: HTMLInputElement,
): CalendarSurface | undefined {
  if (
    target.type !== "text" ||
    !target.readOnly ||
    target.disabled ||
    target.closest("[hidden], [inert], [aria-hidden='true']")
  )
    return undefined;
  return explicitSurface(target) ?? containedSurface(target);
}
