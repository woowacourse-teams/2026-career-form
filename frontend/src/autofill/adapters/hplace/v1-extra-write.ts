import {
  debugRuntimeSkip,
  type StructuralSkipReason,
} from "../../debug/structural-diagnostics";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { WriteFailureCode } from "../../write/failure";
import {
  setValue,
  waitFor,
  writeV1Dropdown,
  type V1WriteResult,
} from "./v1-basic-write";
import {
  extraSpec,
  ownedV1ExtraControl,
  parseV1ExtraName,
  v1ExtraChipShows,
  v1ExtraControlValue,
  v1ExtraSectionId,
  v1ExtraSubRow,
  type ExtraControl,
} from "./v1-extra-controls";
import {
  V1_HISTORY_DATE_REASON,
  approvalIssue,
  fullDay,
  notApproved,
  today,
  writableStatus,
} from "./v1-history-write";
import { runV1Search } from "./v1-search";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const approved = (
  spec: Parameters<typeof approvalIssue>[0],
  item: Pick<ReviewPlanItem, "analysis">,
) => approvalIssue(spec, item) === undefined;

/** The digit groups of a date value, in any separator style. */
const dateParts = (value: string) => {
  const parts = value.trim().split(/\D+/).filter(Boolean);
  const [only] = parts;
  if (parts.length === 1 && /^\d{8}$/.test(only))
    return [only.slice(0, 4), only.slice(4, 6), only.slice(6)];
  if (parts.length === 1 && /^\d{6}$/.test(only))
    return [only.slice(0, 4), only.slice(4)];
  return parts;
};
/** YYYYMMDD of a full-day value, or undefined. */
const dayKey = (value: string) => {
  const p = dateParts(value);
  return p.length === 3 &&
    p[0].length === 4 &&
    p[1].length <= 2 &&
    p[2].length <= 2
    ? `${p[0]}${p[1].padStart(2, "0")}${p[2].padStart(2, "0")}`
    : undefined;
};
/** YYYYMM of a year-and-month value, or undefined. */
const monthKey = (value: string) => {
  const p = dateParts(value);
  return p.length === 2 && p[0].length === 4 && p[1].length <= 2
    ? `${p[0]}${p[1].padStart(2, "0")}`
    : undefined;
};

/** How long a written YYYY.MM must stay before it counts as kept. */
const MONTH_SETTLE_MS = 300;

/** A month-only profile date as YYYY.MM. */
function fullMonth(value: string): string | undefined {
  const m = /^(\d{4})[-.](\d{2})$/.exec(value.trim());
  const month = m ? Number(m[2]) : 0;
  return m && Number(m[1]) >= 1900 && month >= 1 && month <= 12
    ? `${m[1]}.${m[2]}`
    : undefined;
}

/**
 * The page shows `target`: exactly, or for 취득일 the same date in the page's
 * own form. A page that keeps only the year and month (a second tenant,
 * baa3384) shows the same year and month; another year or month never
 * counts.
 */
function showsTarget(
  control: ExtraControl,
  shown: string,
  target: string,
): boolean {
  if (shown === target) return true;
  if (control.spec.kind !== "date") return false;
  const shownDay = dayKey(shown);
  const targetDay = dayKey(target);
  if (shownDay !== undefined) return shownDay === targetDay;
  const shownMonth = monthKey(shown);
  return (
    shownMonth !== undefined &&
    shownMonth === (targetDay?.slice(0, 6) ?? monthKey(target))
  );
}

/** Value-free form of a page value: digits as 9, letters as x. */
const valueMask = (value: string) =>
  value
    .slice(0, 20)
    .replace(/\d/g, "9")
    .replace(/[^9.\-/ ]/g, "x") || "empty";

/** One value-free diagnostic line for a step-3 write that is not written. */
export function skipV1Extra(
  key: string,
  reason: StructuralSkipReason,
  code: string,
  failureCode?: WriteFailureCode,
): void {
  debugRuntimeSkip(key, reason, `v1-extra-${code}`, "write", failureCode);
}

/** The value to write in page terms, or undefined when it cannot be written. */
export function v1ExtraTarget(
  control: ExtraControl,
  value: string,
): string | undefined {
  if (!value.trim()) return undefined;
  const { spec } = control;
  if (spec.kind === "date") {
    // 취득일: a full past day; a month-only profile date as YYYY.MM, which a
    // page keeping months (second tenant) holds and a full-day page drops
    // (the read-back then reports it). Never in the future.
    const day = fullDay(value);
    if (day) return day <= today() ? day : undefined;
    const month = fullMonth(value);
    return month && month <= today().slice(0, 7) ? month : undefined;
  }
  if (spec.kind === "search") return normalize(value);
  if (spec.kind === "text") return value;
  return spec.options.includes(value) ? value : undefined;
}

/** A step-3 handle, by name (its search input may be gone after a pick). */
export function isV1ExtraHandle(handle: FieldCandidateHandle): boolean {
  return (
    handle.sectionId === v1ExtraSectionId &&
    handle.candidate.domId === handle.candidate.domName &&
    parseV1ExtraName(handle.candidate.domName) !== undefined
  );
}

export function isV1ExtraStateDriver(
  item: ReviewPlanItem,
  name: string | undefined,
): boolean {
  const parsed = parseV1ExtraName(name);
  const spec = parsed && extraSpec(parsed.group, parsed.field);
  return spec?.kind === "search" && approved(spec, item);
}

/** The certificate search: a failed one ends only itself. */
export function isV1ExtraSearchHandle(handle: FieldCandidateHandle): boolean {
  return (
    isV1ExtraHandle(handle) &&
    parseV1ExtraName(handle.candidate.domName)?.field === "licenseName"
  );
}

/** A failed search whose input the page already removed: its sub-row, located again. */
export function v1ExtraSearchFailureTargets(
  handle: FieldCandidateHandle,
): Element[] | undefined {
  if (
    !isV1ExtraSearchHandle(handle) ||
    handle.elements.every((element) => element.isConnected)
  )
    return undefined;
  const parsed = parseV1ExtraName(handle.candidate.domName)!;
  const document = handle.elements[0]?.ownerDocument;
  const sub = document && v1ExtraSubRow(document, parsed.group, parsed.index);
  return sub ? [sub] : undefined;
}

/** The certificate sub-row shows exactly `name` (strict chip or fallback). */
const pickedShows = (handle: FieldCandidateHandle, name: string) => {
  const parsed = parseV1ExtraName(handle.candidate.domName);
  const document = handle.elements[0]?.ownerDocument;
  return (
    parsed?.field === "licenseName" &&
    !!document &&
    v1ExtraChipShows(document, parsed.index, name)
  );
};

/** After the certificate search: the sub-row shows exactly the profile name. */
export async function settleV1ExtraStateDriver(
  handle: FieldCandidateHandle,
  item?: ReviewPlanItem,
): Promise<boolean> {
  const parsed = parseV1ExtraName(handle.candidate.domName);
  const spec = parsed && extraSpec(parsed.group, parsed.field);
  return (
    spec?.kind === "search" &&
    !!item &&
    item.candidateId === handle.candidateId &&
    item.selected &&
    !item.disabled &&
    approved(spec, item) &&
    pickedShows(handle, normalize(item.profileValue ?? ""))
  );
}

/** Why a written step-3 value is not confirmed (value-free), or undefined. */
export function v1ExtraRetainedIssue(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): string | undefined {
  const control = ownedV1ExtraControl(handle);
  if (!control) return "not-owned";
  if (!approved(control.spec, item)) return "not-approved";
  const target = v1ExtraTarget(control, item.profileValue ?? "");
  if (target === undefined) return "no-target";
  const shown = v1ExtraControlValue(control);
  return showsTarget(control, shown, target)
    ? undefined
    : `value-${valueMask(shown)}`;
}

export function v1ExtraRetained(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  return v1ExtraRetainedIssue(handle, item) === undefined;
}

/** Result comparison for 취득일 against the profile's stored form. */
export function v1ExtraResultMatches(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  current: string,
  expected: string,
): boolean | undefined {
  const control = ownedV1ExtraControl(handle);
  if (
    !control ||
    control.spec.kind !== "date" ||
    handle.candidateId !== item.candidateId ||
    !approved(control.spec, item)
  )
    return undefined;
  const target = v1ExtraTarget(control, expected);
  return target !== undefined && showsTarget(control, current, target);
}

/** Why a step-3 write was refused, for the result screen. */
export function v1ExtraFailureReason(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  fallback: string,
): string {
  const control = ownedV1ExtraControl(handle);
  return control?.spec.kind === "date" &&
    v1ExtraTarget(control, item.profileValue ?? "") === undefined
    ? V1_HISTORY_DATE_REASON
    : fallback;
}

/** Text, 취득일 and the language dropdown of one sub-row; never overwrites. */
export async function writeV1Extra(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  currentRun: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): Promise<V1WriteResult> {
  const control = ownedV1ExtraControl(handle);
  const key = handle.candidate.domName ?? handle.candidateId;
  const fail = (reason: StructuralSkipReason, code: string) => {
    skipV1Extra(key, reason, code);
    return "failed" as const;
  };
  if (!control) return fail("owner-mismatch", "not-owned");
  const { spec } = control;
  // The certificate search runs only as its stage-1 driver.
  if (spec.kind === "search") return fail("blocked", "search-not-driver");
  const value = item.profileValue;
  const original = v1ExtraControlValue(control);
  if (!approved(spec, item)) return fail("blocked", notApproved(spec, item));
  const target = v1ExtraTarget(control, value ?? "");
  if (!target) {
    if (!value?.trim()) return fail("blocked", "value-missing");
    if (spec.kind === "dropdown") {
      skipV1Extra(key, "option-mismatch", "option-unmatched");
      return "option-unmatched";
    }
    return fail(
      "unit-mismatch",
      fullDay(value) || fullMonth(value) ? "date-future" : "date-unreadable",
    );
  }
  const document = control.row.ownerDocument;
  const url = document.URL;
  let allowed = [original];
  const owned = () => {
    const now = ownedV1ExtraControl(handle);
    return (
      currentRun() &&
      document.URL === url &&
      item.profileValue === value &&
      item.selected &&
      !item.disabled &&
      writableStatus(item) &&
      item.candidateId === handle.candidateId &&
      item.analysis?.candidateId === handle.candidateId &&
      approved(spec, item) &&
      !!now &&
      allowed.some((value) => showsTarget(now, v1ExtraControlValue(now), value))
    );
  };
  if (!owned()) return fail("blocked", "not-current");
  if (showsTarget(control, original, target)) return "written";
  // A control that already holds a value is never overwritten.
  if (original !== "") return fail("existing-value", "existing-value");
  const input = control.elements[0];
  if (input && input.maxLength >= 0 && target.length > input.maxLength)
    return fail("blocked", "max-length");
  try {
    if (beforeMutation && !(await beforeMutation()))
      return fail("blocked", "profile-changed");
  } catch {
    return fail("blocked", "profile-changed");
  }
  if (!owned()) return fail("blocked", "not-current");
  const shows = () => {
    const now = ownedV1ExtraControl(handle);
    return !!now && showsTarget(now, v1ExtraControlValue(now), target);
  };
  if (spec.kind === "text" || spec.kind === "date") {
    input.focus();
    if (!owned()) return fail("blocked", "not-current");
    setValue(input, target);
    allowed = [original, target];
    for (const type of ["input", "change"]) {
      input.dispatchEvent(new Event(type, { bubbles: true }));
      if (!owned()) return fail("blocked", "not-current");
    }
    input.blur();
    // The page keeps or drops the value after blur; read it back.
    if (!(await waitFor(shows, owned)))
      return fail("control-shape", "value-not-kept");
    // A month-only 취득일 (YYYY.MM): a page that keeps full days drops it
    // after blur, asynchronously (measured on step 2). Wait (bounded) for
    // that reaction before confirming; a page keeping months holds it.
    if (
      spec.kind === "date" &&
      monthKey(target) !== undefined &&
      (await waitFor(() => !shows(), owned, MONTH_SETTLE_MS))
    )
      return fail("control-shape", "value-not-kept");
    if (!input.checkValidity()) return fail("control-shape", "value-invalid");
    return "written";
  }
  const result = await writeV1Dropdown(
    control.custom[0],
    target,
    undefined,
    control.name,
    original,
    owned,
    shows,
    (next) => {
      allowed = next;
    },
  );
  if (result === "option-unmatched")
    skipV1Extra(key, "option-mismatch", "option-unmatched");
  else if (result === "failed")
    skipV1Extra(key, "result-click-no-effect", "dropdown-failed");
  return result;
}

/**
 * The certificate search (stage-1 driver), with the step-2 rule: exactly one
 * row equal to the name, or a lone register row for exactly that name.
 * The pick re-renders the sub-row, so the chip is read from the sub-row
 * located again inside the block.
 */
export async function writeV1ExtraSearch(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  currentRun: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): Promise<{ written: boolean; code?: WriteFailureCode }> {
  const control = ownedV1ExtraControl(handle);
  const value = item.profileValue;
  const name = normalize(value ?? "");
  const key = handle.candidate.domName ?? handle.candidateId;
  if (!control || control.spec.kind !== "search") {
    skipV1Extra(key, "owner-mismatch", "not-owned");
    return { written: false };
  }
  const { spec } = control;
  if (!approved(spec, item)) {
    skipV1Extra(key, "blocked", notApproved(spec, item));
    return { written: false };
  }
  if (!name) {
    skipV1Extra(key, "blocked", "value-missing");
    return { written: false };
  }
  const input = control.elements[0];
  // Text the applicant typed is an existing value: never replaced.
  if (input.value !== "") {
    skipV1Extra(key, "existing-value", "existing-value");
    return { written: false };
  }
  const document = control.row.ownerDocument;
  const url = document.URL;
  const live = () =>
    currentRun() &&
    document.URL === url &&
    item.profileValue === value &&
    item.selected &&
    !item.disabled &&
    writableStatus(item) &&
    approved(spec, item);
  try {
    if (beforeMutation && !(await beforeMutation())) return { written: false };
  } catch {
    return { written: false };
  }
  if (!live() || !ownedV1ExtraControl(handle)) return { written: false };
  return runV1Search(
    {
      key: control.name,
      input,
      // The block holds the input until the pick re-renders its sub-row.
      row: control.block,
      titleRow: control.block,
      live,
      picked: () => pickedShows(handle, name),
      skip: skipV1Extra,
    },
    name,
  );
}
