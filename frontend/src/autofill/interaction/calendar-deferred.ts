import { genericRowFor } from "../dom/repeatable-rows";
import {
  calendarMonths,
  calendarYears,
  parseCalendarMonth,
} from "./calendar-controls";
import { calendarSelectShape } from "./calendar-structure";
import { isDisplayed } from "./day-calendar-surface";

/**
 * Deferred-render calendars mount their popup only after the field is opened
 * (often as a portal). Approval can only prove the field group and its single
 * opening gesture; the calendar root itself is confirmed at execution time by
 * diffing the displayed calendar roots before and after that one gesture.
 */
export type DeferredCalendarKind = "month" | "day";

export interface DeferredCalendarOpening {
  /** The field group that owns the target and its opener. */
  group: HTMLElement;
  /** The single opener button, or the target itself when there is none. */
  opener: HTMLElement;
}

export interface DeferredCalendarRoot {
  root: HTMLElement;
  kind: DeferredCalendarKind;
}

const CONTROL = "input, select, textarea";
const CLICKABLE =
  "button, input[type='button'], input[type='submit'], input[type='reset'], input[type='image'], [role='button'], a[href]";
const DAY_CELL =
  "button, a, td, [role='gridcell'], [role='button'], [role='option']";
const CALENDAR_CLUE =
  /달력|캘린더|날짜|일자|기간|년|월|calendar|date|month|year|picker|선택|열기|select|open/iu;
const RISK =
  /삭제|제거|초기화|지우기|저장|제출|추가|등록|취소|delete|remove|clear|reset|save|submit|add|cancel/iu;
const POLL_MS = 25;

function nameOf(element: HTMLElement): string {
  const icons = Array.from(element.querySelectorAll("img, svg"))
    .map(
      (icon) =>
        icon.getAttribute("alt") ?? icon.getAttribute("aria-label") ?? "",
    )
    .join(" ");
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element instanceof HTMLInputElement ? element.value : element.textContent,
    icons,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function controlLabel(element: HTMLElement): string {
  return [element.getAttribute("aria-label"), element.textContent]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();
}

/** Displayed month calendars: the smallest root holding a year and 12 months. */
export function monthCalendarRoots(document: Document): HTMLElement[] {
  const roots = new Set<HTMLElement>();
  document
    .querySelectorAll<HTMLElement>("button, [role='button'], [role='option']")
    .forEach((control) => {
      if (
        parseCalendarMonth(controlLabel(control)) === undefined ||
        !isDisplayed(control)
      )
        return;
      for (
        let node = control.parentElement;
        node && !node.matches("body, html");
        node = node.parentElement
      ) {
        if (
          calendarMonths(node).length === 12 &&
          calendarYears(node).length > 0
        ) {
          if (isDisplayed(node)) roots.add(node);
          return;
        }
      }
    });
  return Array.from(roots);
}

/** Day-number cells without a nested day cell (a cell and its button count once). */
export function dayGridCells(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(DAY_CELL)).filter(
    (cell) =>
      /^\d{1,2}$/.test((cell.textContent ?? "").replace(/\s+/g, "")) &&
      !cell.querySelector(DAY_CELL) &&
      isDisplayed(cell),
  );
}

export function dayCalendarHeader(
  root: HTMLElement,
): { year: HTMLSelectElement; month: HTMLSelectElement } | undefined {
  const selects = Array.from(root.querySelectorAll("select"));
  const years = selects.filter(
    (select) => calendarSelectShape(select) === "year-options",
  );
  const months = selects.filter(
    (select) => calendarSelectShape(select, true) === "month-options",
  );
  return years.length === 1 && months.length === 1
    ? { year: years[0]!, month: months[0]! }
    : undefined;
}

/** Displayed day calendars: one year select, one month select and a day grid. */
export function dayCalendarGridRoots(document: Document): HTMLElement[] {
  const roots = new Set<HTMLElement>();
  document.querySelectorAll("select").forEach((select) => {
    if (calendarSelectShape(select) !== "year-options") return;
    for (
      let node = select.parentElement;
      node && !node.matches("body, html");
      node = node.parentElement
    ) {
      const years = Array.from(node.querySelectorAll("select")).filter(
        (candidate) => calendarSelectShape(candidate) === "year-options",
      );
      if (years.length > 1) return;
      if (dayCalendarHeader(node) && dayGridCells(node).length >= 28) {
        if (isDisplayed(node)) roots.add(node);
        return;
      }
    }
  });
  return Array.from(roots);
}

function displayedRoots(document: Document): DeferredCalendarRoot[] {
  return [
    ...monthCalendarRoots(document).map((root) => ({
      root,
      kind: "month" as const,
    })),
    ...dayCalendarGridRoots(document).map((root) => ({
      root,
      kind: "day" as const,
    })),
  ];
}

function safeOpener(element: HTMLElement): boolean {
  if (
    element.matches(":disabled") ||
    element.closest("[aria-disabled='true'], [inert]") ||
    (element instanceof HTMLButtonElement &&
      element.form !== null &&
      element.type !== "button") ||
    (element instanceof HTMLInputElement && element.type !== "button") ||
    (element instanceof HTMLAnchorElement &&
      !["", "#"].includes(element.getAttribute("href")?.trim() ?? ""))
  )
    return false;
  const name = nameOf(element);
  // An icon-only opener has no name; any name must be a calendar clue.
  return !RISK.test(name) && (name === "" || CALENDAR_CLUE.test(name));
}

/**
 * The field group whose only control is the target. It must hold zero or
 * exactly one opener; a second clickable is ambiguity, never a guess.
 */
export function deferredCalendarOpening(
  target: HTMLInputElement,
): DeferredCalendarOpening | undefined {
  const document = target.ownerDocument;
  const open = displayedRoots(document).map(({ root }) => root);
  if (open.some((root) => root.contains(target))) return undefined;
  const outside = (element: Element) =>
    !open.some((root) => root.contains(element));
  const row = genericRowFor(target);
  let fallback: HTMLElement | undefined;
  let distance = 0;
  for (
    let group = target.parentElement;
    group && distance < 6;
    group = group.parentElement, distance++
  ) {
    if (group.matches("body, html, form")) break;
    if (row && group !== row && !row.contains(group)) break;
    const controls = Array.from(
      group.querySelectorAll<HTMLElement>(CONTROL),
    ).filter(
      (control) =>
        outside(control) &&
        isDisplayed(control) &&
        !(
          control instanceof HTMLInputElement &&
          ["hidden", "button", "submit", "reset", "image"].includes(
            control.type,
          )
        ),
    );
    if (controls.length !== 1 || controls[0] !== target) break;
    const clickables = Array.from(
      group.querySelectorAll<HTMLElement>(CLICKABLE),
    ).filter(
      (element) =>
        element !== target && outside(element) && isDisplayed(element),
    );
    if (clickables.length > 1) return undefined;
    if (clickables.length === 1)
      return safeOpener(clickables[0]!)
        ? { group, opener: clickables[0]! }
        : undefined;
    fallback = group;
  }
  return fallback ? { group: fallback, opener: target } : undefined;
}

/** Roots already shown before the opening gesture; they are never adopted. */
export function knownDeferredRoots(document: Document): Set<HTMLElement> {
  return new Set(displayedRoots(document).map(({ root }) => root));
}

/**
 * Waits for the roots that became visible after the single opening gesture.
 * Exactly one new root of the expected kind is required.
 */
export async function awaitDeferredCalendarRoot(args: {
  target: HTMLInputElement;
  known: ReadonlySet<HTMLElement>;
  kind: DeferredCalendarKind;
  timeoutMs: number;
  now: () => number;
  running: () => boolean;
}): Promise<HTMLElement | undefined> {
  const document = args.target.ownerDocument;
  const fresh = () =>
    displayedRoots(document).filter(({ root }) => !args.known.has(root));
  const sleep = () =>
    new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
  const until = args.now() + args.timeoutMs;
  while (args.running() && fresh().length === 0 && args.now() < until)
    await sleep();
  // Let a second portal that mounts in the same render become visible too.
  if (args.running() && fresh().length) await sleep();
  if (!args.running()) return undefined;
  const roots = fresh();
  const root = roots[0];
  return roots.length === 1 &&
    root &&
    root.kind === args.kind &&
    !root.root.contains(args.target)
    ? root.root
    : undefined;
}

/** Every new root shown after the gesture, for closing on failure. */
export function newDeferredRoots(
  document: Document,
  known: ReadonlySet<HTMLElement>,
): HTMLElement[] {
  return displayedRoots(document)
    .map(({ root }) => root)
    .filter((root) => !known.has(root));
}

/**
 * Focus may already open a widget that a following click would toggle shut,
 * so the click is only sent when focus showed no new calendar root.
 */
export async function openedOnFocus(
  document: Document,
  known: ReadonlySet<HTMLElement>,
  waitMs = 2 * POLL_MS,
): Promise<boolean> {
  const until = Date.now() + waitMs;
  for (;;) {
    if (newDeferredRoots(document, known).length) return true;
    if (Date.now() >= until) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** Closes what the gesture opened: Escape first, then one opener toggle. */
export function closeDeferredCalendar(
  target: HTMLInputElement,
  opener: HTMLElement,
  roots: readonly HTMLElement[],
): void {
  const escape = (element: Element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  const shown = roots.filter((root) => isDisplayed(root));
  if (!shown.length) return;
  escape(target);
  if (
    opener !== target &&
    opener.isConnected &&
    isDisplayed(opener) &&
    shown.some((root) => isDisplayed(root))
  )
    opener.click();
}
