/**
 * Standard ACTFL proficiency abbreviations (OPIc and similar speaking exams).
 * Applicants usually record "IH"; some sites list only the full label.
 * Closed table: anything else is left as-is and must match an option exactly.
 */
const ACTFL_GRADES: Readonly<Record<string, string>> = {
  NL: "Novice Low",
  NM: "Novice Mid",
  NH: "Novice High",
  IL: "Intermediate Low",
  IM: "Intermediate Mid",
  IM1: "Intermediate Mid 1",
  IM2: "Intermediate Mid 2",
  IM3: "Intermediate Mid 3",
  IH: "Intermediate High",
  AL: "Advanced Low",
  AM: "Advanced Mid",
  AH: "Advanced High",
};

/**
 * Returns the option label to look for. The profile value wins when an option
 * has exactly that label; otherwise a known abbreviation expands only when
 * exactly one option carries the full label.
 */
export function observedGradeLabel(
  value: string,
  labels: readonly string[],
): string {
  if (labels.includes(value)) return value;
  const full = ACTFL_GRADES[value.trim().toUpperCase()];
  return full && labels.filter((label) => label === full).length === 1
    ? full
    : value;
}
