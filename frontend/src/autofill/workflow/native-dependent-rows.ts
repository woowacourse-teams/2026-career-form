import type { Profile } from "../../profile/model";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type { FieldsAnalyzeRequest } from "../api/types";
import type { ReviewPlanItem } from "../review/review-plan";
import type { WriteFailureCode } from "../write/failure";
import type { NativeField } from "../policy/native-form-contract";
import {
  currentNativeOwner,
  nativeOwnership,
  type NativeOwnership,
} from "../policy/native-form-collection";
import {
  nativeControlValue,
  nativeRowWritable,
} from "../policy/native-form-row-state";
import {
  emptySearchTuple,
  searchNodes,
} from "../policy/native-form-search-dom";
import { nativeFieldControls } from "../policy/native-form-write";
import { committedSearchMatches } from "../policy/committed-search";
import { resolveValueBinding } from "../profile/value-binding";

export const ROW_SEARCH_REASON =
  "검색 결과를 확정하지 못해 이 행의 입력을 보류했습니다. 검색 항목과 같은 행의 정보를 직접 확인해 주세요.";
export const ROW_DRIVER_REASON =
  "조건부 선택을 확정하지 못해 이 행의 입력을 보류했습니다. 선택 항목과 같은 행의 정보를 직접 확인해 주세요.";

/** A dependent of one native driver row that may need a visible manual row. */
interface PendingDependent {
  owner: NativeOwnership;
  /** The dependent field and the fields merged into the same row. */
  fields: readonly NativeField[];
  search: boolean;
  /** Gated details of a failed search may not be rendered before a commit. */
  absentAllowed: boolean;
  itemIndex?: number;
  profileEntryId?: string;
}

/** Per workflow run: withheld native dependents and their causes. */
export interface NativeDependentState {
  /** Controls a non-search native driver deferred (ROW_DRIVER_UNCONFIRMED). */
  driverDeferred: WeakSet<Element>;
  pending: PendingDependent[];
  /** Row → merge keys already pending (dedup across passes). */
  seen: WeakMap<Element, Set<string>>;
}

export function createNativeDependentState(): NativeDependentState {
  return { driverDeferred: new WeakSet(), pending: [], seen: new WeakMap() };
}

/** Grade-only and score-only details share one profile value and one row. */
const examDetail = (f: NativeField) =>
  f.gate?.mode === "GRADE_ONLY" || f.gate?.mode === "SCORE_ONLY";
const mergeKey = (f: NativeField) => (examDetail(f) ? "exam-detail" : f.name);

/**
 * Remembers the dependents of a native driver so the result can show the ones
 * the run never collected. A failed driver keeps every dependent except the
 * registration number (privacy gate); a committed search keeps only its
 * committed-gated and ungated details (C10 waits for them softly). A driver
 * stopped by existing values (a filled tuple or a row the run did not write)
 * keeps nothing.
 */
export function rememberNativeDependents(
  state: NativeDependentState,
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  failed: boolean,
): void {
  const o = currentNativeOwner(handle);
  const driver = o?.field.driver;
  if (!o || !driver || !nativeRowWritable(o)) return;
  if (o.field.search) {
    const n = searchNodes(o.row, o.field, o.index);
    if (
      !n ||
      (failed ? !emptySearchTuple(n) : !committedSearchMatches(handle, item))
    )
      return;
  } else if (!failed) return;
  const seen = state.seen.get(o.row) ?? new Set<string>();
  state.seen.set(o.row, seen);
  const fields = driver.dependencies.flatMap((name) => {
    const f = o.section.fields.find((field) => field.name === name);
    return f &&
      f.gate?.mode !== "REGISTRATION" &&
      (failed || !f.gate || f.gate.mode === "COMMITTED")
      ? [f]
      : [];
  });
  for (const f of fields) {
    const key = mergeKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    state.pending.push({
      owner: o,
      fields: fields.filter((other) => mergeKey(other) === key),
      search: !!o.field.search,
      absentAllowed: failed && !!o.field.search && !!f.gate,
      itemIndex: item.itemIndex,
      profileEntryId: item.profileEntryId,
    });
  }
}

/** Fields collected in this snapshot, per native row. */
function collectedFields(
  request: FieldsAnalyzeRequest,
  registry: CandidateRegistry,
): Map<Element, Set<string>> {
  const collected = new Map<Element, Set<string>>();
  for (const section of request.sections)
    for (const field of [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ]) {
      const lookup = registry.lookupField(field.candidateId);
      const o =
        lookup.status === "ready" || lookup.status === "blocked"
          ? nativeOwnership(lookup.handle)
          : undefined;
      if (!o) continue;
      const names = collected.get(o.row) ?? new Set<string>();
      names.add(o.field.name);
      collected.set(o.row, names);
    }
  return collected;
}

function filled(o: NativeOwnership, f: NativeField, control: Element) {
  if (f.search) {
    const n = searchNodes(o.row, f, o.index);
    return !n || n.query.value !== "" || !emptySearchTuple(n);
  }
  return (
    (control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement) &&
    nativeControlValue(control) !== ""
  );
}

/**
 * Visible manual rows for remembered dependents that this pass did not
 * collect: fixed candidate ids, the profile preview, and the code of the
 * driver kind (search → ROW_SEARCH_UNCONFIRMED, otherwise
 * ROW_DRIVER_UNCONFIRMED). A dependent with a live value, a collected
 * candidate, an absent control (ungated) or no profile value gets no row.
 */
export function nativeDependentRows(
  state: NativeDependentState,
  request: FieldsAnalyzeRequest,
  registry: CandidateRegistry,
  profile: Profile,
): ReviewPlanItem[] {
  if (!state.pending.length) return [];
  const collected = collectedFields(request, registry);
  const rows: ReviewPlanItem[] = [];
  for (const pending of state.pending) {
    const o = pending.owner;
    if (!o.row.isConnected) continue;
    const names = collected.get(o.row);
    if (pending.fields.some((f) => names?.has(f.name))) continue;
    const controls = pending.fields.flatMap((f) =>
      nativeFieldControls(o, f).map((control) => ({ f, control })),
    );
    if (!controls.length && !pending.absentAllowed) continue;
    if (controls.some(({ f, control }) => filled(o, f, control))) continue;
    const f = pending.fields[0];
    const value = resolveValueBinding(profile, f.binding, pending.itemIndex);
    if (
      value.status !== "resolved" ||
      value.sensitive ||
      !value.value.trim() ||
      (pending.profileEntryId !== undefined &&
        value.profileEntryId !== undefined &&
        value.profileEntryId !== pending.profileEntryId)
    )
      continue;
    const failureCode: WriteFailureCode = pending.search
      ? "ROW_SEARCH_UNCONFIRMED"
      : "ROW_DRIVER_UNCONFIRMED";
    rows.push({
      candidateId: `native-dependent-${f.name}-${o.index ?? 0}`,
      fieldLabel: f.label,
      ...(f.binding.profileFieldKey
        ? { profileFieldKey: f.binding.profileFieldKey }
        : {}),
      ...(value.profileEntryId ? { profileEntryId: value.profileEntryId } : {}),
      ...(pending.itemIndex !== undefined
        ? { itemIndex: pending.itemIndex }
        : {}),
      currentValue: "",
      profileValue: value.value,
      previewValue: value.value,
      status: "unavailable",
      selected: false,
      disabled: true,
      revealed: false,
      reason: pending.search ? ROW_SEARCH_REASON : ROW_DRIVER_REASON,
      failureCode,
    });
  }
  return rows;
}
