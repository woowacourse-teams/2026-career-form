import { debugRuntimeSkip } from "../../debug/structural-diagnostics";
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
  v1HistoryChip,
  v1HistoryControl,
  v1HistoryControlValue,
  v1HistorySectionId,
  type HistoryControl,
  type HistorySpec,
} from "./v1-history-controls";

export const V1_HISTORY_DATE_REASON =
  "연·월·일이 모두 있는 지난 날짜만 입력할 수 있습니다.";
export const V1_HISTORY_GPA_REASON =
  "평점과 만점기준을 함께 입력할 수 있을 때만 입력합니다.";
export const V1_HISTORY_GPA_ROLLBACK_REASON =
  "만점기준을 선택하지 못했고 입력한 평점을 지우지 못했습니다. 평점과 만점기준을 직접 확인해 주세요.";
export const V1_HISTORY_LEAVING_REASON =
  "프로필의 재직 여부가 퇴직일 때만 퇴사일을 입력합니다.";

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
  if (spec.kind === "text" || spec.kind === "date" || spec.kind === "search")
    return b.type === "DIRECT";
  if (b.type !== "LOOKUP") return false;
  const targets = Object.values(b.optionMap);
  return targets.length > 0 && targets.every((t) => spec.options.includes(t));
}

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
};
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const text = (e: Element | null | undefined) => normalize(e?.textContent ?? "");

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

/** A step-2 handle, by name (its search input may be gone after a pick). */
export function isV1HistoryHandle(handle: FieldCandidateHandle): boolean {
  return (
    handle.sectionId === v1HistorySectionId &&
    handle.candidate.domId === handle.candidate.domName &&
    parseV1HistoryName(handle.candidate.domName) !== undefined
  );
}

/** The chip of a picked search field, when its handle names one. */
function pickedChip(handle: FieldCandidateHandle): string | undefined {
  const parsed = parseV1HistoryName(handle.candidate.domName);
  const document = handle.elements[0]?.ownerDocument;
  return parsed &&
    document &&
    (parsed.field === "academyName" || parsed.field === "major0.majorName")
    ? v1HistoryChip(document, parsed.group, parsed.index, parsed.field)
    : undefined;
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
  if (
    control?.field === "leavingDate" &&
    appliedStatus.get(control.row) !== "퇴사"
  )
    return V1_HISTORY_LEAVING_REASON;
  return control?.spec.kind === "date" &&
    v1HistoryTarget(control, item.profileValue ?? "") === undefined
    ? V1_HISTORY_DATE_REASON
    : fallback;
}

const SUGGESTION_MS = 800;
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
  // A search runs only as its stage-1 driver (writeV1HistorySearch).
  if (spec.kind === "search") return "failed";
  const document = control.row.ownerDocument;
  const value = item.profileValue;
  const original = v1HistoryControlValue(control);
  if (original === undefined || !approved(spec, item)) return "failed";
  const target = v1HistoryTarget(control, value ?? "");
  if (control.field === "workingStatus" && target)
    appliedStatus.set(control.row, target);
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
  // 퇴사일: only after this run applied a profile 퇴사 to the card (an
  // applicant's own 퇴사 under a profile 재직중 does not unlock it for us).
  if (
    control.field === "leavingDate" &&
    appliedStatus.get(control.row) !== "퇴사"
  )
    return "failed";
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

const SEARCH_MS = 5000;
const STABLE_MS = 300;

/** The rows of a result list as (click target, name); undefined when a row
 * is not a plain text `li` or an `li > button` holding only text. */
function resultRows(
  body: Element,
): { target: HTMLElement; name: string }[] | undefined {
  const rows: { target: HTMLElement; name: string }[] = [];
  for (const li of Array.from(body.querySelectorAll<HTMLElement>("ul > li"))) {
    const kids = Array.from(li.children);
    if (kids.length === 0) rows.push({ target: li, name: text(li) });
    else if (
      kids.length === 1 &&
      kids[0] instanceof HTMLButtonElement &&
      kids[0].children.length === 0
    )
      rows.push({ target: kids[0], name: text(kids[0]) });
    else return undefined;
  }
  return rows;
}

/**
 * One search of a school or major name (stage-1 driver). Types the profile
 * name once into this card's own input, waits (≤ 5 s) for the widget's own
 * `#dropdown-body` list to settle, and clicks a row only when exactly one
 * row's text equals the name. The pick is verified by the input leaving the
 * row and the chip showing exactly the name. Anything else clears the typed
 * text, closes the list without picking and reports a search code.
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
  if (
    !control ||
    control.spec.kind !== "search" ||
    !approved(control.spec, item) ||
    !name
  )
    return { written: false };
  const input = control.elements[0];
  // Text the applicant typed is an existing value: never replaced.
  if (input.value !== "") return { written: false };
  const { row } = control;
  const widget = input.closest("[data-review-key]") ?? input.parentElement!;
  const document = row.ownerDocument;
  const url = document.URL;
  const live = () =>
    currentRun() &&
    document.URL === url &&
    item.profileValue === value &&
    item.selected &&
    !item.disabled &&
    item.status === "available" &&
    approved(control.spec, item);
  const bodies = () => Array.from(widget.querySelectorAll("#dropdown-body"));
  const cleanup = async (code: WriteFailureCode) => {
    if (input.isConnected) {
      setValue(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.blur();
    }
    if (
      !(await waitFor(
        () => bodies().length === 0,
        () => true,
        1000,
      ))
    ) {
      (row.firstElementChild as HTMLElement).click();
      await waitFor(
        () => bodies().length === 0,
        () => true,
        1000,
      );
    }
    if (bodies().length || (input.isConnected && input.value !== ""))
      debugRuntimeSkip(control.name, "cleanup-failed", "v1-search");
    return { written: false, code };
  };
  try {
    if (beforeMutation && !(await beforeMutation())) return { written: false };
  } catch {
    return { written: false };
  }
  if (!live() || !ownedV1HistoryControl(handle)) return { written: false };
  input.focus();
  setValue(input, name);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  let shown = "";
  let since = 0;
  const settled = await waitFor(
    () => {
      const [body, extra] = bodies();
      const items = body && !extra ? body.querySelectorAll("ul > li") : [];
      if (!items.length) {
        shown = "";
        return false;
      }
      const now = Array.from(items).map(text).join("\n");
      if (now !== shown) {
        shown = now;
        since = Date.now();
        return false;
      }
      return Date.now() - since >= STABLE_MS;
    },
    () => live() && input.isConnected,
    SEARCH_MS,
  );
  if (!settled)
    return cleanup(
      bodies().length === 1 && !shown ? "SEARCH_NO_RESULTS" : "SEARCH_TIMEOUT",
    );
  const rows = resultRows(bodies()[0]);
  if (!rows) return cleanup("SEARCH_FORM_UNVERIFIED");
  const exact = rows.filter((r) => normalize(r.name) === name);
  if (exact.length === 0) return cleanup("SEARCH_NO_EXACT_MATCH");
  if (exact.length > 1) return cleanup("SEARCH_AMBIGUOUS");
  if (!live()) return cleanup("SEARCH_UNCONFIRMED");
  exact[0].target.click();
  const picked = await waitFor(
    () => !row.contains(input) && pickedChip(handle) === name,
    () => live(),
  );
  if (picked) return { written: true };
  return row.contains(input)
    ? cleanup("SEARCH_SELECTION_UNVERIFIED")
    : { written: false, code: "SEARCH_SELECTION_UNVERIFIED" };
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
    return pickedChip(handle) === normalize(item.profileValue ?? "");
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
      return (
        blocked.has(item.candidateId) ||
        (pair?.field === "perfectScore" && !scores.has(pair.key))
      );
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
      return {
        candidateId: score.candidateId,
        cleared: await clearScore(score.handle),
      };
    },
  };
}
