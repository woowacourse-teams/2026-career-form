export interface CalendarUnitEvidence {
  readonly unit: "month" | "day";
  readonly unitEvidence: "target-format" | "target-label";
}

type CalendarUnitObservation =
  | CalendarUnitEvidence
  | { readonly unit: "month" | "day"; readonly unitEvidence: "unconfirmed" }
  | { readonly unit: "conflict" };

/** Two independent DOM clues; never infer a unit from site/input classes. */
export function calendarUnitEvidence(
  target: HTMLInputElement,
): CalendarUnitObservation | undefined {
  const labels = [
    target.getAttribute("aria-label") ?? "",
    ...Array.from(target.labels ?? [], (label) => label.textContent ?? ""),
    ...(target.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => target.ownerDocument.getElementById(id)?.textContent ?? ""),
  ].map((label) => label.trim());
  if (labels.join("").length > 512 || target.placeholder.length > 128)
    return { unit: "conflict" };
  const units = new Set(
    labels.flatMap((label) => {
      const day = /년\s*월\s*일|일(?:[^가-힣]|$)|\bdate\b/iu.test(label);
      const month = /년\s*월(?!\s*일)|월(?:[^가-힣]|$)|\bmonth\b/iu.test(label);
      return [...(day ? ["day"] : []), ...(month ? ["month"] : [])];
    }),
  );
  const hasUnitLabel = units.size === 1;
  const placeholder = target.placeholder.toUpperCase().trim();
  const day = /^YYYY([-./])MM\1DD$/.test(placeholder);
  const month = /^YYYY[-./]MM$/.test(placeholder);
  if (/YY|MM|DD/.test(placeholder) && !day && !month)
    return { unit: "conflict" };
  if (day) units.add("day");
  if (month) units.add("month");
  const length = target.getAttribute("maxlength");
  if (length !== null) {
    if (length !== "7" && length !== "10") return { unit: "conflict" };
    units.add(length === "7" ? "month" : "day");
  }
  if (units.size > 1) return { unit: "conflict" };
  if (units.size === 0) return;
  const unit = units.has("day") ? "day" : "month";
  if (!hasUnitLabel || (!day && !month && length === null))
    return { unit, unitEvidence: "unconfirmed" };
  return {
    unit,
    unitEvidence: day || month ? "target-format" : "target-label",
  };
}
