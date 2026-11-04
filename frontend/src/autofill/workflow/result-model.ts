import type { FieldCandidateHandle } from "../dom/types";
import type { Profile } from "../../profile/model";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import type { WriteFailureCode } from "../write/failure";
import { progressCategory, type WriteProgress } from "./progress-model";
import { savedResultValues } from "./result-preview";
import { isSkippedByApproval } from "./workflow-model";
import { matchesResultValue } from "./result-value-match";
import { resultFieldLabel } from "./result-label";
import { nativeRetainedValueMatches } from "../policy/native-form-write";
import { genericReasonText } from "../generic/grade-reason-text";

export interface ResultModelInput {
  reviewItems: readonly ReviewPlanItem[];
  results: readonly ApprovedWriteResult[];
  progress?: readonly WriteProgress[];
  profile?: Profile;
  wasWritten?(candidateId: string): boolean;
  progressIdFor?(candidateId: string): string | undefined;
  progressStateFor?(progressId: string): boolean;
  fieldStateFor?(
    candidateId: string,
  ):
    | { visible: boolean; value: string; handle?: FieldCandidateHandle }
    | undefined;
}
export interface ResultModel {
  completed: WriteProgress[];
  pending: {
    id: string;
    item?: ReviewPlanItem;
    reason: string;
    written: boolean;
    failureCode?: WriteFailureCode;
    /** Replaces the standard guidance sentence for this row. */
    detail?: string;
  }[];
  skipped: { id: string; item: ReviewPlanItem; reason: string }[];
}
function pendingReason(item: ReviewPlanItem): string {
  if (item.status === "conflict") return "기존 값과 다름";
  // A retained native row whose page value differs from its matched entry.
  if (
    item.status === "unavailable" &&
    item.itemIndex !== undefined &&
    item.currentValue.trim()
  )
    return "기존 값과 다름";
  // Held back by its grade: nothing failed, the applicant only has to check it.
  if (
    item.genericGrade === "REVIEW" &&
    item.genericReasonCode !== "OPTION_VALUE_UNMATCHED"
  )
    return "값 확인 필요";
  if (
    item.status === "needs-review" ||
    /선택|반복|후보/.test(item.reason) ||
    /^(SELECT_|CHECK_)/.test(item.analysis?.writePlan?.command ?? "")
  )
    return "선택 필요";
  return "입력 못함";
}

function gradeDetail(item: ReviewPlanItem): string | undefined {
  if (!item.genericGrade || item.genericGrade === "AUTO") return undefined;
  return item.genericReasonCode
    ? genericReasonText(item.genericReasonCode)
    : item.reason || undefined;
}

export function buildResultModel(input: ResultModelInput): ResultModel {
  const {
    reviewItems,
    results,
    profile,
    progress,
    wasWritten,
    progressIdFor,
    progressStateFor,
    fieldStateFor,
  } = input;
  const items = new Map(reviewItems.map((item) => [item.candidateId, item]));
  const resultsById = new Map(
    results.map((result) => [result.candidateId, result]),
  );
  const ledger =
    progress ??
    results.map((result) => {
      const item = items.get(result.candidateId);
      return {
        id: result.candidateId,
        candidateId: result.candidateId,
        label: item ? resultFieldLabel(item) : "입력 필드",
        category: item ? progressCategory(item) : "기타 항목",
        status: result.status,
        ...(result.status === "skipped" && result.failureCode
          ? { failureCode: result.failureCode }
          : {}),
      };
    });
  const entries = new Map<string, WriteProgress>(
    ledger.map((entry) => [entry.id, entry]),
  );
  const completed = new Map(
    [...entries].filter(
      ([, entry]) => entry.status === "written" && !entry.unchanged,
    ),
  );
  const pending: ResultModel["pending"] = [];
  const skipped: ResultModel["skipped"] = [];
  const handled = new Set<string>();
  const stableIdFor = (id: string) =>
    progressIdFor ? (progressIdFor(id) ?? `unrecorded:${id}`) : id;
  for (const item of items.values()) {
    const id = item.candidateId;
    const stableId = stableIdFor(id);
    handled.add(stableId);
    const entry = entries.get(stableId);
    const result = resultsById.get(id);
    const recorded =
      wasWritten?.(id) ??
      (progress ? entry?.status === "written" : result?.status === "written");
    const written =
      !!recorded &&
      (entry?.status === "written" || result?.status === "written");
    const saved = savedResultValues(item, profile);
    const live = fieldStateFor?.(id);
    const current = live?.value ?? item.currentValue;
    const matches =
      saved.length === 1 &&
      matchesResultValue(item, current, saved[0].value, live?.handle);
    const recoveredRetry =
      entry?.retryRecovered &&
      written &&
      live?.visible === true &&
      matches &&
      progressStateFor?.(stableId) === true;
    const failureCode =
      result?.status === "skipped" && !isSkippedByApproval(result)
        ? (result.failureCode ??
          (entry?.status === "skipped" ? entry.failureCode : undefined))
        : !result && entry?.status === "skipped"
          ? entry.failureCode
          : undefined;
    const skip = (reason: string) => {
      completed.delete(stableId);
      skipped.push({ id, item, reason });
    };
    const review = (
      reason: string,
      failureCode?: WriteFailureCode,
      detail?: string,
    ) => {
      completed.delete(stableId);
      pending.push({
        id,
        item,
        reason,
        written: written && !entry?.unchanged,
        ...(failureCode ? { failureCode } : {}),
        ...(detail ? { detail } : {}),
      });
    };
    if (live?.visible === false) {
      skip("현재 표시되지 않는 항목");
    } else if (item.addressManualReason) {
      review("입력 결과 확인", undefined, item.addressManualReason);
    } else if (
      !saved.length &&
      item.genericGrade === "BLOCKED" &&
      !item.hiddenFromReview
    ) {
      review("입력 못함", undefined, gradeDetail(item));
    } else if (!saved.length) {
      skip(
        item.profileFieldKey ||
          item.analysis?.profileFieldKey ||
          item.analysis?.valueBinding
          ? "등록된 정보 없음"
          : "자동 입력 미지원",
      );
    } else if (
      item.status === "unavailable" &&
      !written &&
      item.itemIndex !== undefined &&
      live?.handle &&
      saved.length === 1 &&
      nativeRetainedValueMatches(live.handle, saved[0].value)
    ) {
      skip("기존 값 유지");
    } else if (
      matches &&
      (failureCode === "SEARCH_SELECTION_UNVERIFIED" ||
        failureCode === "VALUE_MATCH_UNRECORDED")
    ) {
      review("입력 결과 확인", failureCode);
    } else if (
      (failureCode ?? item.failureCode) &&
      !recoveredRetry &&
      !(
        (failureCode === "ROW_SEARCH_UNCONFIRMED" ||
          failureCode === "ROW_DRIVER_UNCONFIRMED") &&
        entry?.unchanged &&
        matches
      )
    ) {
      review("입력 못함", failureCode ?? item.failureCode);
    } else if (entry?.unchanged && matches) {
      skip("기존 값 유지");
    } else if (item.status === "conflict" && !written && !matches) {
      review("기존 값과 다름");
    } else if (
      result?.status === "skipped" &&
      !isSkippedByApproval(result) &&
      !recoveredRetry
    ) {
      review("입력 못함", result.failureCode ?? entry?.failureCode);
    } else if (written) {
      const uncertain =
        item.status === "needs-review" ||
        item.analysis?.mappingStatus === "LLM_SUGGESTED";
      if (
        (fieldStateFor && !live) ||
        (live && !matches) ||
        progressStateFor?.(stableId) === false ||
        (uncertain &&
          (!live ||
            !matches ||
            (item.analysis?.mappingStatus !== "ADAPTER_VERIFIED" &&
              item.analysis?.mappingStatus !== "LLM_SUGGESTED")))
      )
        review("입력 결과 확인");
    } else if (matches) {
      skip("기존 값 유지");
    } else {
      const code = entry?.status === "skipped" ? entry.failureCode : undefined;
      review(pendingReason(item), code, code ? undefined : gradeDetail(item));
    }
  }
  for (const result of resultsById.values()) {
    if (
      items.has(result.candidateId) ||
      result.status !== "skipped" ||
      isSkippedByApproval(result)
    )
      continue;
    const stableId = stableIdFor(result.candidateId);
    handled.add(stableId);
    completed.delete(stableId);
    pending.push({
      id: result.candidateId,
      reason: "입력 못함",
      written: false,
      ...(result.failureCode ? { failureCode: result.failureCode } : {}),
    });
  }
  for (const entry of entries.values()) {
    if (handled.has(entry.id)) continue;
    if (entry.status === "written" && progressStateFor?.(entry.id) !== false)
      continue;
    completed.delete(entry.id);
    const id = `progress:${entry.id}`;
    pending.push({
      id,
      written: entry.status === "written" && !entry.unchanged,
      reason: entry.status === "written" ? "입력 결과 확인" : "입력 못함",
      ...(entry.status === "skipped" && entry.failureCode
        ? { failureCode: entry.failureCode }
        : {}),
      item: {
        candidateId: id,
        fieldLabel: entry.label,
        currentValue: "",
        previewValue: "",
        status: "unavailable",
        selected: false,
        disabled: true,
        revealed: false,
        reason: "",
      },
    });
  }
  return {
    completed: [...completed.values()],
    pending: mergeSameControl(pending, fieldStateFor),
    skipped,
  };
}

// Least to most actionable: a failed write tells the user to act, a result to
// confirm only asks for a look.
const REASON_ACTIONABILITY = [
  "입력 결과 확인",
  "기존 값과 다름",
  "선택 필요",
  "입력 못함",
];

/**
 * Review items are collected per scan, so one control can be reviewed twice
 * under different candidate ids. Keep the most actionable row per control.
 */
function mergeSameControl(
  pending: ResultModel["pending"],
  fieldStateFor: ResultModelInput["fieldStateFor"],
): ResultModel["pending"] {
  if (!fieldStateFor) return pending;
  const rowOfControl = new Map<Element, number>();
  const merged: ResultModel["pending"] = [];
  for (const entry of pending) {
    const handle = entry.id.startsWith("progress:")
      ? undefined
      : fieldStateFor(entry.id)?.handle;
    const control = handle?.elements[0] ?? handle?.customElements?.[0];
    const at = control ? rowOfControl.get(control) : undefined;
    if (at === undefined) {
      if (control) rowOfControl.set(control, merged.length);
      merged.push(entry);
    } else if (
      REASON_ACTIONABILITY.indexOf(entry.reason) >
      REASON_ACTIONABILITY.indexOf(merged[at].reason)
    ) {
      merged[at] = entry;
    }
  }
  return merged;
}

// These skipped items are not left empty: the page already holds the value,
// or the field is not on screen.
const NOT_UNFILLED_REASONS = new Set([
  "기존 값 유지",
  "현재 표시되지 않는 항목",
]);

/**
 * Candidate ids of fields the user still has to fill. A pending item keeps its
 * mark even with a value; a skipped one with a value (a site default) does not.
 */
export function unfilledCandidateIds(
  model: ResultModel,
  valueOf: (id: string) => string | undefined = () => undefined,
): string[] {
  return [
    ...model.pending.map(({ id }) => id),
    ...model.skipped
      .filter(
        ({ id, reason }) =>
          !NOT_UNFILLED_REASONS.has(reason) && !valueOf(id)?.trim(),
      )
      .map(({ id }) => id),
  ];
}
