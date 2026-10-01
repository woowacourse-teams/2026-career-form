import { formatProfileDate } from "../profile/date-format";

/** Display formats a readonly day calendar may write into its target. */
export type DayCalendarValueFormat = "YYYY-MM-DD" | "YYYY.MM.DD" | "YYYY/MM/DD";

const SEPARATORS: Record<DayCalendarValueFormat, string> = {
  "YYYY-MM-DD": "-",
  "YYYY.MM.DD": ".",
  "YYYY/MM/DD": "/",
};

export interface DayCalendarDateParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

/** Parses a canonical YYYY-MM-DD date, rejecting impossible calendar days. */
export function dayCalendarDateParts(
  value: string,
): DayCalendarDateParts | undefined {
  if (formatProfileDate(value, "YYYY-MM-DD").status !== "resolved")
    return undefined;
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

/**
 * Converts a value written by the calendar back to canonical YYYY-MM-DD.
 * With an approved format only that exact notation is accepted; without one
 * any single supported notation is accepted, so the exact day is still proven.
 */
export function canonicalDayCalendarValue(
  value: string,
  format?: DayCalendarValueFormat,
): string | undefined {
  const formats = format
    ? [format]
    : (Object.keys(SEPARATORS) as DayCalendarValueFormat[]);
  for (const candidate of formats) {
    const separator = SEPARATORS[candidate];
    if (
      value.length === 10 &&
      value[4] === separator &&
      value[7] === separator &&
      /^\d{4}.\d{2}.\d{2}$/.test(value)
    ) {
      const canonical = `${value.slice(0, 4)}-${value.slice(5, 7)}-${value.slice(8, 10)}`;
      return dayCalendarDateParts(canonical) ? canonical : undefined;
    }
  }
  return undefined;
}

export function formatDayCalendarValue(
  canonical: string,
  format: DayCalendarValueFormat,
): string {
  return canonical.replaceAll("-", SEPARATORS[format]);
}
