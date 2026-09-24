export interface CalendarControl<T extends HTMLElement> {
  element: T;
  year?: number;
  month?: number;
}

const ENGLISH_MONTHS = new Map([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12],
]);

function labelOf(element: HTMLElement): string {
  return [element.getAttribute("aria-label"), element.textContent]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();
}

function enabled(element: HTMLElement, inspectHidden: boolean): boolean {
  return (
    (inspectHidden ||
      !element.closest("[hidden], [inert], [aria-hidden='true']")) &&
    !element.closest("[aria-disabled='true']") &&
    !(element instanceof HTMLButtonElement && element.disabled) &&
    !(element instanceof HTMLInputElement && element.disabled)
  );
}

export function parseCalendarMonth(label: string): number | undefined {
  const normalized = label.trim().toLowerCase();
  const korean = /^(?:0?([1-9])|1([0-2]))월$/.exec(normalized);
  if (korean) return Number(korean[1] ?? `1${korean[2]}`);
  return ENGLISH_MONTHS.get(normalized);
}

export function calendarYears(
  root: Element,
  options: { inspectHidden?: boolean } = {},
): Array<CalendarControl<HTMLElement> & { year: number }> {
  const result = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, [role='button'], [role='option']",
    ),
  )
    .filter((element) => enabled(element, options.inspectHidden ?? false))
    .filter((element) => !element.hasAttribute("aria-haspopup"))
    .map((element) => ({
      element,
      year: /^\d{4}$/.test(labelOf(element))
        ? Number(labelOf(element))
        : undefined,
    }))
    .filter((item): item is CalendarControl<HTMLElement> & { year: number } =>
      Boolean(item.year && item.year >= 1900 && item.year <= 2100),
    );
  const counts = new Map<number, number>();
  result.forEach(({ year }) => counts.set(year, (counts.get(year) ?? 0) + 1));
  return result.filter(({ year }) => counts.get(year) === 1);
}

export function calendarYearTriggers(
  root: Element,
): Array<CalendarControl<HTMLElement>> {
  const result = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button[aria-haspopup='listbox'][aria-controls], [role='button'][aria-haspopup='listbox'][aria-controls]",
    ),
  ).filter((element) => enabled(element, false));
  return result.length === 1 ? result.map((element) => ({ element })) : [];
}

export function calendarApplyControls(
  root: Element,
): Array<CalendarControl<HTMLElement>> {
  const result = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button[type='button'][data-calendar-apply], [role='button'][data-calendar-apply]",
    ),
  ).filter((element) => enabled(element, false));
  return result.length === 1 ? result.map((element) => ({ element })) : [];
}

export function calendarMonths(
  root: Element,
  options: { inspectHidden?: boolean } = {},
): Array<CalendarControl<HTMLElement> & { month: number }> {
  const result = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, [role='button'], [role='option']",
    ),
  )
    .filter((element) => enabled(element, options.inspectHidden ?? false))
    .map((element) => ({
      element,
      month: parseCalendarMonth(labelOf(element)),
    }))
    .filter(
      (item): item is CalendarControl<HTMLElement> & { month: number } =>
        item.month !== undefined,
    );
  const counts = new Map<number, number>();
  result.forEach(({ month }) =>
    counts.set(month, (counts.get(month) ?? 0) + 1),
  );
  return result.filter(({ month }) => counts.get(month) === 1);
}
