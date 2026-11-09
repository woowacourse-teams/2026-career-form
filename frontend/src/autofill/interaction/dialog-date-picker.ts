import { parseCalendarMonth } from "./calendar-controls";
import { isDisplayed } from "./day-calendar-surface";

/**
 * A date field drawn as a button that opens its own dialog calendar. The
 * calendar steps through levels (years, months, days) made of plain buttons.
 * Only ARIA, button text and DOM order are read; no widget class is assumed.
 */

const DATE_CUE =
  /생년월일|년월|연월|날짜|일자|(?:시작|종료|취득|만료|입학|졸업|입사|퇴사|발급|발행|응시|전역|입대|복무)일|\bdate\b/i;
const FILLED_DATE = /\d{4}\s*[.\-/년]\s*\d{1,2}|\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*[.\-/,]\s*\d{4}/;

function text(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export function isDialogDateButton(element: Element): element is HTMLButtonElement {
  if (
    !(element instanceof HTMLButtonElement) ||
    element.type !== "button" ||
    element.getAttribute("aria-haspopup") !== "dialog"
  )
    return false;
  const shown = `${text(element)} ${element.getAttribute("aria-label") ?? ""}`;
  return DATE_CUE.test(shown) || FILLED_DATE.test(shown);
}

export function dialogDateButtonValue(button: HTMLButtonElement): string {
  const shown = text(button);
  return /\d/.test(shown) ? shown : "";
}

export interface DialogDateParts {
  year: number;
  month: number;
  day: number;
}

export function dialogDateParts(value: string): DialogDateParts | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? { year, month, day }
    : undefined;
}

function numbers(value: string): number[] {
  return (value.match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b);
}

function sameNumbers(found: number[], expected: number[]): boolean {
  const sorted = [...expected].sort((a, b) => a - b);
  return found.length === sorted.length && found.every((n, i) => n === sorted[i]);
}

export function dialogDateShown(
  button: HTMLButtonElement,
  parts: DialogDateParts,
): "day" | "month" | undefined {
  const found = numbers(dialogDateButtonValue(button));
  if (sameNumbers(found, [parts.year, parts.month, parts.day])) return "day";
  if (sameNumbers(found, [parts.year, parts.month])) return "month";
  return undefined;
}

export interface DialogDateApproval {
  target: HTMLButtonElement;
  originalDate: string;
  profileFieldKey?: string;
  profileEntryId?: string;
  itemIndex?: number;
}

export function createDialogDateApproval(
  approval: DialogDateApproval,
): DialogDateApproval {
  if (!dialogDateParts(approval.originalDate))
    throw new Error("Dialog date approval requires a valid full date.");
  if (
    !approval.target.isConnected ||
    !isDialogDateButton(approval.target) ||
    approval.target.getAttribute("aria-expanded") === "true"
  )
    throw new Error("Dialog date button is not approved.");
  return { ...approval };
}

export function dialogDateApprovalValid(approval: DialogDateApproval): boolean {
  return (
    approval.target.isConnected &&
    !approval.target.disabled &&
    isDialogDateButton(approval.target) &&
    !!dialogDateParts(approval.originalDate)
  );
}

export type DialogDateExecutionResult =
  | { status: "completed" }
  | { status: "needs-verification"; reason: string };

export interface DialogDateTimings {
  /** How long to wait for the dialog to open or change level. */
  stepWaitMs: number;
  /** How long to wait for the dialog to close after the last choice. */
  closeWaitMs: number;
}

export const DEFAULT_DIALOG_DATE_TIMINGS: DialogDateTimings = {
  stepWaitMs: 1_500,
  closeWaitMs: 1_500,
};

const MAX_STEPS = 40;
const POLL_MS = 25;

export interface ExecuteDialogDateSelectionArgs {
  target: HTMLButtonElement;
  targetDate: string;
  signal?: AbortSignal;
  assertCurrent?: () => boolean;
  timings?: DialogDateTimings;
}

function openPopup(button: HTMLButtonElement): HTMLElement | undefined {
  if (button.getAttribute("aria-expanded") !== "true") return undefined;
  const ids = button.getAttribute("aria-controls")?.trim().split(/\s+/) ?? [];
  const popup =
    ids.length === 1 ? button.ownerDocument.getElementById(ids[0]!) : null;
  return popup instanceof HTMLElement &&
    popup.getAttribute("role") === "dialog" &&
    isDisplayed(popup)
    ? popup
    : undefined;
}

function closed(button: HTMLButtonElement): boolean {
  return button.getAttribute("aria-expanded") !== "true";
}

function monthOf(label: string): number | undefined {
  const korean = /^(\d{1,2})\s*월$/.exec(label);
  const value = korean
    ? Number(korean[1])
    : /^\d{1,2}$/.test(label)
      ? Number(label)
      : parseCalendarMonth(label);
  return value !== undefined && value >= 1 && value <= 12 ? value : undefined;
}

interface Level {
  kind: "years" | "months" | "days";
  cells: HTMLButtonElement[];
  header?: HTMLButtonElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
}

function readLevel(popup: HTMLElement): Level | undefined {
  const buttons = Array.from(popup.querySelectorAll<HTMLButtonElement>("button"));
  const navigation = buttons.filter((button) => !text(button));
  if (navigation.length !== 2) return undefined;
  const [previous, next] = navigation as [HTMLButtonElement, HTMLButtonElement];
  const labelled = buttons.filter((button) => text(button));
  const years = labelled.filter((button) => /^\d{4}$/.test(text(button)));
  const months = labelled.filter(
    (button) => !/^\d+$/.test(text(button)) && monthOf(text(button)) !== undefined,
  );
  const days = labelled.filter((button) => /^\d{1,2}$/.test(text(button)));
  const pick = (kind: Level["kind"], cells: HTMLButtonElement[]) => {
    const rest = labelled.filter((button) => !cells.includes(button));
    if (rest.length > 1) return undefined;
    return { kind, cells, ...(rest[0] ? { header: rest[0] } : {}), previous, next };
  };
  if (days.length >= 28) return pick("days", days);
  if (months.length === 12) return pick("months", months);
  if (years.length >= 3) return pick("years", years);
  return undefined;
}

function headerYear(level: Level): number | undefined {
  const found = level.header ? text(level.header).match(/\d{4}/g) : null;
  return found?.length === 1 ? Number(found[0]) : undefined;
}

function headerMonth(level: Level): number | undefined {
  if (!level.header) return undefined;
  const rest = text(level.header).replace(/\d{4}\s*년?/, " ").trim();
  const korean = /(\d{1,2})\s*월/.exec(rest);
  if (korean) return monthOf(`${korean[1]}월`);
  const plain = rest.match(/\d{1,2}/g);
  if (plain?.length === 1) return monthOf(plain[0]!);
  return parseCalendarMonth(rest.replace(/[^A-Za-z]/g, ""));
}

function dayCell(level: Level, parts: DialogDateParts): HTMLButtonElement | undefined {
  const labelled = level.cells.filter((cell) => cell.getAttribute("aria-label"));
  if (labelled.length === level.cells.length) {
    const matches = labelled.filter((cell) => {
      const label = cell.getAttribute("aria-label")!;
      const found = numbers(label);
      const month = /(\d{1,2})\s*월/.exec(label)?.[1];
      return (
        sameNumbers(found, [parts.year, parts.month, parts.day]) &&
        (month === undefined || Number(month) === parts.month) &&
        text(cell) === String(parts.day)
      );
    });
    return matches.length === 1 ? matches[0] : undefined;
  }
  if (headerYear(level) !== parts.year || headerMonth(level) !== parts.month)
    return undefined;
  const matches = level.cells.filter((cell) => text(cell) === String(parts.day));
  return matches.length === 1 ? matches[0] : undefined;
}

type Choice =
  | { kind: "click"; element: HTMLButtonElement; final: boolean }
  | { kind: "fail"; reason: string };

function nextChoice(level: Level, parts: DialogDateParts): Choice {
  if (level.kind === "years") {
    const shown = level.cells.map((cell) => Number(text(cell)));
    const exact = level.cells.filter((cell) => Number(text(cell)) === parts.year);
    if (exact.length === 1) return { kind: "click", element: exact[0]!, final: false };
    if (exact.length > 1) return { kind: "fail", reason: "year_ambiguous" };
    return {
      kind: "click",
      element: parts.year < Math.min(...shown) ? level.previous : level.next,
      final: false,
    };
  }
  if (level.kind === "months") {
    const year = headerYear(level);
    if (year === undefined) return { kind: "fail", reason: "month_level_year_unknown" };
    if (year !== parts.year)
      return level.header
        ? { kind: "click", element: level.header, final: false }
        : { kind: "fail", reason: "month_level_year_mismatch" };
    const exact = level.cells.filter((cell) => monthOf(text(cell)) === parts.month);
    return exact.length === 1
      ? { kind: "click", element: exact[0]!, final: false }
      : { kind: "fail", reason: "month_cell_unmatched" };
  }
  const cell = dayCell(level, parts);
  if (cell) return { kind: "click", element: cell, final: true };
  return level.header
    ? { kind: "click", element: level.header, final: false }
    : { kind: "fail", reason: "day_cell_unmatched" };
}

function signature(popup: HTMLElement): string {
  return Array.from(popup.querySelectorAll("button"))
    .map((button) => text(button))
    .join("|");
}

async function waitUntil(
  condition: () => boolean,
  ms: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (signal?.aborted || Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return true;
}

function closeDialog(button: HTMLButtonElement, popup?: HTMLElement): void {
  if (closed(button)) return;
  (popup ?? button).dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
}

/**
 * Opens the button's dialog and walks it down to the approved day. A dialog
 * that closes after the month is a month field; the button must then show
 * the year and month. Any unreadable level closes the dialog and stops.
 */
export async function executeDialogDateSelection({
  target,
  targetDate,
  signal,
  assertCurrent = () => true,
  timings = DEFAULT_DIALOG_DATE_TIMINGS,
}: ExecuteDialogDateSelectionArgs): Promise<DialogDateExecutionResult> {
  const parts = dialogDateParts(targetDate);
  if (!parts) return { status: "needs-verification", reason: "invalid_date" };
  if (!closed(target) || dialogDateButtonValue(target))
    return { status: "needs-verification", reason: "target_not_empty" };
  const live = () => !signal?.aborted && target.isConnected && assertCurrent();
  if (!live()) return { status: "needs-verification", reason: "stale" };
  // Positioned dialogs hide themselves while their button is off-screen.
  const view = target.ownerDocument.defaultView;
  const rect = target.getBoundingClientRect();
  if (
    view &&
    (rect.bottom <= 0 ||
      rect.top >= view.innerHeight ||
      rect.right <= 0 ||
      rect.left >= view.innerWidth)
  )
    target.scrollIntoView?.({ block: "center", inline: "nearest" });
  target.click();
  let popup: HTMLElement | undefined;
  if (!(await waitUntil(() => !!(popup = openPopup(target)), timings.stepWaitMs, signal)))
    return { status: "needs-verification", reason: "dialog_not_opened" };
  const fail = (reason: string): DialogDateExecutionResult => {
    closeDialog(target, popup);
    return { status: "needs-verification", reason };
  };
  for (let step = 0; step < MAX_STEPS; step++) {
    if (!live()) return fail("stale");
    const level = readLevel(popup!);
    if (!level) return fail("level_unreadable");
    const choice = nextChoice(level, parts);
    if (choice.kind === "fail") return fail(choice.reason);
    const before = signature(popup!);
    const leavesMonths = level.kind === "months" && choice.element !== level.header;
    choice.element.click();
    if (choice.final || leavesMonths) {
      const settled = await waitUntil(
        () => closed(target) || signature(popup!) !== before,
        timings.closeWaitMs,
        signal,
      );
      if (!settled) return fail("no_response");
      if (closed(target)) {
        const expected = choice.final ? "day" : "month";
        if (
          !(await waitUntil(
            () => dialogDateShown(target, parts) === expected,
            timings.closeWaitMs,
            signal,
          ))
        )
          return { status: "needs-verification", reason: "value_unconfirmed" };
        return (await waitUntil(
          () => !popup!.isConnected || !isDisplayed(popup!),
          timings.closeWaitMs,
          signal,
        ))
          ? { status: "completed" }
          : { status: "needs-verification", reason: "dialog_left_open" };
      }
      if (choice.final) return fail("dialog_stayed_open");
      continue;
    }
    if (
      !(await waitUntil(
        () => closed(target) || signature(popup!) !== before,
        timings.stepWaitMs,
        signal,
      ))
    )
      return fail("no_response");
    if (closed(target)) return fail("closed_early");
  }
  return fail("too_many_steps");
}
