import {
  calendarApplyControls,
  calendarMonths,
  calendarYears,
  calendarYearTriggers,
} from "./calendar-controls";
import { calendarSurfaceFor, openCalendarPopups } from "./calendar-surface";
import { createCalendarRoleResolver } from "./calendar-role-resolver";
import { calendarUnitEvidence } from "./calendar-unit";
import type { CalendarRoleEvidence } from "./calendar-structure";
import { selectDeferredCalendarMonth } from "./calendar-month-widget";
import { displayedDayCalendarRoots, isDisplayed } from "./day-calendar-surface";
export { CALENDAR_MAX_ROLE_REQUESTS } from "../api/calendar-role-contract";
import type { InteractionDecisionProvider } from "../api/interaction-types";

export const CALENDAR_FIELD_TIMEOUT_MS = 15_000;
export const CALENDAR_MAX_ACTIVATIONS = 8;

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
  assertCurrent?: () => boolean;
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
  const initialParent = args.target.parentElement;
  const targetAttributes = [
    "id",
    "name",
    "placeholder",
    "maxlength",
    "aria-labelledby",
    "aria-label",
  ] as const;
  const targetSnapshot = targetAttributes.map((name) =>
    args.target.getAttribute(name),
  );
  const resolveCalendarRole = createCalendarRoleResolver();
  const unit = calendarUnitEvidence(args.target);
  if (unit?.unit === "conflict" || unit?.unit === "day")
    return { status: "needs-verification", reason: "calendar_unit_conflict" };
  const evidence: CalendarRoleEvidence = {
    ...(unit && unit.unitEvidence !== "unconfirmed"
      ? unit
      : { unit: "month", unitEvidence: "month-options" }),
    ownership:
      surface.rendering === "deferred-jquery"
        ? "adjacent-trigger"
        : surface.opener.hasAttribute("aria-controls")
          ? "linked-popup"
          : "single-field",
  };
  const read = args.readTargetValue ?? ((target) => target.value);
  const targetIsStable = () =>
    args.target.isConnected &&
    args.target.ownerDocument.contains(args.target) &&
    args.target.type === "text" &&
    args.target.readOnly &&
    !args.target.disabled &&
    isDisplayed(args.target) &&
    args.target.parentElement === initialParent &&
    targetAttributes.every(
      (name, index) => args.target.getAttribute(name) === targetSnapshot[index],
    ) &&
    args.assertCurrent?.() !== false;
  if (!targetIsStable())
    return { status: "needs-verification", reason: "stale_target" };
  if (read(args.target))
    return { status: "needs-verification", reason: "existing_value" };
  if (
    openCalendarPopups(args.target.ownerDocument).length ||
    displayedDayCalendarRoots(args.target.ownerDocument).length
  )
    return { status: "needs-verification", reason: "calendar_already_open" };
  const controls = () =>
    Array.from(
      args.target.ownerDocument.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea"),
    ).filter((control) => !surface.popup.contains(control));
  const stateOf = (
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  ) => ({
    value: control === args.target ? read(args.target) : control.value,
    checked:
      control instanceof HTMLInputElement &&
      (control.type === "checkbox" || control.type === "radio")
        ? control.checked
        : undefined,
  });
  const before = new Map(
    controls().map((control) => [control, stateOf(control)]),
  );
  const othersUnchanged = () =>
    controls().length === before.size &&
    controls().every((control) => {
      const state = before.get(control);
      return (
        state !== undefined &&
        (control === args.target ||
          (stateOf(control).value === state.value &&
            stateOf(control).checked === state.checked))
      );
    });
  const stableSurface = () => {
    const current = calendarSurfaceFor(args.target);
    return (
      targetIsStable() &&
      othersUnchanged() &&
      current?.opener === surface.opener &&
      current.popup === surface.popup
    );
  };
  let activations = 0;
  const activate = (element: HTMLElement): boolean => {
    if (
      args.signal?.aborted ||
      !targetIsStable() ||
      !element.isConnected ||
      !isDisplayed(element) ||
      !othersUnchanged() ||
      (element instanceof HTMLButtonElement &&
        element.form !== null &&
        element.type !== "button") ||
      ++activations > CALENDAR_MAX_ACTIVATIONS ||
      (args.now ?? Date.now)() - started >= CALENDAR_FIELD_TIMEOUT_MS
    )
      return false;
    element.click();
    return targetIsStable();
  };
  const verifyOutcome = async (): Promise<CalendarExecutionResult> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    if (args.signal?.aborted)
      return { status: "needs-verification", reason: "calendar_aborted" };
    if (!targetIsStable())
      return { status: "needs-verification", reason: "stale_target" };
    if (
      controls().length !== before.size ||
      Array.from(before).some(
        ([control, state]) =>
          control !== args.target &&
          (!control.isConnected ||
            stateOf(control).value !== state.value ||
            stateOf(control).checked !== state.checked),
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
      openCalendarPopups(args.target.ownerDocument).includes(surface.popup)
    )
      return { status: "needs-verification", reason: "popup_not_closed" };
    return { status: "completed", targetYearMonth: args.targetYearMonth };
  };
  const deadline = started + CALENDAR_FIELD_TIMEOUT_MS;
  const opener = await resolveCalendarRole({
    role: "CALENDAR_OPENER",
    evidence,
    revalidate: () =>
      stableSurface() &&
      read(args.target) === "" &&
      openCalendarPopups(args.target.ownerDocument).length === 0 &&
      displayedDayCalendarRoots(args.target.ownerDocument).length === 0,
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
  if (surface.rendering === "deferred-jquery") {
    const issue = await selectDeferredCalendarMonth({
      surface,
      year: parts.year,
      month: parts.month,
      evidence,
      resolveRole: resolveCalendarRole,
      provider: args.interactionDecisionProvider,
      canonicalFieldKey: args.canonicalFieldKey ?? "calendar-month",
      deadline,
      now: args.now,
      signal: args.signal,
      stable: () =>
        stableSurface() &&
        read(args.target) === "" &&
        openCalendarPopups(args.target.ownerDocument).length === 1 &&
        isDisplayed(surface.popup),
      activate,
      change: (select, value) => {
        if (
          args.signal?.aborted ||
          !stableSurface() ||
          !surface.popup.contains(select) ||
          !isDisplayed(select) ||
          select.disabled ||
          ++activations > CALENDAR_MAX_ACTIVATIONS ||
          (args.now ?? Date.now)() >= deadline
        )
          return false;
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return targetIsStable();
      },
    });
    return issue
      ? { status: "needs-verification", reason: issue }
      : verifyOutcome();
  }
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
        evidence,
        revalidate: () =>
          stableSurface() &&
          read(args.target) === "" &&
          isDisplayed(surface.popup),
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
      evidence,
      revalidate: () =>
        stableSurface() &&
        (read(args.target) === "" ||
          read(args.target) === args.targetYearMonth) &&
        isDisplayed(surface.popup),
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
  return verifyOutcome();
}
