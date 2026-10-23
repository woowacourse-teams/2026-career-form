export type DatePart = "YEAR" | "MONTH" | "DAY";

const OPTION_PATTERN: Record<DatePart, RegExp> = {
  YEAR: /^(\d{4})\s*년?$/,
  MONTH: /^(\d{1,2})\s*월?$/,
  DAY: /^(\d{1,2})\s*일?$/,
};
const RANGE: Record<DatePart, readonly [number, number]> = {
  YEAR: [1000, 9999],
  MONTH: [1, 12],
  DAY: [1, 31],
};

/** One part of a stored YYYY-MM-DD date; undefined when it is not a real date. */
export function datePartOf(date: string, part: DatePart): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (!match) return undefined;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  )
    return undefined;
  return part === "YEAR" ? year : part === "MONTH" ? month : day;
}

/** The number an option shows for the part, ignoring leading zeros and the 년·월·일 suffix. */
function optionNumber(part: DatePart, displayName: string): number | undefined {
  const match = OPTION_PATTERN[part].exec(displayName.normalize("NFKC").trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  const [min, max] = RANGE[part];
  return value >= min && value <= max ? value : undefined;
}

/** True when more than half of the options have the format of the part. */
export function datePartOptionsFit(
  part: DatePart,
  options: readonly { displayName: string }[],
): boolean {
  const fitting = options.filter(
    (option) => optionNumber(part, option.displayName) !== undefined,
  ).length;
  return options.length > 0 && fitting * 2 > options.length;
}

/** The only option showing the part of the date, or undefined when there is none or several. */
export function matchDatePartOption(
  part: DatePart,
  date: string,
  options: readonly { displayName: string }[],
): string | undefined {
  const wanted = datePartOf(date, part);
  if (wanted === undefined || !datePartOptionsFit(part, options))
    return undefined;
  const matches = options.filter(
    (option) => optionNumber(part, option.displayName) === wanted,
  );
  return matches.length === 1 ? matches[0]!.displayName : undefined;
}
