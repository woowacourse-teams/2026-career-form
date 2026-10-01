import type { InteractionDecisionProvider } from "../api/interaction-types";
import type { CalendarSurface } from "./calendar-surface";
import {
  calendarNavigationCandidates,
  calendarSelectShape,
  type CalendarRoleEvidence,
} from "./calendar-structure";
import { isDisplayed } from "./day-calendar-surface";
import { createCalendarRoleResolver } from "./calendar-role-resolver";

/** Widget selectors describe mechanics, never the input's date unit. */
function monthHeader(popup: HTMLElement) {
  const tables = Array.from(
    popup.querySelectorAll<HTMLElement>("table.ui-datepicker-calendar"),
  );
  if (tables.length !== 1 || tables.some(isDisplayed)) return;
  const selects = Array.from(popup.querySelectorAll("select"));
  const years = selects.filter(
    (select) => calendarSelectShape(select) === "year-options",
  );
  const months = selects.filter(
    (select) => calendarSelectShape(select) === "month-options",
  );
  const closes = Array.from(
    popup.querySelectorAll<HTMLButtonElement>(
      "button.ui-datepicker-close[data-handler=hide]",
    ),
  ).filter(
    (button) =>
      button.type === "button" && !button.disabled && isDisplayed(button),
  );
  const year = years[0],
    month = months[0],
    apply = closes[0];
  return years.length === 1 &&
    months.length === 1 &&
    closes.length === 1 &&
    year &&
    month &&
    apply
    ? { year, month, apply }
    : undefined;
}

export async function selectDeferredCalendarMonth(args: {
  surface: CalendarSurface;
  year: number;
  month: number;
  evidence: CalendarRoleEvidence;
  resolveRole: ReturnType<typeof createCalendarRoleResolver>;
  provider?: InteractionDecisionProvider;
  canonicalFieldKey: string;
  deadline: number;
  now?: () => number;
  signal?: AbortSignal;
  stable: () => boolean;
  change: (select: HTMLSelectElement, value: string) => boolean;
  activate: (element: HTMLElement) => boolean;
}): Promise<string | undefined> {
  const { popup } = args.surface;
  const stable = () => args.stable() && monthHeader(popup) !== undefined;
  // Confirm pending month approval before any year/month change.
  if (!stable()) return "calendar_month_structure_unconfirmed";
  for (const step of [
    {
      role: "CALENDAR_YEAR_CONTROL",
      key: "year",
      value: String(args.year),
      reason: "target_year_unavailable",
    },
    {
      role: "CALENDAR_MONTH_CONTROL",
      key: "month",
      value: String(args.month - 1),
      reason: "target_month_unavailable",
    },
  ] as const) {
    const header = monthHeader(popup);
    if (!header) return "calendar_month_structure_unconfirmed";
    const select = header[step.key];
    const option = Array.from(select.options).filter(
      (option) => option.value === step.value,
    );
    if (option.length !== 1 || option[0]?.disabled) return step.reason;
    const choice = await args.resolveRole({
      role: step.role,
      navigationCandidates:
        step.key === "year" ? calendarNavigationCandidates(popup) : [],
      candidates: [
        { candidateId: `calendar-control-${step.key}`, element: select },
      ],
      provider: args.provider,
      canonicalFieldKey: args.canonicalFieldKey,
      evidence: args.evidence,
      deadline: args.deadline,
      now: args.now,
      signal: args.signal,
      revalidate: () => stable() && monthHeader(popup)?.[step.key] === select,
    });
    if (!choice || !stable() || !args.change(choice.element, step.value))
      return step.reason;
    const next = monthHeader(popup);
    if (!next || next[step.key].value !== step.value)
      return "calendar_view_not_changed";
  }
  const header = monthHeader(popup);
  if (
    !header ||
    header.year.value !== String(args.year) ||
    header.month.value !== String(args.month - 1)
  )
    return "calendar_view_not_changed";
  const ready = () => {
    const current = monthHeader(popup);
    return (
      stable() &&
      current?.apply === header.apply &&
      current.year.value === String(args.year) &&
      current.month.value === String(args.month - 1)
    );
  };
  const apply = await args.resolveRole({
    role: "CALENDAR_APPLY",
    candidates: [
      { candidateId: "calendar-control-apply", element: header.apply },
    ],
    provider: args.provider,
    canonicalFieldKey: args.canonicalFieldKey,
    evidence: args.evidence,
    deadline: args.deadline,
    now: args.now,
    signal: args.signal,
    revalidate: ready,
  });
  return apply && ready() && args.activate(apply.element)
    ? undefined
    : "calendar_apply_unavailable";
}
