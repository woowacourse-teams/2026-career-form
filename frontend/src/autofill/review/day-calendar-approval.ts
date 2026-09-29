import {
  dayCalendarSurfaceFor,
  isDisplayed,
} from "../interaction/day-calendar-surface";
import {
  dayCalendarDateParts,
  formatDayCalendarValue,
  type DayCalendarValueFormat,
} from "../interaction/day-calendar-value";
import {
  elementSignature,
  rowIdentity,
  rowSignature,
  type CalendarApprovalValidation,
  type CalendarRepeatRowIdentity,
} from "./calendar-approval";

interface DayCalendarDomSnapshot {
  target: string;
  opener: string;
  row: string;
}

interface DayCalendarApprovalSnapshot {
  target: HTMLInputElement;
  opener: HTMLElement;
  popup: HTMLElement;
  openBy: "trigger" | "target";
  originalDate: string;
  targetDate: string;
  targetFormat?: DayCalendarValueFormat;
  displayValue: string;
  profileFieldKey?: string;
  profileEntryId?: string;
  itemIndex?: number;
  repeatRow?: CalendarRepeatRowIdentity;
  domSignature: DayCalendarDomSnapshot;
}

export interface DayCalendarApproval {
  unit: "day";
  target: HTMLInputElement;
  opener: HTMLElement;
  popup: HTMLElement;
  originalDate: string;
  /** Canonical YYYY-MM-DD date the calendar must select. */
  targetDate: string;
  /** Exact notation declared by the page, when present. */
  targetFormat?: DayCalendarValueFormat;
  /** The value shown to the user and expected in the target. */
  displayValue: string;
  profileFieldKey?: string;
  profileEntryId?: string;
  itemIndex?: number;
  repeatRow?: CalendarRepeatRowIdentity;
  snapshot: DayCalendarApprovalSnapshot;
}

export type DayCalendarFormatResult =
  | { status: "resolved"; format?: DayCalendarValueFormat }
  | { status: "invalid"; reason: string };

const DAY_TOKENS: ReadonlyArray<[string, DayCalendarValueFormat]> = [
  ["YYYY-MM-DD", "YYYY-MM-DD"],
  ["YYYY.MM.DD", "YYYY.MM.DD"],
  ["YYYY/MM/DD", "YYYY/MM/DD"],
];

/**
 * Resolves the notation the target will show. A missing placeholder leaves
 * the notation open (the exact day is still verified); a month-only or mixed
 * clue means the target is not a day field and must be held.
 */
export function resolveDayCalendarFormat(
  target: HTMLInputElement,
): DayCalendarFormatResult {
  const maxLength = target.getAttribute("maxlength");
  if (
    maxLength !== null &&
    (!/^\d+$/.test(maxLength) || Number(maxLength) < 10)
  )
    return { status: "invalid", reason: "length_conflict" };
  const placeholder = target.getAttribute("placeholder")?.trim() ?? "";
  if (!placeholder) return { status: "resolved" };
  const upper = placeholder.toUpperCase();
  const found = DAY_TOKENS.filter(([token]) => upper.includes(token));
  const remainder = found.reduce(
    (text, [token]) => text.replaceAll(token, " "),
    upper,
  );
  if (found.length > 1 || /YY|MM|DD/.test(remainder))
    return { status: "invalid", reason: "format_clue_conflict" };
  return found.length === 1
    ? { status: "resolved", format: found[0]![1] }
    : { status: "resolved" };
}

function domSignature(
  target: HTMLInputElement,
  opener: HTMLElement,
): DayCalendarDomSnapshot {
  return {
    // Widgets toggle focus styles and ARIA state; structure must not change.
    target: elementSignature(target, ["style"]),
    opener: opener === target ? "target" : elementSignature(opener, ["style"]),
    row: rowSignature(target),
  };
}

export function createDayCalendarApproval({
  target,
  originalDate,
  profileFieldKey,
  profileEntryId,
  itemIndex,
  repeatRow,
}: {
  target: HTMLInputElement;
  originalDate: string;
  profileFieldKey?: string;
  profileEntryId?: string;
  itemIndex?: number;
  repeatRow?: CalendarRepeatRowIdentity;
}): DayCalendarApproval {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(originalDate) ||
    !dayCalendarDateParts(originalDate)
  )
    throw new Error("Day calendar approval requires a valid full date.");
  const surface = dayCalendarSurfaceFor(target);
  if (!surface) throw new Error("Day calendar surface is not approved.");
  if (isDisplayed(surface.popup))
    throw new Error("Day calendar must be closed before approval.");
  const format = resolveDayCalendarFormat(target);
  if (format.status !== "resolved")
    throw new Error("Day calendar target format is not approved.");
  const displayValue = formatDayCalendarValue(
    originalDate,
    format.format ?? "YYYY-MM-DD",
  );
  const identity =
    repeatRow ??
    (itemIndex !== undefined ? { itemIndex } : rowIdentity(target));
  const common = {
    originalDate,
    targetDate: originalDate,
    ...(format.format ? { targetFormat: format.format } : {}),
    displayValue,
    ...(profileFieldKey ? { profileFieldKey } : {}),
    ...(profileEntryId ? { profileEntryId } : {}),
    ...(itemIndex !== undefined ? { itemIndex } : {}),
  };
  return {
    unit: "day",
    target,
    opener: surface.opener,
    popup: surface.popup,
    ...common,
    ...(identity ? { repeatRow: { ...identity } } : {}),
    snapshot: {
      target,
      opener: surface.opener,
      popup: surface.popup,
      openBy: surface.openBy,
      ...common,
      ...(identity ? { repeatRow: { ...identity } } : {}),
      domSignature: domSignature(target, surface.opener),
    },
  };
}

export function revalidateDayCalendarApproval(
  approval: DayCalendarApproval,
): CalendarApprovalValidation {
  const { snapshot } = approval;
  if (approval.unit !== "day")
    return { status: "invalid", reason: "unit_changed" };
  if (
    approval.originalDate !== approval.targetDate ||
    !dayCalendarDateParts(approval.targetDate)
  )
    return { status: "invalid", reason: "approved_value_invalid" };
  if (
    approval.target !== snapshot.target ||
    approval.originalDate !== snapshot.originalDate ||
    approval.targetDate !== snapshot.targetDate ||
    approval.targetFormat !== snapshot.targetFormat ||
    approval.displayValue !== snapshot.displayValue ||
    approval.profileFieldKey !== snapshot.profileFieldKey ||
    approval.profileEntryId !== snapshot.profileEntryId ||
    approval.itemIndex !== snapshot.itemIndex ||
    JSON.stringify(approval.repeatRow) !== JSON.stringify(snapshot.repeatRow)
  )
    return { status: "invalid", reason: "approval_identity_changed" };
  if (!approval.target.isConnected)
    return { status: "invalid", reason: "target_detached" };
  const surface = dayCalendarSurfaceFor(approval.target);
  if (
    !surface ||
    surface.opener !== snapshot.opener ||
    surface.popup !== snapshot.popup ||
    surface.openBy !== snapshot.openBy
  )
    return { status: "invalid", reason: "calendar_surface_changed" };
  const format = resolveDayCalendarFormat(approval.target);
  if (format.status !== "resolved" || format.format !== snapshot.targetFormat)
    return { status: "invalid", reason: "target_format_changed" };
  if (
    JSON.stringify(domSignature(approval.target, surface.opener)) !==
    JSON.stringify(snapshot.domSignature)
  )
    return { status: "invalid", reason: "dom_signature_changed" };
  return { status: "valid" };
}
