import {
  awaitDeferredCalendarKind,
  closeDeferredCalendar,
  deferredCalendarOpening,
  knownDeferredRoots,
  newDeferredRoots,
  openedOnFocus,
  type DeferredCalendarKind,
} from "./calendar-deferred";
import { hasCalendarOwnershipConflict } from "./calendar-ownership";
import { calendarUnitEvidence } from "./calendar-unit";
import { isDisplayed } from "./day-calendar-surface";

/**
 * A readonly calendar field whose label, notation and length name no unit.
 * Review proves only the field group and its single opening gesture; the
 * calendar it mounts decides month or day at execution.
 */
export interface CalendarUnitProbeSurface {
  target: HTMLInputElement;
  opener: HTMLElement;
  popup: HTMLElement;
}

const HIDDEN = "[hidden], [inert], [aria-hidden='true']";
const POLL_MS = 25;

export function calendarUnitProbeSurfaceFor(
  target: HTMLInputElement,
): CalendarUnitProbeSurface | undefined {
  if (
    target.type !== "text" ||
    !target.readOnly ||
    target.disabled ||
    !target.isConnected ||
    target.closest(HIDDEN) ||
    target.classList.contains("hasDatepicker") ||
    calendarUnitEvidence(target) !== undefined
  )
    return undefined;
  const opening = deferredCalendarOpening(target);
  if (
    !opening ||
    hasCalendarOwnershipConflict(target, opening.opener, opening.group)
  )
    return undefined;
  return { target, opener: opening.opener, popup: opening.group };
}

export interface CalendarUnitProbeTimings {
  openWaitMs: number;
  closeWaitMs: number;
}

const DEFAULT_TIMINGS: CalendarUnitProbeTimings = {
  openWaitMs: 1_000,
  closeWaitMs: 1_000,
};

/**
 * Opens the calendar with the approved gesture, reads which calendar mounted,
 * then closes it without selecting anything. Undefined means the unit stayed
 * unknown or the calendar did not close; the caller writes nothing then.
 */
export async function probeCalendarUnit(args: {
  surface: CalendarUnitProbeSurface;
  running: () => boolean;
  timings?: Partial<CalendarUnitProbeTimings>;
}): Promise<DeferredCalendarKind | undefined> {
  const { target, opener } = args.surface;
  const timings = { ...DEFAULT_TIMINGS, ...args.timings };
  const document = target.ownerDocument;
  const known = knownDeferredRoots(document);
  if (opener === target) {
    target.focus();
    if (!(await openedOnFocus(document, known))) target.click();
  } else {
    opener.click();
  }
  const kind = args.running()
    ? await awaitDeferredCalendarKind({
        target,
        known,
        timeoutMs: timings.openWaitMs,
        now: Date.now,
        running: args.running,
      })
    : undefined;
  const opened = newDeferredRoots(document, known);
  closeDeferredCalendar(target, opener, opened);
  const until = Date.now() + timings.closeWaitMs;
  while (
    opened.some((root) => root.isConnected && isDisplayed(root)) &&
    Date.now() < until
  )
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
  if (opened.some((root) => root.isConnected && isDisplayed(root)))
    return undefined;
  return args.running() ? kind : undefined;
}
