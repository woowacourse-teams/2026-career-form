import { formatProfileDate } from "../profile/date-format";
import {
  calendarMonths,
  calendarYears,
} from "../interaction/calendar-controls";
import { calendarSurfaceFor } from "../interaction/calendar-surface";

export interface CalendarRepeatRowIdentity {
  itemId?: string;
  itemGroupId?: string;
  itemIndex?: number;
}

interface CalendarDomSnapshot {
  target: string;
  opener: string;
  popup: string;
  relation: string;
  row: string;
}

interface CalendarApprovalSnapshot {
  targetType: string;
  targetReadOnly: boolean;
  opener: HTMLElement;
  popup: HTMLElement;
  originalDate: string;
  targetYearMonth: string;
  profileFieldKey?: string;
  profileEntryId?: string;
  itemIndex?: number;
  repeatRow?: CalendarRepeatRowIdentity;
  domSignature: CalendarDomSnapshot;
}

export interface CalendarApproval {
  target: HTMLInputElement;
  opener: HTMLElement;
  popup: HTMLElement;
  originalDate: string;
  targetYearMonth: string;
  monthClue: string;
  profileFieldKey?: string;
  profileEntryId?: string;
  itemIndex?: number;
  repeatRow?: CalendarRepeatRowIdentity;
  unit: "month";
  snapshot: CalendarApprovalSnapshot;
}

export type CalendarApprovalValidation =
  { status: "valid" } | { status: "invalid"; reason: string };

function validDate(value: string): boolean {
  return formatProfileDate(value, "YYYY-MM-DD").status === "resolved";
}

function validMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function elementSignature(element: Element): string {
  const ignored = new Set([
    "aria-expanded",
    "aria-hidden",
    "aria-selected",
    "class",
    "data-state",
    "hidden",
    "value",
  ]);
  const attrs = Array.from(element.attributes)
    .filter(({ name }) => !ignored.has(name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, value }) => `${name}=${value}`)
    .join(";");
  return `${element.tagName}:${attrs}`;
}

function rowIdentity(
  target: HTMLInputElement,
): CalendarRepeatRowIdentity | undefined {
  const row = target.closest("[data-item-id], [data-item-group-id]");
  if (!row) return undefined;
  return {
    ...(row.getAttribute("data-item-id")
      ? { itemId: row.getAttribute("data-item-id")! }
      : {}),
    ...(row.getAttribute("data-item-group-id")
      ? { itemGroupId: row.getAttribute("data-item-group-id")! }
      : {}),
  };
}

function rowSignature(target: HTMLInputElement): string {
  const row = target.closest("[data-item-id], [data-item-group-id]");
  return row ? elementSignature(row) : "";
}

function relationSignature(
  target: HTMLInputElement,
  opener: HTMLElement,
): string {
  return [
    target.id,
    opener.getAttribute("aria-labelledby") ?? "",
    opener.getAttribute("aria-controls") ?? "",
  ].join("|");
}

function domSignature(
  target: HTMLInputElement,
  opener: HTMLElement,
  popup: HTMLElement,
): CalendarDomSnapshot {
  return {
    target: elementSignature(target),
    opener: elementSignature(opener),
    popup: elementSignature(popup),
    relation: relationSignature(target, opener),
    row: rowSignature(target),
  };
}

function currentMonthClue(
  popup: HTMLElement,
  targetYearMonth: string,
): string | undefined {
  const year = Number(targetYearMonth.slice(0, 4));
  const month = Number(targetYearMonth.slice(5, 7));
  const inspectHidden = { inspectHidden: true };
  return calendarYears(popup, inspectHidden).some(
    (candidate) => candidate.year === year,
  ) &&
    calendarMonths(popup, inspectHidden).some(
      (candidate) => candidate.month === month,
    )
    ? targetYearMonth
    : undefined;
}

export function createCalendarApproval({
  target,
  originalDate,
  targetYearMonth,
  profileFieldKey,
  profileEntryId,
  itemIndex,
  repeatRow,
}: {
  target: HTMLInputElement;
  originalDate: string;
  targetYearMonth: string;
  profileFieldKey?: string;
  profileEntryId?: string;
  itemIndex?: number;
  repeatRow?: CalendarRepeatRowIdentity;
}): CalendarApproval {
  if (!validDate(originalDate) || !validMonth(targetYearMonth)) {
    throw new Error(
      "Calendar approval requires a valid full date and YYYY-MM target.",
    );
  }
  const surface = calendarSurfaceFor(target);
  if (!surface) throw new Error("Calendar surface is not approved.");
  const monthClue = currentMonthClue(surface.popup, targetYearMonth);
  if (!monthClue) throw new Error("Calendar month clue is not approved.");
  const identity =
    repeatRow ??
    (itemIndex !== undefined ? { itemIndex } : rowIdentity(target));
  return {
    target,
    opener: surface.opener,
    popup: surface.popup,
    originalDate,
    targetYearMonth,
    monthClue,
    ...(profileFieldKey ? { profileFieldKey } : {}),
    ...(profileEntryId ? { profileEntryId } : {}),
    ...(itemIndex !== undefined ? { itemIndex } : {}),
    ...(identity
      ? {
          repeatRow: {
            ...identity,
            ...(itemIndex !== undefined && identity.itemIndex === undefined
              ? { itemIndex }
              : {}),
          },
        }
      : {}),
    unit: "month",
    snapshot: {
      targetType: target.type,
      targetReadOnly: target.readOnly,
      opener: surface.opener,
      popup: surface.popup,
      originalDate,
      targetYearMonth,
      ...(profileFieldKey ? { profileFieldKey } : {}),
      ...(profileEntryId ? { profileEntryId } : {}),
      ...(itemIndex !== undefined ? { itemIndex } : {}),
      ...(identity ? { repeatRow: { ...identity } } : {}),
      domSignature: domSignature(target, surface.opener, surface.popup),
    },
  };
}

export function revalidateCalendarApproval(
  approval: CalendarApproval,
): CalendarApprovalValidation {
  if (approval.unit !== "month")
    return { status: "invalid", reason: "unit_changed" };
  if (
    !validDate(approval.originalDate) ||
    !validMonth(approval.targetYearMonth)
  ) {
    return { status: "invalid", reason: "approved_value_invalid" };
  }
  if (
    approval.originalDate !== approval.snapshot.originalDate ||
    approval.targetYearMonth !== approval.snapshot.targetYearMonth ||
    approval.profileFieldKey !== approval.snapshot.profileFieldKey ||
    approval.profileEntryId !== approval.snapshot.profileEntryId ||
    approval.itemIndex !== approval.snapshot.itemIndex ||
    JSON.stringify(approval.repeatRow) !==
      JSON.stringify(approval.snapshot.repeatRow)
  ) {
    return { status: "invalid", reason: "approval_identity_changed" };
  }
  if (!approval.target.isConnected) {
    return { status: "invalid", reason: "target_detached" };
  }
  if (
    approval.target.type !== approval.snapshot.targetType ||
    approval.target.readOnly !== approval.snapshot.targetReadOnly ||
    !approval.target.readOnly
  ) {
    return { status: "invalid", reason: "target_changed" };
  }
  const surface = calendarSurfaceFor(approval.target);
  if (
    !surface ||
    surface.opener !== approval.snapshot.opener ||
    surface.popup !== approval.snapshot.popup
  ) {
    return { status: "invalid", reason: "calendar_surface_changed" };
  }
  if (
    currentMonthClue(surface.popup, approval.targetYearMonth) !==
    approval.monthClue
  ) {
    return { status: "invalid", reason: "month_clue_changed" };
  }
  const current = domSignature(approval.target, surface.opener, surface.popup);
  if (
    JSON.stringify(current) !== JSON.stringify(approval.snapshot.domSignature)
  ) {
    return { status: "invalid", reason: "dom_signature_changed" };
  }
  return { status: "valid" };
}
