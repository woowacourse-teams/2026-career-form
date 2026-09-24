export type DateTargetFormat =
  "YYYY-MM-DD" | "YYYY-MM" | "YYYY.MM" | "YYYY.MM.DD";

export type DateFormatResult =
  { status: "resolved"; value: string } | { status: "invalid"; reason: string };

const FORMATS: readonly DateTargetFormat[] = [
  "YYYY-MM-DD",
  "YYYY-MM",
  "YYYY.MM",
  "YYYY.MM.DD",
];

export function formatProfileDate(
  source: string,
  format: DateTargetFormat,
): DateFormatResult {
  if (!FORMATS.includes(format)) {
    return { status: "invalid", reason: "Unsupported target date format." };
  }

  const match =
    source.length === 10 ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(source) : null;
  if (!match) {
    return {
      status: "invalid",
      reason: "Expected a complete YYYY-MM-DD date.",
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) {
    return {
      status: "invalid",
      reason: "Date is outside the supported Gregorian range.",
    };
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (day < 1 || day > monthLengths[month - 1]) {
    return {
      status: "invalid",
      reason: "Day is invalid for the specified month.",
    };
  }

  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];
  switch (format) {
    case "YYYY-MM-DD":
      return {
        status: "resolved",
        value: `${yearText}-${monthText}-${dayText}`,
      };
    case "YYYY-MM":
      return { status: "resolved", value: `${yearText}-${monthText}` };
    case "YYYY.MM":
      return { status: "resolved", value: `${yearText}.${monthText}` };
    case "YYYY.MM.DD":
      return {
        status: "resolved",
        value: `${yearText}.${monthText}.${dayText}`,
      };
  }
}
