import type { DateTargetFormat } from "../profile/date-format";
import type { FieldCandidateHandle } from "../dom/types";
const ATTRS = [
  "type",
  "placeholder",
  "min",
  "max",
  "step",
  "minlength",
  "maxlength",
  "pattern",
  "value",
] as const;
type Target = HTMLInputElement;
type Snapshot = { raw: Record<string, string | null>; effectiveType: string };
export interface DateTargetApproval {
  format: DateTargetFormat;
  element: Target;
  snapshot: Snapshot;
}
export type DateTargetFormatResult =
  | {
      status: "resolved";
      format: DateTargetFormat;
      approval: DateTargetApproval;
    }
  | { status: "unavailable"; reason: string };
type Check = { status: "valid" } | { status: "invalid"; reason: string };
const invalid = (reason: string): Check => ({ status: "invalid", reason });
const unavailable = (reason: string): DateTargetFormatResult => ({
  status: "unavailable",
  reason,
});
function capture(el: Target): Snapshot {
  return {
    raw: Object.fromEntries(ATTRS.map((a) => [a, el.getAttribute(a)])),
    effectiveType: el.type,
  };
}
function sameSnapshot(el: Target, s: Snapshot): boolean {
  return (
    el.type === s.effectiveType &&
    ATTRS.every((a) => el.getAttribute(a) === s.raw[a])
  );
}
function textFormatResult(p: string | null): {
  format?: DateTargetFormat;
  reason: string;
} {
  if (!p) return { reason: "Missing date format clue." };
  const found = [...p.matchAll(/YYYY\.MM\.DD|YYYY\.MM/g)].map((m) => ({
    text: m[0],
    i: m.index ?? 0,
  }));
  if (found.length > 1) return { reason: "Repeated supported date clues." };
  if (found.length === 0) return { reason: "Unsupported date format clue." };
  const x = found[0],
    left = p[x.i - 1],
    right = p[x.i + x.text.length];
  if (
    (left && /[A-Za-z0-9_.\/-]/.test(left)) ||
    (right && /[A-Za-z0-9_.\/-]/.test(right))
  )
    return { reason: "Date clue is not token-bounded." };
  const rest = p.replace(x.text, " ");
  const year = "(?:Y{2}|Y{4})";
  const month = "M{1,2}";
  const day = "D{1,2}";
  const join = "[_\\s./-]?";
  const compactDate = new RegExp(
    "(^|[^A-Za-z0-9])(?:" +
      year +
      join +
      month +
      "(?:" +
      join +
      day +
      ")?|" +
      day +
      join +
      month +
      join +
      year +
      "|" +
      month +
      join +
      day +
      join +
      year +
      "|" +
      month +
      join +
      year +
      ")(?:$|[^A-Za-z0-9])",
    "i",
  );
  if (
    compactDate.test(rest) ||
    /(?:YYYY|yyyy|YY|yy|MM|mm|DD|dd|\d{1,4})\s*[./-]\s*(?:YYYY|yyyy|YY|yy|MM|mm|DD|dd|\d{1,4})/.test(
      rest,
    )
  )
    return { reason: "Mixed or unsupported date notation." };
  return { format: x.text as DateTargetFormat, reason: "" };
}
function compilePattern(p: string): RegExp | undefined {
  try {
    return new RegExp("^(?:" + p + ")$", "v");
  } catch {
    return;
  }
}
function textIssue(el: Target, value?: string): string | undefined {
  const a = el.getAttribute("minlength"),
    b = el.getAttribute("maxlength");
  for (const [n, v] of [
    ["minlength", a],
    ["maxlength", b],
  ] as const)
    if (v !== null && (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v))))
      return "Malformed " + n + " constraint.";
  const min = a === null ? undefined : Number(a),
    max = b === null ? undefined : Number(b);
  if (min !== undefined && max !== undefined && min > max)
    return "Conflicting length constraints.";
  if (
    value !== undefined &&
    ((min !== undefined && value.length < min) ||
      (max !== undefined && value.length > max))
  )
    return "Value violates text length constraints.";
  const p = el.getAttribute("pattern");
  if (p !== null) {
    const re = compilePattern(p);
    if (!re) return "Malformed pattern constraint.";
    if (value !== undefined && !re.test(value))
      return "Value does not match pattern.";
  }
  return;
}
function dateNum(s: string): number | undefined {
  if (s.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return;
  const y = +s.slice(0, 4),
    m = +s.slice(5, 7),
    d = +s.slice(8);
  if (y < 1 || m < 1 || m > 12) return;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0),
    days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d < 1 || d > days[m - 1]) return;
  let n = d - 1;
  for (let z = 1; z < y; z++)
    n += z % 4 === 0 && (z % 100 !== 0 || z % 400 === 0) ? 366 : 365;
  for (let z = 1; z < m; z++) n += days[z - 1];
  return n;
}
function monthNum(s: string): number | undefined {
  if (
    s.length !== 7 ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(s) ||
    s.slice(0, 4) === "0000"
  )
    return;
  return +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1;
}
function nativeIssue(el: Target): string | undefined {
  const parse = el.type === "month" ? monthNum : dateNum;
  for (const n of ["min", "max"] as const) {
    const v = el.getAttribute(n);
    if (v !== null && v !== "" && parse(v) === undefined)
      return "Malformed native " + n + " constraint.";
  }
  const s = el.getAttribute("step");
  if (
    s !== null &&
    s !== "any" &&
    (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) ||
      !Number.isFinite(Number(s)) ||
      Number(s) <= 0)
  )
    return "Malformed native step constraint.";
}
export function resolveDateTargetFormat(
  h: FieldCandidateHandle,
): DateTargetFormatResult {
  if (h.kind !== "field" || h.elements.length !== 1)
    return unavailable("Date target must contain exactly one control.");
  const e = h.elements[0];
  if (!(e instanceof HTMLInputElement))
    return unavailable("Date target must be an input.");
  let f: DateTargetFormat | undefined;
  if (e.type === "date") f = "YYYY-MM-DD";
  else if (e.type === "month") f = "YYYY-MM";
  else if (e.type === "text") {
    const clue = textFormatResult(e.getAttribute("placeholder"));
    f = clue.format;
    if (!f) return unavailable(clue.reason);
  }
  if (!f) return unavailable("Unsupported input type.");
  const issue = e.type === "text" ? textIssue(e) : nativeIssue(e);
  if (issue) return unavailable(issue);
  if (e.type === "text") {
    const length = f === "YYYY.MM" ? 7 : 10,
      min = e.getAttribute("minlength"),
      max = e.getAttribute("maxlength");
    if (
      (min !== null && Number(min) > length) ||
      (max !== null && Number(max) < length)
    )
      return unavailable("Text length constraints conflict with date format.");
  }
  return {
    status: "resolved",
    format: f,
    approval: { format: f, element: e, snapshot: capture(e) },
  };
}
function validate(a: DateTargetApproval, v: string): Check {
  const e = a.element,
    f = a.format,
    mo = f === "YYYY-MM" || f === "YYYY.MM",
    dot = f.startsWith("YYYY."),
    len = mo ? 7 : 10,
    sep = dot ? "\\." : "-",
    pattern = mo
      ? "\\d{4}" + sep + "\\d{2}"
      : "\\d{4}" + sep + "\\d{2}" + (mo ? "" : "");
  let src = pattern;
  if (!mo) src += "" + sep + "\\d{2}";
  let re: RegExp;
  try {
    re = new RegExp("^(?:" + src + ")$", "v");
  } catch {
    return invalid("Unsupported approved format.");
  }
  if (v.length !== len || !re.test(v))
    return invalid("Value does not exactly match approved format.");
  const canon = dot ? v.replaceAll(".", "-") : v,
    n = mo ? monthNum(canon) : dateNum(canon);
  if (n === undefined) return invalid("Invalid calendar date.");
  if (e.type === "text") {
    const issue = textIssue(e, v);
    if (issue) return invalid(issue);
  } else {
    const issue = nativeIssue(e);
    if (issue) return invalid(issue);
    const parse = e.type === "month" ? monthNum : dateNum,
      minRaw = e.getAttribute("min"),
      maxRaw = e.getAttribute("max"),
      min = minRaw ? parse(minRaw) : undefined,
      max = maxRaw ? parse(maxRaw) : undefined;
    if (min !== undefined && n < min)
      return invalid("Value is below native minimum.");
    if (max !== undefined && n > max)
      return invalid("Value is above native maximum.");
    const stepRaw = e.getAttribute("step");
    if (stepRaw !== "any") {
      const step = stepRaw === null ? 1 : Number(stepRaw);
      const valueRaw = e.getAttribute("value"),
        valueBase = valueRaw ? parse(valueRaw) : undefined;
      const epoch = e.type === "month" ? 1970 * 12 : dateNum("1970-01-01")!;
      const base =
        min !== undefined ? min : valueBase !== undefined ? valueBase : epoch;
      const quotient = (n - base) / step;
      if (Math.abs(quotient - Math.round(quotient)) > 1e-9)
        return invalid("Value violates native step constraint.");
    }
  }
  const clone = e.cloneNode(false) as HTMLInputElement;
  clone.value = v;
  if (clone.value !== v) return invalid("Browser sanitizes proposed value.");
  if (
    !clone.validity.valid &&
    !(clone.validity.stepMismatch && (e.type === "date" || e.type === "month"))
  )
    return invalid("Value violates native constraints.");
  return { status: "valid" };
}
export function validateDateTargetValue(
  a: DateTargetApproval,
  v: string,
): Check {
  return validate(a, v);
}
export function revalidateDateTarget(
  h: FieldCandidateHandle,
  a: DateTargetApproval,
  v: string,
): Check {
  if (
    h.kind !== "field" ||
    h.elements.length !== 1 ||
    h.elements[0] !== a.element
  )
    return invalid("Approved target element was replaced.");
  if (!a.element.isConnected) return invalid("Approved target is detached.");
  if (!sameSnapshot(a.element, a.snapshot))
    return invalid("Target type, placeholder, or constraints changed.");
  return validate(a, v);
}
