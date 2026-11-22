import {
  debugRuntimeSkip,
  type StructuralSkipReason,
} from "../../debug/structural-diagnostics";
import type { MatchedFieldAnalysis } from "../../api/types";
import type { CandidateRegistry } from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { WriteFailureCode } from "../../write/failure";
import { isSelectedToggle } from "./v1-basic-controls";
import {
  setValue,
  waitFor,
  writeV1Dropdown,
  type V1WriteResult,
} from "./v1-basic-write";
import {
  historySpec,
  ownedV1HistoryControl,
  parseV1HistoryName,
  scaleLabels,
  v1HistoryChipShows,
  v1HistorySearchRow,
  v1HistoryControl,
  v1HistoryControlValue,
  v1HistorySectionId,
  type HistoryControl,
  type HistorySpec,
} from "./v1-history-controls";
import { closeThroughTitle, runV1Search } from "./v1-search";

export { isRegisterRow, isRegisterShape } from "./v1-search";

export const V1_HISTORY_DATE_REASON =
  "연·월·일이 모두 있는 지난 날짜만 입력할 수 있습니다.";
export const V1_HISTORY_GPA_REASON =
  "평점과 만점기준을 함께 입력할 수 있을 때만 입력합니다.";
export const V1_HISTORY_GPA_ROLLBACK_REASON =
  "만점기준을 선택하지 못했고 입력한 평점을 지우지 못했습니다. 평점과 만점기준을 직접 확인해 주세요.";
export const V1_HISTORY_LEAVING_REASON =
  "프로필의 재직 여부가 퇴직일 때만 퇴사일을 입력합니다.";

/** What the approval reads of a spec (the step-2 and step-3 specs alike). */
export type ApprovalSpec =
  | { kind: "toggle" | "dropdown"; profile: string; options: readonly string[] }
  | { kind: "text" | "date" | "search"; profile: string };

const command = (spec: ApprovalSpec) =>
  spec.kind === "toggle"
    ? "CHECK_RADIO"
    : spec.kind === "dropdown"
      ? "SELECT_OPTION"
      : "SET_TEXT";

/**
 * The first condition the backend's analysis fails for this card field, or
 * undefined when it is the exact binding. The backend sends ALLOWED or
 * CONDITIONAL per profile key (SupportedProfileFields: e.g. schoolName,
 * completionStatus, companyName are CONDITIONAL); both are approved.
 */
export function approvalIssue(
  spec: ApprovalSpec,
  item: Pick<ReviewPlanItem, "analysis">,
): string | undefined {
  const a = item.analysis,
    b = a?.valueBinding;
  if (a?.mappingStatus !== "ADAPTER_VERIFIED")
    return `mapping-${a?.mappingStatus ?? "none"}`;
  if (a.interactionStatus !== "READY")
    return `interaction-${a.interactionStatus}`;
  if (a.autofillPolicy !== "ALLOWED" && a.autofillPolicy !== "CONDITIONAL")
    return "policy";
  if (a.writePlan?.command !== command(spec))
    return `command-${a.writePlan?.command ?? "none"}`;
  if (b?.profileFieldKey !== spec.profile) return "profile-key";
  if (spec.kind === "text" || spec.kind === "date" || spec.kind === "search")
    return b.type === "DIRECT" ? undefined : "binding";
  if (b.type !== "LOOKUP") return "binding";
  const options = "options" in spec ? spec.options : [];
  const targets = Object.values(b.optionMap);
  return targets.length > 0 && targets.every((t) => options.includes(t))
    ? undefined
    : "lookup-target";
}

function approved(
  spec: HistorySpec,
  item: Pick<ReviewPlanItem, "analysis">,
): boolean {
  return approvalIssue(spec, item) === undefined;
}

/** Value-free: the failing condition plus the analysis and review state. */
export function notApproved(spec: ApprovalSpec, item: ReviewPlanItem): string {
  const a = item.analysis;
  return [
    "not-approved",
    approvalIssue(spec, item) ?? "none",
    `policy-${a?.autofillPolicy ?? "none"}`,
    `binding-${a?.valueBinding?.type ?? "none"}`,
    `status-${item.status}`,
    `value-${item.profileValue?.trim() ? "yes" : "no"}`,
  ].join("-");
}

/** Review status of an item the run may write: a CONDITIONAL field is
 * `needs-review` (the automatic run selects it), as in step 1. */
export const writableStatus = (item: ReviewPlanItem) =>
  item.status === "available" ||
  (item.status === "needs-review" &&
    item.analysis?.autofillPolicy === "CONDITIONAL");

const pad = (n: number) => String(n).padStart(2, "0");
export const today = () => {
  const now = new Date();
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
};
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const text = (e: Element | null | undefined) => normalize(e?.textContent ?? "");

/** A profile date as the page's full YYYY.MM.DD (the page keeps nothing else). */
export function fullDay(value: string): string | undefined {
  const m = /^(\d{4})[-.](\d{2})[-.](\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const [y, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, month - 1, day));
  return y >= 1900 &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${m[1]}.${m[2]}.${m[3]}`
    : undefined;
}

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

/** How long a written YYYY.MM must stay before it counts as kept: a page
 * keeping full days drops it after blur, asynchronously (measured, step 2). */
export const MONTH_SETTLE_MS = 300;

/** A month-only profile date as YYYY.MM (a page keeping months holds it). */
export function fullMonth(value: string): string | undefined {
  const m = /^(\d{4})[-.](\d{2})$/.exec(value.trim());
  const month = m ? Number(m[2]) : 0;
  return m && Number(m[1]) >= 1900 && month >= 1 && month <= 12
    ? `${m[1]}.${m[2]}`
    : undefined;
}

/** A year-and-month value (YYYY.MM). */
export const isMonthValue = (value: string) => monthKey(value) !== undefined;

/**
 * The page shows the date `target`: the same full day in any separator
 * style, or, on a page that keeps only the year and month (the second
 * tenant's 재학기간 and 취득일), the same year and month. Another year or
 * month never counts.
 */
export function showsDate(shown: string, target: string): boolean {
  if (shown === target) return true;
  const shownDay = dayKey(shown);
  const targetDay = dayKey(target);
  if (shownDay !== undefined) return shownDay === targetDay;
  const shownMonth = monthKey(shown);
  return (
    shownMonth !== undefined &&
    shownMonth === (targetDay?.slice(0, 6) ?? monthKey(target))
  );
}

/** A control shows `target`: exactly, or for a date by `showsDate`. */
const shownAs = (spec: HistorySpec, shown: string, target: string) =>
  shown === target || (spec.kind === "date" && showsDate(shown, target));

/** The card's own 졸업구분 label as the page shows it now. */
const cardStatus = (control: HistoryControl) => {
  const status = v1HistoryControl(
    control.row.ownerDocument,
    control.group,
    control.index,
    "graduationTypeCode",
  );
  return status && v1HistoryControlValue(status);
};

const numeric = (value: string) =>
  /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;

/** One value-free diagnostic line for a step-2 write that is not written. */
export function skipV1History(
  key: string,
  reason: StructuralSkipReason,
  code: string,
  failureCode?: WriteFailureCode,
): void {
  debugRuntimeSkip(key, reason, `v1-history-${code}`, "write", failureCode);
}

/** A toggle showing its measured fresh-card default (replaceable). */
const showsDefault = (control: HistoryControl) =>
  control.spec.kind === "toggle" &&
  control.spec.default !== undefined &&
  v1HistoryControlValue(control) === control.spec.default;

/** Review: the measured page default does not count as an existing value. */
export function prefersV1HistoryProfileValue(
  handle: FieldCandidateHandle,
  analysis: MatchedFieldAnalysis,
): boolean {
  const control = ownedV1HistoryControl(handle);
  return (
    !!control && approved(control.spec, { analysis }) && showsDefault(control)
  );
}

/** Why `v1HistoryTarget` refused a value (diagnostics only). */
function targetIssue(control: HistoryControl, value: string): string {
  const { spec } = control;
  if (!value.trim()) return "value-missing";
  if (spec.kind === "date")
    return fullDay(value) || fullMonth(value)
      ? "date-future"
      : "date-unreadable";
  if (spec.kind === "text" && spec.numeric) return "score-not-number";
  return "option-unmatched";
}

/** The value to write in page terms, or undefined when it cannot be written. */
export function v1HistoryTarget(
  control: HistoryControl,
  value: string,
): string | undefined {
  if (!value.trim()) return undefined;
  const { spec } = control;
  if (spec.kind === "date") {
    // A full day, or a month-only profile date as YYYY.MM: the second
    // tenant's 재학기간 keeps months; a full-day page drops it, which the
    // writer reports.
    const day = fullDay(value) ?? fullMonth(value);
    if (!day) return undefined;
    if (day <= today().slice(0, day.length)) return day;
    // A future 졸업일 only for 졸업예정, at most six years ahead.
    return spec.future &&
      cardStatus(control) === "졸업예정" &&
      Number(day.slice(0, 4)) <= new Date().getFullYear() + 6
      ? day
      : undefined;
  }
  if (spec.kind === "search") return normalize(value);
  if (spec.kind === "text")
    // The pair rule (score within its scale) is checked for the batch.
    return !spec.numeric
      ? value
      : numeric(value) >= 0
        ? value.trim()
        : undefined;
  return spec.options.includes(value) ? value : undefined;
}

/**
 * The profile status each card's 재직중/퇴사 driver applied this session
 * (browser-local): 퇴사일 is written only under a profile 퇴사.
 */
const appliedStatus = new WeakMap<Element, string>();

export function isV1HistoryStateDriver(
  item: ReviewPlanItem,
  name: string | undefined,
): boolean {
  const parsed = parseV1HistoryName(name);
  const spec = parsed && historySpec(parsed.group, parsed.field);
  return (
    !!spec &&
    ((spec.kind === "toggle" && !!spec.unlocks) || spec.kind === "search") &&
    approved(spec, item)
  );
}

/** A step-2 school or major search handle: a failed search ends only
 * itself, so the other stage-1 drivers still run in the same pass. */
export function isV1HistorySearchHandle(handle: FieldCandidateHandle): boolean {
  const parsed = parseV1HistoryName(handle.candidate.domName);
  return (
    isV1HistoryHandle(handle) &&
    (parsed?.field === "academyName" || parsed?.field === "major0.majorName")
  );
}

/**
 * A failed search whose input the page already removed (a pick or press
 * re-rendered the row): its card row, located again, is deferred so the run
 * goes on and nothing more is written into that widget. Undefined while the
 * input is still in the page (the field itself is deferred as before).
 */
export function v1HistorySearchFailureTargets(
  handle: FieldCandidateHandle,
): Element[] | undefined {
  if (
    !isV1HistorySearchHandle(handle) ||
    handle.elements.every((element) => element.isConnected)
  )
    return undefined;
  const parsed = parseV1HistoryName(handle.candidate.domName)!;
  const document = handle.elements[0]?.ownerDocument;
  const row =
    document &&
    v1HistorySearchRow(
      document,
      parsed.group,
      parsed.index,
      parsed.field as "academyName" | "major0.majorName",
    );
  return row ? [row] : undefined;
}

/** A step-2 handle, by name (its search input may be gone after a pick). */
export function isV1HistoryHandle(handle: FieldCandidateHandle): boolean {
  return (
    handle.sectionId === v1HistorySectionId &&
    handle.candidate.domId === handle.candidate.domName &&
    parseV1HistoryName(handle.candidate.domName) !== undefined
  );
}

/** The picked search field shows exactly `name` (strict chip or fallback). */
function pickedShows(handle: FieldCandidateHandle, name: string): boolean {
  const parsed = parseV1HistoryName(handle.candidate.domName);
  const document = handle.elements[0]?.ownerDocument;
  return (
    !!parsed &&
    !!document &&
    (parsed.field === "academyName" || parsed.field === "major0.majorName") &&
    v1HistoryChipShows(document, parsed.group, parsed.index, parsed.field, name)
  );
}

export function v1HistoryRetained(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  const control = ownedV1HistoryControl(handle);
  if (!control || !approved(control.spec, item)) return false;
  const target = v1HistoryTarget(control, item.profileValue ?? "");
  const shown = v1HistoryControlValue(control);
  return (
    target !== undefined &&
    shown !== undefined &&
    shownAs(control.spec, shown, target)
  );
}

/** Result comparison for a step-2 date against the profile's stored form. */
export function v1HistoryResultMatches(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  current: string,
  expected: string,
): boolean | undefined {
  const control = ownedV1HistoryControl(handle);
  if (
    !control ||
    control.spec.kind !== "date" ||
    handle.candidateId !== item.candidateId ||
    !approved(control.spec, item)
  )
    return undefined;
  const target = v1HistoryTarget(control, expected);
  return target !== undefined && shownAs(control.spec, current, target);
}

/** Why a step-2 write was refused, for the result screen. */
export function v1HistoryFailureReason(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  fallback: string,
): string {
  const control = ownedV1HistoryControl(handle);
  if (
    control?.field === "leavingDate" &&
    appliedStatus.get(control.row) !== "퇴사"
  )
    return V1_HISTORY_LEAVING_REASON;
  const target =
    control?.spec.kind === "date"
      ? v1HistoryTarget(control, item.profileValue ?? "")
      : "";
  // No date target, or a month-only one a full-day page did not keep.
  return control?.spec.kind === "date" &&
    (target === undefined || isMonthValue(target))
    ? V1_HISTORY_DATE_REASON
    : fallback;
}

const SUGGESTION_MS = 1500;
const QUIET_MS = 500;
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

/** The page's step for 평점 is not measured: a decimal score may only
 * mismatch the native default step, which the page does not enforce. */
const numericStepOnly = (spec: HistorySpec, v: ValidityState) =>
  spec.kind === "text" &&
  !!spec.numeric &&
  v.stepMismatch &&
  !v.badInput &&
  !v.rangeOverflow &&
  !v.rangeUnderflow &&
  !v.customError &&
  !v.valueMissing;

/**
 * 회사명 keeps the typed text; its optional suggestion list comes from a site
 * request and must not stay open. Waits (≤ 1.5 s) for a list, closes any
 * list through the row title without picking, and returns once the row
 * stayed closed for a quiet period. A list that keeps reopening fails.
 */
async function closeSuggestions(
  row: Element,
  owned: () => boolean,
): Promise<boolean> {
  const open = () => row.querySelector("#dropdown-body") !== null;
  let quietUntil = Date.now() + SUGGESTION_MS;
  let closes = 0;
  while (true) {
    if (!owned()) return false;
    if (open()) {
      if (closes++ >= 3) return false;
      if (!(await closeThroughTitle(row, open, owned))) return false;
      quietUntil = Date.now() + QUIET_MS;
      continue;
    }
    if (Date.now() >= quietUntil) return true;
    await tick();
  }
}

export async function writeV1History(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  currentRun: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): Promise<V1WriteResult> {
  const control = ownedV1HistoryControl(handle);
  const key = handle.candidate.domName ?? handle.candidateId;
  const fail = (reason: StructuralSkipReason, code: string) => {
    skipV1History(key, reason, code);
    return "failed" as const;
  };
  if (!control) return fail("owner-mismatch", "not-owned");
  const { spec } = control;
  // A search runs only as its stage-1 driver (writeV1HistorySearch).
  if (spec.kind === "search") return fail("blocked", "search-not-driver");
  const document = control.row.ownerDocument;
  const value = item.profileValue;
  const original = v1HistoryControlValue(control);
  if (original === undefined) return fail("control-shape", "value-unreadable");
  if (!approved(spec, item)) return fail("blocked", notApproved(spec, item));
  const target = v1HistoryTarget(control, value ?? "");
  if (control.field === "workingStatus" && target)
    appliedStatus.set(control.row, target);
  if (!target) {
    const issue = targetIssue(control, value ?? "");
    if (issue === "option-unmatched") {
      skipV1History(key, "option-mismatch", issue);
      return "option-unmatched";
    }
    return fail(issue === "value-missing" ? "blocked" : "unit-mismatch", issue);
  }
  // The measured fresh-card default is the page's, not the applicant's.
  const replacesDefault = original !== target && showsDefault(control);
  const url = document.URL;
  let allowed = [original];
  const owned = () => {
    const now = ownedV1HistoryControl(handle);
    const shown = now && v1HistoryControlValue(now);
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
      shown !== undefined &&
      allowed.some((value) => shownAs(spec, shown, value))
    );
  };
  if (!owned()) return fail("blocked", "not-current");
  if (shownAs(spec, original, target)) return "written";
  // A control that already holds a value is never overwritten.
  if (original !== "" && !replacesDefault)
    return fail("existing-value", "existing-value");
  // 퇴사일: only after this run applied a profile 퇴사 to the card (an
  // applicant's own 퇴사 under a profile 재직중 does not unlock it for us).
  if (
    control.field === "leavingDate" &&
    appliedStatus.get(control.row) !== "퇴사"
  )
    return fail("dependency-inactive", "leaving-without-profile-retire");
  const input = control.elements[0];
  if (
    (spec.kind === "text" || spec.kind === "date") &&
    input.maxLength >= 0 &&
    target.length > input.maxLength
  )
    return fail("blocked", "max-length");
  try {
    if (beforeMutation && !(await beforeMutation()))
      return fail("blocked", "profile-changed");
  } catch {
    return fail("blocked", "profile-changed");
  }
  if (!owned()) return fail("blocked", "not-current");
  const shows = () => {
    const now = ownedV1HistoryControl(handle);
    const shown = now && v1HistoryControlValue(now);
    return shown !== undefined && shownAs(spec, shown, target);
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
    if (!(await waitFor(shows, owned)))
      return fail("control-shape", "value-not-kept");
    // A month-only date (YYYY.MM): wait (bounded) for a full-day page to drop it.
    if (
      spec.kind === "date" &&
      isMonthValue(target) &&
      (await waitFor(() => !shows(), owned, MONTH_SETTLE_MS))
    )
      return fail("control-shape", "value-not-kept");
    if (!(input.checkValidity() || numericStepOnly(spec, input.validity)))
      return fail("control-shape", "value-invalid");
    if (spec.kind === "text" && spec.suggestions) {
      if (!(await closeSuggestions(control.row, owned)))
        return fail("cleanup-failed", "suggestions-open");
      return shows() ? "written" : fail("control-shape", "value-not-kept");
    }
    // Only a full YYYY.MM.DD is typed, which the page keeps; the batch's
    // retained-value check reads it back after every write.
    return "written";
  }
  if (spec.kind === "toggle") {
    const button = control.options.get(target);
    if (
      !(button instanceof HTMLButtonElement) ||
      button.textContent?.trim() !== target
    )
      return fail("label-mismatch", "toggle-missing");
    allowed = [original, target];
    button.click();
    return (await waitFor(
      () =>
        isSelectedToggle(button) &&
        control.custom.filter(isSelectedToggle).length === 1 &&
        shows(),
      owned,
    ))
      ? "written"
      : fail("result-click-no-effect", "toggle-not-selected");
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
    skipV1History(key, "option-mismatch", "option-unmatched");
  else if (result === "failed")
    skipV1History(key, "result-click-no-effect", "dropdown-failed");
  return result;
}

/**
 * One search of a school or major name (stage-1 driver): the shared engine
 * (v1-search.ts) on this card's own input. The pick is verified by the input
 * leaving the row and the chip showing exactly the name.
 */
export async function writeV1HistorySearch(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  currentRun: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): Promise<{ written: boolean; code?: WriteFailureCode }> {
  const control = ownedV1HistoryControl(handle);
  const value = item.profileValue;
  const name = normalize(value ?? "");
  const key = handle.candidate.domName ?? handle.candidateId;
  if (!control || control.spec.kind !== "search") {
    skipV1History(key, "owner-mismatch", "not-owned");
    return { written: false };
  }
  if (!approved(control.spec, item)) {
    skipV1History(key, "blocked", notApproved(control.spec, item));
    return { written: false };
  }
  if (!name) {
    skipV1History(key, "blocked", "value-missing");
    return { written: false };
  }
  const input = control.elements[0];
  // Text the applicant typed is an existing value: never replaced.
  if (input.value !== "") {
    skipV1History(key, "existing-value", "existing-value");
    return { written: false };
  }
  const { row } = control;
  const document = row.ownerDocument;
  const url = document.URL;
  const live = () =>
    currentRun() &&
    document.URL === url &&
    item.profileValue === value &&
    item.selected &&
    !item.disabled &&
    writableStatus(item) &&
    approved(control.spec, item);
  try {
    if (beforeMutation && !(await beforeMutation())) return { written: false };
  } catch {
    return { written: false };
  }
  if (!live() || !ownedV1HistoryControl(handle)) return { written: false };
  return runV1Search(
    {
      key: control.name,
      input,
      row,
      titleRow: row,
      live,
      picked: () => pickedShows(handle, name),
      skip: skipV1History,
    },
    name,
  );
}

/** After a driver: 퇴사 has unlocked 퇴사일, or a search left its exact chip. */
export async function settleV1HistoryStateDriver(
  handle: FieldCandidateHandle,
  signal?: AbortSignal,
  item?: ReviewPlanItem,
): Promise<boolean> {
  const parsed = parseV1HistoryName(handle.candidate.domName);
  const spec = parsed && historySpec(parsed.group, parsed.field);
  if (
    !parsed ||
    !spec ||
    !item ||
    item.candidateId !== handle.candidateId ||
    !item.selected ||
    item.disabled ||
    !approved(spec, item)
  )
    return false;
  if (spec.kind === "search")
    return pickedShows(handle, normalize(item.profileValue ?? ""));
  const control = ownedV1HistoryControl(handle);
  if (!control || spec.kind !== "toggle" || !v1HistoryRetained(handle, item))
    return false;
  if (v1HistoryControlValue(control) !== spec.unlocks) return true;
  const document = control.row.ownerDocument;
  const url = document.URL;
  const settled = await waitFor(
    () => {
      const end = v1HistoryControl(
        document,
        control.group,
        control.index,
        "leavingDate",
      );
      return !!end && !end.disabled;
    },
    () =>
      !signal?.aborted &&
      document.URL === url &&
      item.selected &&
      !item.disabled &&
      v1HistoryRetained(handle, item),
  );
  if (!settled)
    debugRuntimeSkip(control.name, "disabled-timeout", "v1-linked-controls");
  return settled;
}

/** A failed 재직중/퇴사 driver defers its own row; a failed search only itself. */
export function v1HistoryDriverRow(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): Element | undefined {
  const control = ownedV1HistoryControl(handle);
  return control?.spec.kind === "toggle" &&
    isV1HistoryStateDriver(item, handle.candidate.domName)
    ? control.row
    : undefined;
}

/**
 * GPA pair rule: a card's score and scale are written only together. Both
 * must be approved in this batch, the scale must be a page label and the
 * score a number within it; otherwise neither is written.
 */
export function v1HistoryGpaBlocked(
  items: readonly ReviewPlanItem[],
  registry: CandidateRegistry,
  approvedCandidateIds: ReadonlySet<string>,
): Set<string> {
  const pairs = new Map<
    string,
    { score?: ReviewPlanItem; scale?: ReviewPlanItem }
  >();
  for (const item of items) {
    const lookup = registry.lookupField(item.candidateId);
    const parsed =
      "handle" in lookup
        ? parseV1HistoryName(lookup.handle.candidate.domName)
        : undefined;
    if (
      !parsed ||
      (parsed.field !== "score" && parsed.field !== "perfectScore")
    )
      continue;
    const key = `${parsed.group}.${parsed.index}`;
    pairs.set(key, {
      ...pairs.get(key),
      [parsed.field === "score" ? "score" : "scale"]: item,
    });
  }
  const blocked = new Set<string>();
  for (const { score, scale } of pairs.values()) {
    const scaleValue = scale?.profileValue ?? "";
    const scoreValue = numeric(score?.profileValue ?? "");
    const valid =
      !!score &&
      !!scale &&
      approvedCandidateIds.has(score.candidateId) &&
      approvedCandidateIds.has(scale.candidateId) &&
      scaleLabels.includes(scaleValue) &&
      scoreValue >= 0 &&
      scoreValue <= Number(scaleValue);
    if (!valid)
      for (const item of [score, scale])
        if (item) blocked.add(item.candidateId);
  }
  return blocked;
}

/** Clears a score this run typed (its scale could not be chosen). */
async function clearScore(handle: FieldCandidateHandle): Promise<boolean> {
  const control = ownedV1HistoryControl(handle);
  const input = control?.elements[0];
  if (!control || !input) return false;
  input.focus();
  setValue(input, "");
  for (const type of ["input", "change"])
    input.dispatchEvent(new Event(type, { bubbles: true }));
  input.blur();
  return waitFor(
    () => ownedV1HistoryControl(handle)?.elements[0].value === "",
    () => input.isConnected,
  );
}

/**
 * One batch's GPA pairs. The score is written first; its scale only after
 * the score was written (or was already shown). When the scale then fails,
 * a score this batch typed is cleared again so neither half stays alone.
 */
export function v1HistoryGpaRun(
  items: readonly ReviewPlanItem[],
  registry: CandidateRegistry,
  approvedCandidateIds: ReadonlySet<string>,
) {
  const blocked = v1HistoryGpaBlocked(items, registry, approvedCandidateIds);
  const scores = new Map<
    string,
    { handle: FieldCandidateHandle; candidateId: string; typed: boolean }
  >();
  const pairOf = (handle: FieldCandidateHandle) => {
    const parsed = parseV1HistoryName(handle.candidate.domName);
    return parsed &&
      (parsed.field === "score" || parsed.field === "perfectScore")
      ? { key: `${parsed.group}.${parsed.index}`, field: parsed.field }
      : undefined;
  };
  return {
    /** Not written in this batch, with the pair reason. */
    held(item: ReviewPlanItem, handle: FieldCandidateHandle): boolean {
      const pair = pairOf(handle);
      const held =
        blocked.has(item.candidateId) ||
        (pair?.field === "perfectScore" && !scores.has(pair.key));
      if (held)
        skipV1History(
          handle.candidate.domName ?? item.candidateId,
          "dependency-inactive",
          blocked.has(item.candidateId)
            ? "gpa-pair-incomplete"
            : "gpa-score-not-written",
        );
      return held;
    },
    /** After a write; the score to report as cleared (or not clearable). */
    async after(
      item: ReviewPlanItem,
      handle: FieldCandidateHandle,
      result: V1WriteResult,
      typed: boolean,
    ): Promise<{ candidateId: string; cleared: boolean } | undefined> {
      const pair = pairOf(handle);
      if (!pair) return undefined;
      if (pair.field === "score") {
        if (result === "written")
          scores.set(pair.key, {
            handle,
            candidateId: item.candidateId,
            typed,
          });
        return undefined;
      }
      const score = scores.get(pair.key);
      if (result === "written" || !score?.typed) return undefined;
      const cleared = await clearScore(score.handle);
      skipV1History(
        score.handle.candidate.domName ?? score.candidateId,
        cleared ? "dependency-inactive" : "cleanup-failed",
        cleared ? "gpa-score-cleared" : "gpa-score-not-cleared",
      );
      return { candidateId: score.candidateId, cleared };
    },
  };
}
