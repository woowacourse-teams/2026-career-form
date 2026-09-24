import { createInteractionDecisionSession } from "../api/interaction-decision-session";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import {
  executeReadonlySearch,
  type ReadonlySearchExecutionResult,
  type ReadonlySearchFailureReason,
} from "../interaction";
import {
  normalized,
  targetIsCurrent,
  type TargetIdentity,
} from "../interaction/readonly-search";
import { schoolRegionSearchValues } from "../../profile/standard-values";
import { isAutofillProfileFieldKey } from "../profile/profile-field-key";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "./executor";

const MAX_SEARCHES = 4;
const STALE = "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.";
const CONFLICT = "입력 직전 지원서에 다른 값이 있어 기존 값을 보존했습니다.";
const RETENTION = "입력 후 값이 유지되지 않아 확인이 필요합니다.";
const retainedSearches = new WeakMap<
  ReviewPlanItem,
  {
    identity: TargetIdentity;
    document: Document;
    acceptedValues: readonly string[];
    assertCurrent: () => boolean;
  }
>();

type SearchFailureReason =
  | ReadonlySearchFailureReason
  | "existing_value_conflict"
  | "search_query_conflict"
  | "decision_abstained"
  | "aborted";

type ExecuteApprovedSearchWritesArgs = {
  items: readonly ReviewPlanItem[];
  approvedCandidateIds: ReadonlySet<string>;
  registry: CandidateRegistry;
  interactionDecisionProvider?: InteractionDecisionProvider;
  assertCurrent?: () => boolean;
  results: ApprovedWriteResult[];
  beforeMutation?: () => Promise<boolean>;
  signal?: AbortSignal;
  beforeWrite?: (item: ReviewPlanItem) => Promise<void>;
  onResult?: (item: ReviewPlanItem, result: ApprovedWriteResult) => void;
  writeOrdinary?: (item: ReviewPlanItem) => ApprovedWriteResult;
};

export function isSelectableApproved(item: ReviewPlanItem): boolean {
  if (
    !item.selected ||
    item.disabled ||
    !item.analysis ||
    !item.profileValue ||
    item.status === "unavailable"
  )
    return false;
  return item.status !== "sensitive" || item.revealed;
}

export function bindingKey(item: ReviewPlanItem): string | undefined {
  if (item.analysis?.mappingStatus !== "LLM_SUGGESTED") return undefined;
  const key =
    item.analysis?.valueBinding?.profileFieldKey ??
    item.analysis?.profileFieldKey;
  return item.profileEntryId && key
    ? `${item.profileEntryId}:${key}`
    : undefined;
}

function skipped(
  candidateId: string,
  outcome: "failed" | "needs-verification" | "unsupported",
  code: NonNullable<
    Extract<ApprovedWriteResult, { status: "skipped" }>["code"]
  >,
  reason: string,
): ApprovedWriteResult {
  return { candidateId, status: "skipped", outcome, code, reason };
}

function written(candidateId: string): ApprovedWriteResult {
  return {
    candidateId,
    status: "written",
    outcome: "success",
    code: "WRITTEN",
  };
}

export function approvedIdsWithoutSearchSelections(
  items: readonly ReviewPlanItem[],
  approvedCandidateIds: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(
    [...approvedCandidateIds].filter(
      (id) =>
        !items.some(
          (item) =>
            item.candidateId === id &&
            item.analysis?.writePlan?.command === "SEARCH_SELECTION",
        ),
    ),
  );
}

export function settledSearchSelectionResult(
  item: ReviewPlanItem,
  registry: CandidateRegistry,
  result: ApprovedWriteResult,
): ApprovedWriteResult {
  const captured = retainedSearches.get(item);
  const current =
    captured &&
    targetIsCurrent(
      captured.document,
      registry,
      item.candidateId,
      captured.identity,
      captured.assertCurrent,
      captured.acceptedValues,
    );
  return current && typeof current !== "string"
    ? result
    : skipped(
        item.candidateId,
        "needs-verification",
        "RETAINED_VALUE_UNCONFIRMED",
        RETENTION,
      );
}

function failureOutcome(
  reason: SearchFailureReason,
): "failed" | "needs-verification" | "unsupported" {
  if (reason === "execution_failed") return "failed";
  return [
    "result_not_reflected",
    "stale_target",
    "stale_field_group",
    "stale_repeat_row",
    "existing_value_conflict",
    "search_query_conflict",
    "aborted",
    "popup_unresolved",
  ].includes(reason)
    ? "needs-verification"
    : "unsupported";
}

function failureCode(
  reason: SearchFailureReason,
): NonNullable<Extract<ApprovedWriteResult, { status: "skipped" }>["code"]> {
  if (reason === "result_not_reflected") return "RETAINED_VALUE_UNCONFIRMED";
  if (reason === "execution_failed") return "EXECUTION_FAILED";
  if (reason.startsWith("stale_")) return "STALE_TARGET";
  if (reason.endsWith("_conflict")) return "CONFLICT";
  return "UNSUPPORTED_CONTROL";
}

function searchFailureMessage(reason: SearchFailureReason): string {
  const messages: Partial<Record<SearchFailureReason, string>> = {
    popup_unresolved:
      "선택값 반영과 검색 화면 닫힘을 함께 확인할 수 없어 후속 자동 기입을 중단했습니다.",
    surface_not_found: "원래 입력칸에 연결된 검색 화면을 확인할 수 없습니다.",
    surface_ambiguous: "연결 가능한 검색 화면이 여러 개여서 중단했습니다.",
    surface_stale: "검색 화면 또는 제어 요소가 변경되어 중단했습니다.",
    surface_unobservable: "검색 화면의 연결 관계를 확인할 수 없습니다.",
    surface_navigation_unsafe:
      "허용된 검색 화면 내부 이동인지 확인할 수 없어 중단했습니다.",
    result_set_incomplete:
      "전체 검색 결과가 표시됐는지 확인할 수 없어 선택하지 않았습니다.",
    result_pending: "현재 검색의 결과 완료를 확인할 수 없어 중단했습니다.",
    result_stale: "선택 직전 검색 결과가 변경되어 중단했습니다.",
    deadline_exceeded: "검색 대기 시간 상한에 도달해 중단했습니다.",
    run_in_progress: "이미 자동 기입이 실행 중입니다.",
    field_not_readonly:
      "검색 대상 입력칸이 읽기 전용 상태인지 확인할 수 없어 중단했습니다.",
    search_opener_not_found:
      "검색 대상 입력칸과 연결된 검색 버튼을 확인할 수 없어 중단했습니다.",
    popup_frame_not_found:
      "검색 팝업 iframe이 열리거나 준비되는 것을 확인할 수 없어 중단했습니다.",
    inaccessible_popup_frame:
      "검색 iframe의 origin 또는 접근 권한을 확인할 수 없어 중단했습니다.",
    multiple_popup_frames: "검색 팝업 iframe이 여러 개여서 결정할 수 없습니다.",
    multiple_search_openers: "검색 버튼이 여러 개여서 결정할 수 없습니다.",
    multiple_search_query_inputs:
      "검색 입력칸이 여러 개여서 결정할 수 없습니다.",
    search_query_not_found:
      "검색 팝업에서 입력칸을 확인할 수 없어 중단했습니다.",
    multiple_search_submits: "검색 실행 버튼이 여러 개여서 결정할 수 없습니다.",
    search_submit_not_found:
      "검색 팝업에서 검색 실행 버튼을 확인할 수 없어 중단했습니다.",
    multiple_matching_results:
      "동일한 표시값 결과가 여러 개여서 선택하지 않았습니다.",
    search_results_not_found:
      "프로필 값과 정확히 일치하는 검색 결과가 없습니다.",
    unverified_search_form:
      "검색 폼과 지원서 제출 동작을 안전하게 구분할 수 없습니다.",
    result_not_reflected:
      "결과 선택 후 원래 입력칸에 값이 반영되지 않아 확인이 필요합니다.",
    result_activation_unsafe:
      "검색 결과를 안전하게 선택할 수 없어 중단했습니다.",
    stale_target: "검색 중 원래 입력칸이 변경되어 중단했습니다.",
    stale_field_group: "검색 중 원래 필드 그룹이 변경되어 중단했습니다.",
    stale_repeat_row: "검색 중 반복 행이 변경되어 중단했습니다.",
    decision_abstained:
      "현재 관측한 검색 후보의 역할을 결정할 수 없어 중단했습니다.",
    model_response_invalid:
      "검색 후보 판단 응답을 검증할 수 없어 중단했습니다.",
    decision_budget_exhausted: "검색 판단 호출 상한에 도달해 중단했습니다.",
    existing_value_conflict: CONFLICT,
    search_query_conflict:
      "검색 팝업에 기존 검색어가 있어 변경하지 않았습니다.",
    aborted: "검색 실행이 취소되었습니다.",
    execution_failed: "검색 중 페이지 동작 오류가 발생했습니다.",
  };
  return (
    messages[reason] ??
    "검색 제어의 연결과 실행 가능 여부를 확인할 수 없어 중단했습니다."
  );
}

export async function executeApprovedSearchWrites({
  items,
  approvedCandidateIds,
  registry,
  interactionDecisionProvider,
  assertCurrent,
  results,
  beforeMutation,
  signal,
  writeOrdinary,
  beforeWrite,
  onResult,
}: ExecuteApprovedSearchWritesArgs): Promise<boolean> {
  const seenBindings = new Set<string>();
  const seenCandidates = new Set<string>();
  const decisionSession = interactionDecisionProvider
    ? createInteractionDecisionSession(interactionDecisionProvider)
    : undefined;
  let searchCount = 0;

  for (const [index, item] of items.entries()) {
    const key = bindingKey(item);
    const duplicate =
      seenCandidates.has(item.candidateId) ||
      (key !== undefined && seenBindings.has(key));
    if (
      approvedCandidateIds.has(item.candidateId) &&
      isSelectableApproved(item)
    ) {
      seenCandidates.add(item.candidateId);
      if (key) seenBindings.add(key);
    }
    if (
      !approvedCandidateIds.has(item.candidateId) ||
      !isSelectableApproved(item)
    )
      continue;
    if (duplicate) {
      results[index] = skipped(
        item.candidateId,
        "needs-verification",
        "DUPLICATE_BINDING",
        "같은 프로필 항목 또는 입력칸이 중복되어 검색하지 않았습니다.",
      );
      continue;
    }
    if (signal?.aborted || assertCurrent?.() === false) return true;
    if (beforeWrite) await beforeWrite(item);
    let profileCurrent = true;
    try {
      profileCurrent = !beforeMutation || (await beforeMutation());
    } catch {
      profileCurrent = false;
    }
    if (signal?.aborted || assertCurrent?.() === false || !profileCurrent) {
      for (let later = index; later < items.length; later++)
        results[later] = skipped(
          items[later]!.candidateId,
          "needs-verification",
          "STALE_TARGET",
          STALE,
        );
      return true;
    }
    if (item.analysis?.writePlan?.command !== "SEARCH_SELECTION") {
      if (writeOrdinary) {
        results[index] = writeOrdinary(item);
        onResult?.(item, results[index]!);
      }
      continue;
    }
    const direct = item.analysis.valueBinding;
    if (
      item.analysis.mappingStatus !== "LLM_SUGGESTED" ||
      direct?.type !== "DIRECT" ||
      !isAutofillProfileFieldKey(direct.profileFieldKey) ||
      assertCurrent?.() === false
    ) {
      results[index] = skipped(
        item.candidateId,
        "unsupported",
        "UNSUPPORTED_CONTROL",
        "검색 대상의 프로필 연결 또는 승인을 확인할 수 없어 중단했습니다.",
      );
      continue;
    }
    if (searchCount >= MAX_SEARCHES && !normalized(item.currentValue)) {
      results[index] = skipped(
        item.candidateId,
        "unsupported",
        "UNSUPPORTED_CONTROL",
        "검색 실행 횟수 상한에 도달해 중단했습니다.",
      );
      continue;
    }
    const lookup = registry.lookupField(item.candidateId);
    if (lookup.status !== "blocked" || lookup.reason !== "readonly") {
      results[index] = skipped(
        item.candidateId,
        "needs-verification",
        "STALE_TARGET",
        STALE,
      );
      continue;
    }
    const input = lookup.handle.elements[0];
    if (
      !input ||
      normalized(input.value) !== normalized(item.currentValue) ||
      (normalized(input.value) &&
        !(
          direct.profileFieldKey.endsWith(".schoolRegion")
            ? schoolRegionSearchValues(item.profileValue!)
            : [item.profileValue!]
        ).some((value) => normalized(input.value) === normalized(value)))
    ) {
      results[index] = skipped(
        item.candidateId,
        "needs-verification",
        "CONFLICT",
        CONFLICT,
      );
      continue;
    }
    const expectedValue = item.profileValue!;
    const expectedCurrentValue = item.currentValue;
    const expectedKey = direct.profileFieldKey;
    const expectedEntryId = item.profileEntryId;
    const expectedCandidateId = item.candidateId;
    const currentApproval = () =>
      assertCurrent?.() !== false &&
      item.candidateId === expectedCandidateId &&
      item.profileEntryId === expectedEntryId &&
      item.analysis?.candidateId === expectedCandidateId &&
      approvedCandidateIds.has(item.candidateId) &&
      isSelectableApproved(item) &&
      item.profileValue === expectedValue &&
      item.currentValue === expectedCurrentValue &&
      item.analysis?.mappingStatus === "LLM_SUGGESTED" &&
      item.analysis.writePlan?.command === "SEARCH_SELECTION" &&
      item.analysis.valueBinding?.type === "DIRECT" &&
      item.analysis.valueBinding.profileFieldKey === expectedKey;
    if (!normalized(input.value)) searchCount++;
    const result = await executeReadonlySearch({
      document: input.ownerDocument,
      registry,
      targetCandidateId: item.candidateId,
      canonicalFieldKey: expectedKey,
      expectedValue,
      expectedCurrentValue,
      decisionProvider: decisionSession,
      assertCurrent: currentApproval,
      beforeMutation,
      signal,
    });
    if (result.status === "selected" || result.status === "unchanged") {
      retainedSearches.set(item, {
        identity: result.identity,
        document: input.ownerDocument,
        acceptedValues: expectedKey.endsWith(".schoolRegion")
          ? schoolRegionSearchValues(expectedValue)
          : [expectedValue],
        assertCurrent: currentApproval,
      });
    }
    const failedResult:
      | Extract<
          ReadonlySearchExecutionResult,
          { status: "skipped" | "unsupported" | "failed" }
        >
      | undefined = "reason" in result ? result : undefined;
    results[index] =
      result.status === "selected"
        ? written(item.candidateId)
        : result.status === "unchanged"
          ? {
              candidateId: item.candidateId,
              status: "skipped",
              outcome: "unchanged",
              code: "ALREADY_MATCHED",
              reason: "이미 같은 값이 입력되어 변경하지 않았습니다.",
            }
          : skipped(
              item.candidateId,
              failedResult?.effect && failedResult.effect !== "none"
                ? "needs-verification"
                : failureOutcome(failedResult!.reason),
              failureCode(failedResult!.reason),
              searchFailureMessage(failedResult!.reason),
            );
    onResult?.(item, results[index]!);
    if (
      result.status !== "selected" &&
      result.status !== "unchanged" &&
      result.effect !== "none"
    ) {
      for (let later = index + 1; later < items.length; later++) {
        results[later] = skipped(
          items[later]!.candidateId,
          "needs-verification",
          "STALE_TARGET",
          "이전 검색을 확인할 수 없어 후속 자동 기입을 중단했습니다.",
        );
      }
      return true;
    }
  }
  return false;
}
