import { debugRuntimeSkip } from "../../debug/structural-diagnostics";
import type { CandidateRegistry } from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
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
  v1HistoryControl,
  v1HistoryControlValue,
  type HistoryControl,
  type HistorySpec,
} from "./v1-history-controls";

export const V1_HISTORY_DATE_REASON =
  "연·월·일이 모두 있는 지난 날짜만 입력할 수 있습니다.";
export const V1_HISTORY_GPA_REASON =
  "평점과 만점기준을 함께 입력할 수 있을 때만 입력합니다.";

const command = (spec: HistorySpec) =>
  spec.kind === "toggle"
    ? "CHECK_RADIO"
    : spec.kind === "dropdown"
      ? "SELECT_OPTION"
      : "SET_TEXT";

/** The backend's exact binding for this card field (LOOKUP targets are page labels). */
function approved(
  spec: HistorySpec,
  item: Pick<ReviewPlanItem, "analysis">,
): boolean {
  const a = item.analysis,
    b = a?.valueBinding;
  if (
    a?.mappingStatus !== "ADAPTER_VERIFIED" ||
    a.interactionStatus !== "READY" ||
    a.autofillPolicy !== "ALLOWED" ||
    a.writePlan?.command !== command(spec) ||
    b?.profileFieldKey !== spec.profile
  )
    return false;
  if (spec.kind === "text" || spec.kind === "date") return b.type === "DIRECT";
  if (b.type !== "LOOKUP") return false;
  const targets = Object.values(b.optionMap);
  return targets.length > 0 && targets.every((t) => spec.options.includes(t));
}

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
};

/** A profile date as the page's full YYYY.MM.DD (the page keeps nothing else). */
function fullDay(value: string): string | undefined {
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

/** The value to write in page terms, or undefined when it cannot be written. */
export function v1HistoryTarget(
  control: HistoryControl,
  value: string,
): string | undefined {
  if (!value.trim()) return undefined;
  const { spec } = control;
  if (spec.kind === "date") {
    const day = fullDay(value);
    if (!day) return undefined;
    if (day <= today()) return day;
    // A future 졸업일 only for 졸업예정, at most six years ahead.
    return spec.future &&
      cardStatus(control) === "졸업예정" &&
      Number(day.slice(0, 4)) <= new Date().getFullYear() + 6
      ? day
      : undefined;
  }
  if (spec.kind === "text") {
    if (!spec.numeric) return value;
    // A score is written only under the card's chosen scale.
    const scale = v1HistoryControl(
      control.row.ownerDocument,
      control.group,
      control.index,
      "perfectScore",
    );
    const shown = scale && v1HistoryControlValue(scale);
    const score = numeric(value);
    return shown &&
      scaleLabels.includes(shown) &&
      score >= 0 &&
      score <= Number(shown)
      ? value.trim()
      : undefined;
  }
  return spec.options.includes(value) ? value : undefined;
}

export function isV1HistoryStateDriver(
  item: ReviewPlanItem,
  name: string | undefined,
): boolean {
  const parsed = parseV1HistoryName(name);
  const spec = parsed && historySpec(parsed.group, parsed.field);
  return (
    !!spec && spec.kind === "toggle" && !!spec.unlocks && approved(spec, item)
  );
}

export function v1HistoryRetained(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  const control = ownedV1HistoryControl(handle);
  if (!control || !approved(control.spec, item)) return false;
  const target = v1HistoryTarget(control, item.profileValue ?? "");
  return target !== undefined && v1HistoryControlValue(control) === target;
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
  return target !== undefined && current === target;
}

/** Why a step-2 write was refused, for the result screen. */
export function v1HistoryFailureReason(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  fallback: string,
): string {
  const control = ownedV1HistoryControl(handle);
  return control?.spec.kind === "date" &&
    v1HistoryTarget(control, item.profileValue ?? "") === undefined
    ? V1_HISTORY_DATE_REASON
    : fallback;
}

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

const SUGGESTION_MS = 800;
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

/**
 * 회사명 keeps the typed text; its optional suggestion list must not stay
 * open and is never picked. Watches the row for a bounded window and closes
 * any list through the row title (outside the list).
 */
async function closeSuggestions(
  row: Element,
  owned: () => boolean,
): Promise<boolean> {
  const title = row.firstElementChild as HTMLElement;
  const open = () => row.querySelector("#dropdown-body") !== null;
  const deadline = Date.now() + SUGGESTION_MS;
  let closes = 0;
  while (Date.now() < deadline || open()) {
    if (!owned()) return false;
    if (open()) {
      if (closes++ >= 2) return false;
      title.click();
      if (!(await waitFor(() => !open(), owned))) return false;
      continue;
    }
    await tick();
  }
  return owned();
}

export async function writeV1History(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  currentRun: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): Promise<V1WriteResult> {
  const control = ownedV1HistoryControl(handle);
  if (!control) return "failed";
  const { spec } = control;
  const document = control.row.ownerDocument;
  const value = item.profileValue;
  const original = v1HistoryControlValue(control);
  if (original === undefined || !approved(spec, item)) return "failed";
  const target = v1HistoryTarget(control, value ?? "");
  if (!target)
    return (spec.kind === "toggle" || spec.kind === "dropdown") && value?.trim()
      ? "option-unmatched"
      : "failed";
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
      item.status === "available" &&
      item.candidateId === handle.candidateId &&
      item.analysis?.candidateId === handle.candidateId &&
      approved(spec, item) &&
      shown !== undefined &&
      allowed.includes(shown)
    );
  };
  if (!owned()) return "failed";
  if (original === target) return "written";
  // A control that already holds a value is never overwritten.
  if (original !== "") return "failed";
  const input = control.elements[0];
  if (
    (spec.kind === "text" || spec.kind === "date") &&
    input.maxLength >= 0 &&
    target.length > input.maxLength
  )
    return "failed";
  try {
    if (beforeMutation && !(await beforeMutation())) return "failed";
  } catch {
    return "failed";
  }
  if (!owned()) return "failed";
  const shows = () => {
    const now = ownedV1HistoryControl(handle);
    return !!now && v1HistoryControlValue(now) === target;
  };
  if (spec.kind === "text" || spec.kind === "date") {
    input.focus();
    if (!owned()) return "failed";
    setValue(input, target);
    allowed = [original, target];
    for (const type of ["input", "change"]) {
      input.dispatchEvent(new Event(type, { bubbles: true }));
      if (!owned()) return "failed";
    }
    input.blur();
    if (
      !(await waitFor(shows, owned)) ||
      !(input.checkValidity() || numericStepOnly(spec, input.validity))
    )
      return "failed";
    if (spec.kind === "text" && spec.suggestions) {
      if (!(await closeSuggestions(control.row, owned))) {
        debugRuntimeSkip(control.name, "cleanup-failed", "v1-suggestions");
        return "failed";
      }
      return shows() ? "written" : "failed";
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
      return "failed";
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
      : "failed";
  }
  return writeV1Dropdown(
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
}

/** After 재직중/퇴사: wait until 퇴사 has unlocked the card's 퇴사일. */
export async function settleV1HistoryStateDriver(
  handle: FieldCandidateHandle,
  signal?: AbortSignal,
  item?: ReviewPlanItem,
): Promise<boolean> {
  const control = ownedV1HistoryControl(handle);
  if (
    !control ||
    !item ||
    item.candidateId !== handle.candidateId ||
    !item.selected ||
    item.disabled ||
    control.spec.kind !== "toggle" ||
    !approved(control.spec, item) ||
    !v1HistoryRetained(handle, item)
  )
    return false;
  if (v1HistoryControlValue(control) !== control.spec.unlocks) return true;
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

/** A failed 재직중/퇴사 driver defers its own row. */
export function v1HistoryDriverRow(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): Element | undefined {
  return isV1HistoryStateDriver(item, handle.candidate.domName)
    ? ownedV1HistoryControl(handle)?.row
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
