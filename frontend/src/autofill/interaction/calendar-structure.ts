import type { CalendarStructure } from "../api/interaction-types";
import { parseCalendarMonth } from "./calendar-controls";
import { isDisplayed } from "./day-calendar-surface";

export type CalendarRoleEvidence = Pick<
  CalendarStructure,
  "unit" | "unitEvidence" | "ownership"
>;

export function calendarSelectShape(
  select: HTMLSelectElement,
  partial = false,
): "year-options" | "month-options" | undefined {
  const options = Array.from(select.options);
  if (
    select.disabled ||
    select.multiple ||
    !isDisplayed(select) ||
    options.length === 0 ||
    options.length > 201
  )
    return;
  if (
    options.every(
      (option) =>
        /^\d{4}$/.test(option.value) &&
        option.textContent?.trim() === option.value,
    ) &&
    new Set(options.map((option) => option.value)).size === options.length
  )
    return "year-options";
  if (
    (partial || options.length === 12) &&
    options.length <= 12 &&
    new Set(options.map((option) => option.value)).size === options.length &&
    options.every((option, index) => {
      const label = option.textContent?.trim() ?? "";
      const shortMonth =
        [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ].indexOf(label.toLowerCase().replace(/\.$/, "")) + 1;
      const month =
        parseCalendarMonth(label) ??
        (/^(?:0?[1-9]|1[0-2])$/.test(label)
          ? Number(label)
          : shortMonth || undefined);
      return (
        /^(?:\d|1[01])$/.test(option.value) &&
        (partial || option.value === String(index)) &&
        month === Number(option.value) + 1
      );
    })
  )
    return "month-options";
}

export function calendarCandidateStructure(
  element: HTMLElement,
  evidence: CalendarRoleEvidence,
): CalendarStructure | undefined {
  if (!isDisplayed(element) || element.closest("[aria-disabled=true], [inert]"))
    return;
  const common = { ...evidence, valueShape: "none" as const };
  if (element instanceof HTMLSelectElement) {
    const valueShape = calendarSelectShape(element, evidence.unit === "day");
    return valueShape
      ? { ...common, tag: "select", activation: "change", valueShape }
      : undefined;
  }
  if (element instanceof HTMLInputElement)
    return element.readOnly && !element.disabled
      ? { ...common, tag: "input", activation: "focus" }
      : undefined;
  if (element instanceof HTMLImageElement)
    return { ...common, tag: "img", activation: "click" };
  if (element instanceof HTMLButtonElement) {
    if (element.disabled || (element.form && element.type !== "button")) return;
    return {
      ...common,
      tag: "button",
      activation: "click",
      valueShape:
        element.hasAttribute("data-calendar-apply") ||
        element.matches(".ui-datepicker-close[data-handler=hide]")
          ? "apply"
          : "none",
    };
  }
  if (element instanceof HTMLAnchorElement) {
    if (
      element.getAttribute("href") !== null &&
      element.getAttribute("href") !== "#"
    )
      return;
    const handler = element.getAttribute("data-handler");
    return {
      ...common,
      tag: "a",
      activation: "click",
      valueShape:
        handler === "prev"
          ? "previous"
          : handler === "next"
            ? "next"
            : element.closest("td[data-year][data-month]")
              ? "day-grid"
              : "none",
    };
  }
  if (element.matches("div[role=button], div[role=option]"))
    return { ...common, tag: "div", activation: "click" };
}

/** Observed movement controls are classified, never activated by this executor. */
export function calendarNavigationCandidates(popup: HTMLElement) {
  return Array.from(
    popup.querySelectorAll<HTMLElement>(
      "a[data-handler=prev], a[data-handler=next]",
    ),
  )
    .filter(
      (element) =>
        isDisplayed(element) &&
        !element.closest("[aria-disabled=true], .ui-state-disabled"),
    )
    .map((element, index) => ({
      candidateId: `calendar-navigation-${index + 1}`,
      element,
    }));
}
