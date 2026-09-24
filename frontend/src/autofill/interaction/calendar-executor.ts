import {
  calendarApplyControls,
  calendarMonths,
  calendarYears,
  calendarYearTriggers,
} from "./calendar-controls";
import { calendarSurfaceFor, openCalendarPopups } from "./calendar-surface";
import { resolveCalendarRole } from "./calendar-role-resolver";
import type { InteractionDecisionProvider } from "../api/interaction-types";

export const CALENDAR_FIELD_TIMEOUT_MS = 15_000;
export const CALENDAR_MAX_ACTIVATIONS = 8;
export const CALENDAR_MAX_ROLE_REQUESTS = 2;

export type CalendarExecutionResult =
  | { status: "completed"; targetYearMonth: string }
  | { status: "needs-verification"; reason: string };

export interface ExecuteCalendarSelectionArgs {
  target: HTMLInputElement;
  targetYearMonth: string;
  readTargetValue?: (target: HTMLInputElement) => string;
  now?: () => number;
  interactionDecisionProvider?: InteractionDecisionProvider;
  canonicalFieldKey?: string;
  signal?: AbortSignal;
}

function targetParts(
  value: string,
): { year: number; month: number } | undefined {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match
    ? { year: Number(match[1]), month: Number(match[2]) }
    : undefined;
}

export async function executeCalendarSelection(
  args: ExecuteCalendarSelectionArgs,
): Promise<CalendarExecutionResult> {
  const parts = targetParts(args.targetYearMonth);
  if (!parts)
    return { status: "needs-verification", reason: "invalid_target_month" };
  const started = (args.now ?? Date.now)();
  if (args.signal?.aborted)
    return { status: "needs-verification", reason: "calendar_aborted" };
  const surface = calendarSurfaceFor(args.target);
  if (!surface)
    return {
      status: "needs-verification",
      reason: "unverified_calendar_surface",
    };
  const read = args.readTargetValue ?? ((target) => target.value);
  const targetIsStable = () =>
    args.target.isConnected &&
    args.target.ownerDocument.contains(args.target) &&
    args.target.type === "text" &&
    args.target.readOnly &&
    !args.target.disabled;
  if (!targetIsStable())
    return { status: "needs-verification", reason: "stale_target" };
  if (read(args.target))
    return { status: "needs-verification", reason: "existing_value" };
  if (openCalendarPopups(args.target.ownerDocument).length)
    return { status: "needs-verification", reason: "calendar_already_open" };
  const controls = () =>
    Array.from(
      args.target.ownerDocument.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea"),
    );
  const before = new Map(
    controls().map((control) => [
      control,
      control === args.target ? read(args.target) : control.value,
    ]),
  );
  let activations = 0;
  const activate = (element: HTMLElement): boolean => {
    if (
      args.signal?.aborted ||
      !targetIsStable() ||
      !element.isConnected ||
      ++activations > CALENDAR_MAX_ACTIVATIONS ||
      (args.now ?? Date.now)() - started >= CALENDAR_FIELD_TIMEOUT_MS
    )
      return false;
    element.click();
    return targetIsStable();
  };
  const deadline = started + CALENDAR_FIELD_TIMEOUT_MS;
  const opener = await resolveCalendarRole({
    role: "CALENDAR_OPENER",
    candidates: [{ candidateId: "calendar-opener-1", element: surface.opener }],
    provider: args.interactionDecisionProvider,
    canonicalFieldKey: args.canonicalFieldKey ?? "calendar-month",
    deadline,
    now: args.now,
    signal: args.signal,
  });
  if (args.signal?.aborted)
    return { status: "needs-verification", reason: "calendar_aborted" };
  if (!opener)
    return {
      status: "needs-verification",
      reason: "calendar_opener_unavailable",
    };
  if (!activate(opener.element))
    return {
      status: "needs-verification",
      reason: args.signal?.aborted
        ? "calendar_aborted"
        : targetIsStable()
          ? "calendar_budget_exhausted"
          : "stale_target",
    };
  const openPopups = openCalendarPopups(args.target.ownerDocument);
  if (!openPopups.includes(surface.popup))
    return {
      status: "needs-verification",
      reason: "owned_calendar_not_opened",
    };
  if (openPopups.length !== 1)
    return {
      status: "needs-verification",
      reason: "multiple_calendar_popups_open",
    };
  // Reserve the second role request for Apply if this picker needs it.
  const reserveApplyRole = calendarApplyControls(surface.popup).length === 1;
  const triggerCandidates = calendarYearTriggers(surface.popup).map(
    (candidate, index) => ({
      ...candidate,
      candidateId: `calendar-year-trigger-${index + 1}`,
    }),
  );
  const yearTrigger = reserveApplyRole
    ? triggerCandidates.length === 1
      ? triggerCandidates[0]
      : undefined
    : await resolveCalendarRole({
        role: "CALENDAR_YEAR_TRIGGER",
        candidates: triggerCandidates,
        provider: args.interactionDecisionProvider,
        canonicalFieldKey: args.canonicalFieldKey ?? "calendar-month",
        deadline,
        now: args.now,
        signal: args.signal,
      });
  if (args.signal?.aborted)
    return { status: "needs-verification", reason: "calendar_aborted" };
  if (calendarYearTriggers(surface.popup).length && !yearTrigger)
    return {
      status: "needs-verification",
      reason: "year_list_trigger_unavailable",
    };
  if (yearTrigger && !activate(yearTrigger.element))
    return {
      status: "needs-verification",
      reason: args.signal?.aborted
        ? "calendar_aborted"
        : targetIsStable()
          ? "year_list_trigger_unavailable"
          : "stale_target",
    };
  const yearCandidates = calendarYears(surface.popup)
    .filter((candidate) => candidate.year === parts.year)
    .map((candidate, index) => ({
      ...candidate,
      candidateId: `calendar-year-${index + 1}`,
    }));
  if (yearCandidates.length !== 1)
    return { status: "needs-verification", reason: "target_year_unavailable" };
  if (!activate(yearCandidates[0]!.element))
    return {
      status: "needs-verification",
      reason: args.signal?.aborted
        ? "calendar_aborted"
        : targetIsStable()
          ? "target_year_unavailable"
          : "stale_target",
    };
  const monthCandidates = calendarMonths(surface.popup)
    .filter((candidate) => candidate.month === parts.month)
    .map((candidate, index) => ({
      ...candidate,
      candidateId: `calendar-month-${index + 1}`,
    }));
  if (monthCandidates.length !== 1)
    return { status: "needs-verification", reason: "target_month_unavailable" };
  if (!activate(monthCandidates[0]!.element))
    return {
      status: "needs-verification",
      reason: args.signal?.aborted
        ? "calendar_aborted"
        : targetIsStable()
          ? "target_month_unavailable"
          : "stale_target",
    };
  const apply = calendarApplyControls(surface.popup);
  if (apply.length) {
    if (!reserveApplyRole)
      return {
        status: "needs-verification",
        reason: "calendar_apply_unavailable",
      };
    const selectedApply = await resolveCalendarRole({
      role: "CALENDAR_APPLY",
      candidates: apply.map((candidate, index) => ({
        ...candidate,
        candidateId: `calendar-apply-${index + 1}`,
      })),
      provider: args.interactionDecisionProvider,
      canonicalFieldKey: args.canonicalFieldKey ?? "calendar-month",
      deadline,
      now: args.now,
      signal: args.signal,
    });
    if (!selectedApply || !activate(selectedApply.element))
      return {
        status: "needs-verification",
        reason: args.signal?.aborted
          ? "calendar_aborted"
          : targetIsStable()
            ? "calendar_apply_unavailable"
            : "stale_target",
      };
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  if (args.signal?.aborted)
    return { status: "needs-verification", reason: "calendar_aborted" };
  if (!targetIsStable())
    return { status: "needs-verification", reason: "stale_target" };
  if (
    controls().length !== before.size ||
    Array.from(before).some(
      ([control, value]) =>
        control !== args.target &&
        (!control.isConnected || control.value !== value),
    )
  )
    return { status: "needs-verification", reason: "other_input_changed" };
  if (read(args.target) !== args.targetYearMonth)
    return {
      status: "needs-verification",
      reason: "target_value_not_retained",
    };
  if (
    surface.popup.isConnected &&
    !surface.popup.matches("[hidden], [aria-hidden='true']")
  )
    return { status: "needs-verification", reason: "popup_not_closed" };
  return { status: "completed", targetYearMonth: args.targetYearMonth };
}
