import { parseCalendarMonth } from "./calendar-controls";
import { openCalendarPopups } from "./calendar-surface";
import {
  dayCalendarSurfaceFor,
  displayedDayCalendarRoots,
  isDisplayed,
} from "./day-calendar-surface";
import {
  canonicalDayCalendarValue,
  dayCalendarDateParts,
  type DayCalendarValueFormat,
} from "./day-calendar-value";

export const DAY_CALENDAR_TIMEOUT_MS = 15_000;
export const DAY_CALENDAR_MAX_ACTIVATIONS = 8;

export interface DayCalendarTimings {
  /** How long to wait for the calendar to open or re-render. */
  openWaitMs: number;
  /** How long to wait for the calendar to close after the day is chosen. */
  closeWaitMs: number;
  /** How long the chosen value must remain before success is reported. */
  retentionMs: number;
}

export const DEFAULT_DAY_CALENDAR_TIMINGS: DayCalendarTimings = {
  openWaitMs: 1_000,
  // ui-datepicker hides with an animation (about 400ms by default).
  closeWaitMs: 2_000,
  retentionMs: 150,
};

const POLL_MS = 25;

export type DayCalendarExecutionResult =
  | { status: "completed"; targetDate: string }
  | { status: "needs-verification"; reason: string };

export interface ExecuteDayCalendarSelectionArgs {
  target: HTMLInputElement;
  /** Canonical YYYY-MM-DD date to choose. */
  targetDate: string;
  /** Exact notation the target must show, when the page declares one. */
  targetFormat?: DayCalendarValueFormat;
  now?: () => number;
  signal?: AbortSignal;
  timings?: DayCalendarTimings;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const SHORT_MONTHS = new Map(
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
  ].map((name, index) => [name, index + 1]),
);

function monthOfLabel(label: string): number | undefined {
  const normalized = label.replace(/\s+/g, " ").trim();
  const numeric = /^(0?[1-9]|1[0-2])$/.exec(normalized);
  if (numeric) return Number(numeric[1]);
  return (
    parseCalendarMonth(normalized) ??
    SHORT_MONTHS.get(normalized.toLowerCase().replace(/\.$/, ""))
  );
}

function usableSelect(select: HTMLSelectElement): boolean {
  return (
    !select.disabled &&
    !select.multiple &&
    !select.closest("[aria-disabled='true']") &&
    isDisplayed(select)
  );
}

interface CalendarHeader {
  year: HTMLSelectElement;
  month: HTMLSelectElement;
}

type Step<T> = { ok: true; value: T } | { ok: false; reason: string };

function readHeader(popup: HTMLElement): Step<CalendarHeader> {
  const years = popup.querySelectorAll<HTMLSelectElement>(
    "select.ui-datepicker-year",
  );
  const months = popup.querySelectorAll<HTMLSelectElement>(
    "select.ui-datepicker-month",
  );
  if (
    years.length !== 1 ||
    months.length !== 1 ||
    !usableSelect(years[0]!) ||
    !usableSelect(months[0]!)
  )
    return { ok: false, reason: "calendar_header_unavailable" };
  const year = years[0]!;
  const month = months[0]!;
  const yearOptions = Array.from(year.options);
  if (
    yearOptions.length === 0 ||
    yearOptions.some(
      (option) =>
        !/^\d{4}$/.test(option.value) ||
        option.textContent?.trim() !== option.value,
    ) ||
    new Set(yearOptions.map((option) => option.value)).size !==
      yearOptions.length
  )
    return { ok: false, reason: "year_select_unrecognized" };
  const monthOptions = Array.from(month.options);
  // The family stores months as 0-11; every label must agree with its value.
  if (
    monthOptions.length === 0 ||
    monthOptions.some(
      (option) =>
        !/^(?:\d|1[01])$/.test(option.value) ||
        monthOfLabel(option.textContent ?? "") !== Number(option.value) + 1,
    ) ||
    new Set(monthOptions.map((option) => option.value)).size !==
      monthOptions.length
  )
    return { ok: false, reason: "month_select_unrecognized" };
  return { ok: true, value: { year, month } };
}

function dayLabel(cell: HTMLTableCellElement): string {
  return cell.textContent?.replace(/\s+/g, "").trim() ?? "";
}

function unavailableCell(cell: HTMLTableCellElement): boolean {
  return (
    cell.classList.contains("ui-datepicker-unselectable") ||
    cell.classList.contains("ui-state-disabled") ||
    cell.getAttribute("aria-disabled") === "true"
  );
}

function dayLinks(
  popup: HTMLElement,
  year: number,
  month: number,
  day: number,
): HTMLAnchorElement[] {
  return Array.from(
    popup.querySelectorAll<HTMLTableCellElement>("td[data-year][data-month]"),
  )
    .filter(
      (cell) =>
        cell.dataset.year === String(year) &&
        cell.dataset.month === String(month - 1) &&
        !cell.classList.contains("ui-datepicker-other-month") &&
        !unavailableCell(cell) &&
        dayLabel(cell) === String(day),
    )
    .flatMap((cell) => {
      const links = Array.from(cell.querySelectorAll("a"));
      return links.length === 1 &&
        (links[0]!.dataset.date === undefined ||
          links[0]!.dataset.date === String(day)) &&
        links[0]!.getAttribute("aria-disabled") !== "true"
        ? [links[0]!]
        : [];
    });
}

function disabledDay(popup: HTMLElement, day: number): boolean {
  return Array.from(
    popup.querySelectorAll<HTMLTableCellElement>(".ui-datepicker-calendar td"),
  ).some(
    (cell) =>
      !cell.classList.contains("ui-datepicker-other-month") &&
      unavailableCell(cell) &&
      dayLabel(cell) === String(day),
  );
}

function safeLink(link: HTMLAnchorElement): boolean {
  const href = link.getAttribute("href");
  return href === null || href === "#";
}

const fail = (reason: string): DayCalendarExecutionResult => ({
  status: "needs-verification",
  reason,
});

export async function executeDayCalendarSelection(
  args: ExecuteDayCalendarSelectionArgs,
): Promise<DayCalendarExecutionResult> {
  const parts =
    /^\d{4}-\d{2}-\d{2}$/.test(args.targetDate) &&
    dayCalendarDateParts(args.targetDate);
  if (!parts) return fail("invalid_target_date");
  const now = args.now ?? Date.now;
  const timings = args.timings ?? DEFAULT_DAY_CALENDAR_TIMINGS;
  const started = now();
  if (args.signal?.aborted) return fail("calendar_aborted");
  const surface = dayCalendarSurfaceFor(args.target);
  if (!surface) return fail("unverified_calendar_surface");
  const document = args.target.ownerDocument;
  const { target, popup } = surface;

  const targetIsStable = () =>
    target.isConnected &&
    document.contains(target) &&
    target.type === "text" &&
    target.readOnly &&
    !target.disabled;
  const budgetLeft = () => now() - started < DAY_CALENDAR_TIMEOUT_MS;
  const interrupted = (fallback: string): DayCalendarExecutionResult =>
    fail(
      args.signal?.aborted
        ? "calendar_aborted"
        : !targetIsStable()
          ? "stale_target"
          : !budgetLeft()
            ? "calendar_budget_exhausted"
            : fallback,
    );
  const running = () =>
    !args.signal?.aborted && targetIsStable() && budgetLeft();

  if (!targetIsStable()) return fail("stale_target");
  if (target.value) return fail("existing_value");
  if (
    displayedDayCalendarRoots(document).length ||
    openCalendarPopups(document).length
  )
    return fail("calendar_already_open");

  // The calendar's own selects re-render; only page controls must stay put.
  const controls = () =>
    Array.from(
      document.querySelectorAll<Control>("input, select, textarea"),
    ).filter((control) => !popup.contains(control));
  const stateOf = (control: Control) => ({
    value: control.value,
    checked:
      control instanceof HTMLInputElement &&
      (control.type === "checkbox" || control.type === "radio")
        ? control.checked
        : undefined,
  });
  const before = new Map(
    controls()
      .filter((control) => control !== target)
      .map((control) => [control, stateOf(control)]),
  );
  const othersUnchanged = () => {
    const current = controls().filter((control) => control !== target);
    return (
      current.length === before.size &&
      current.every((control) => {
        const state = before.get(control);
        return (
          state !== undefined &&
          stateOf(control).value === state.value &&
          stateOf(control).checked === state.checked
        );
      })
    );
  };

  let activations = 0;
  const spend = () =>
    running() && ++activations <= DAY_CALENDAR_MAX_ACTIVATIONS;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const waitUntil = async (condition: () => boolean, timeoutMs: number) => {
    const until = now() + timeoutMs;
    while (running()) {
      if (condition()) return true;
      if (now() >= until) return false;
      await sleep(POLL_MS);
    }
    return false;
  };

  // Open through the same gesture a user would use.
  if (!spend()) return interrupted("calendar_budget_exhausted");
  if (surface.openBy === "target") {
    target.focus();
    target.click();
  } else {
    surface.opener.click();
  }
  if (!running()) return interrupted("owned_calendar_not_opened");
  const opened = await waitUntil(
    () =>
      isDisplayed(popup) &&
      popup.querySelector(
        "select.ui-datepicker-year, .ui-datepicker-calendar",
      ) !== null,
    timings.openWaitMs,
  );
  if (!running()) return interrupted("owned_calendar_not_opened");
  if (!opened) return fail("owned_calendar_not_opened");
  const shown = displayedDayCalendarRoots(document);
  if (
    shown.length !== 1 ||
    shown[0] !== popup ||
    openCalendarPopups(document).length
  )
    return fail("multiple_calendar_popups_open");

  const choose = async (
    pick: (header: CalendarHeader) => HTMLSelectElement,
    value: string,
    unavailable: string,
  ): Promise<string | undefined> => {
    const header = readHeader(popup);
    if (!header.ok) return header.reason;
    const select = pick(header.value);
    if (select.value === value) return undefined;
    const options = Array.from(select.options).filter(
      (option) => option.value === value,
    );
    if (options.length !== 1 || options[0]!.disabled) return unavailable;
    if (!spend()) return "calendar_budget_exhausted";
    select.value = value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    // The family re-renders the whole root; re-read fresh controls.
    const settled = await waitUntil(() => {
      const next = readHeader(popup);
      return next.ok && pick(next.value).value === value;
    }, timings.openWaitMs);
    return settled ? undefined : "calendar_view_not_changed";
  };

  const yearIssue = await choose(
    (header) => header.year,
    String(parts.year),
    "target_year_unavailable",
  );
  if (yearIssue) return interrupted(yearIssue);
  const monthIssue = await choose(
    (header) => header.month,
    String(parts.month - 1),
    "target_month_unavailable",
  );
  if (monthIssue) return interrupted(monthIssue);

  const header = readHeader(popup);
  if (!header.ok) return interrupted(header.reason);
  if (
    header.value.year.value !== String(parts.year) ||
    header.value.month.value !== String(parts.month - 1)
  )
    return interrupted("calendar_view_not_changed");

  const links = dayLinks(popup, parts.year, parts.month, parts.day);
  if (links.length !== 1)
    return interrupted(
      links.length === 0 && disabledDay(popup, parts.day)
        ? "target_day_disabled"
        : "target_day_unavailable",
    );
  const link = links[0]!;
  if (!safeLink(link)) return fail("unsafe_day_link");
  if (!spend()) return interrupted("calendar_budget_exhausted");
  // `href="#"` must never move the page, even if the widget forgets to cancel it.
  const preventNavigation = (event: Event) => event.preventDefault();
  link.addEventListener("click", preventNavigation);
  try {
    link.click();
  } finally {
    link.removeEventListener("click", preventNavigation);
  }

  const closed = await waitUntil(
    () => !isDisplayed(popup) && target.value !== "",
    timings.closeWaitMs,
  );
  if (!running()) return interrupted("target_value_not_retained");
  if (!closed && target.value === "") return fail("target_value_not_retained");
  if (!closed) return fail("popup_not_closed");
  await sleep(timings.retentionMs);
  if (args.signal?.aborted) return fail("calendar_aborted");
  if (!targetIsStable()) return fail("stale_target");
  if (!othersUnchanged()) return fail("other_input_changed");
  if (
    canonicalDayCalendarValue(target.value, args.targetFormat) !==
    args.targetDate
  )
    return fail("target_value_not_retained");
  if (isDisplayed(popup)) return fail("popup_not_closed");
  return { status: "completed", targetDate: args.targetDate };
}
