/**
 * 임시 개발용 자동 기입 진단 로그.
 *
 * 개발자 도구 Console에 수집 → 분석 → 리뷰 계획 → 기입 → 검색 단계별로
 * 값 원문과 실패 사유를 출력한다. 테스트 모드에서는 꺼지고,
 * `VITE_AUTOFILL_DEBUG=false`로 빌드하면 모든 출력이 꺼진다.
 * 릴리스 전 제거하거나 기본값을 끄도록 바꿔야 한다.
 */
import {
  createStructuralSignature,
  type CandidateRegistry,
} from "../dom/candidate-registry";
import type { CollectedSnapshot } from "../dom/collect";
import type { FieldCandidateHandle } from "../dom/types";
import type {
  FieldAnalysis,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../api/types";
import type { ReviewPlan, ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/write-result";

const PREFIX = "[CareerForm]";

let enabled =
  import.meta.env.MODE !== "test" &&
  import.meta.env.VITE_AUTOFILL_DEBUG !== "false";

export function isAutofillDebugEnabled(): boolean {
  return enabled;
}

/** 테스트에서만 사용한다. */
export function setAutofillDebugEnabled(value: boolean): void {
  enabled = value;
}

function group(title: string, body: () => void): void {
  if (!enabled) return;
  try {
    console.groupCollapsed(`${PREFIX} ${title}`);
    body();
  } catch (error) {
    console.warn(`${PREFIX} 진단 로그 출력 실패`, error);
  } finally {
    console.groupEnd();
  }
}

function optionLabel(
  handle: FieldCandidateHandle,
  element: Element,
): string | undefined {
  for (const [optionId, optionElement] of handle.optionElements) {
    if (optionElement === element)
      return handle.candidate.options?.find(
        (option) => option.optionId === optionId,
      )?.displayName;
  }
  return undefined;
}

/** 현재 페이지에 실제로 들어가 있는 값. */
export function pageValueOf(handle: FieldCandidateHandle): string {
  const first = handle.elements[0];
  if (
    first instanceof HTMLInputElement &&
    (first.type === "radio" || first.type === "checkbox")
  ) {
    const checked = handle.elements.filter(
      (element) => element instanceof HTMLInputElement && element.checked,
    );
    return (
      checked
        .map((element) => optionLabel(handle, element) ?? element.value)
        .join(", ") || "(선택 없음)"
    );
  }
  if (first instanceof HTMLSelectElement)
    return first.selectedOptions[0]?.textContent?.trim() ?? "";
  return first?.value ?? "";
}

/** lookupField 결과와, stale이면 그 이유를 사람이 읽을 수 있게 설명한다. */
export function describeFreshness(
  registry: CandidateRegistry,
  candidateId: string,
): { lookup: string; staleReason?: string } {
  const lookup = registry.lookupField(candidateId);
  const status =
    lookup.status === "blocked" ? `blocked:${lookup.reason}` : lookup.status;
  if (lookup.status !== "stale") return { lookup: status };
  const raw = registry.debugField(candidateId);
  if (!raw) return { lookup: status, staleReason: "등록되지 않은 후보" };
  const handle = raw.handle;
  const staleReason =
    handle.isCurrentContext?.() === false
      ? "반복 행 그룹/순번/개수가 수집 때와 다름 (isCurrentContext=false)"
      : handle.elements.some((element) => !element.isConnected)
        ? "입력 요소가 DOM에서 분리됨"
        : createStructuralSignature(handle.elements) !== handle.signature
          ? "요소 구조 signature(tag/type/id/name)가 바뀜"
          : "같은 반복 그룹의 행 요소가 DOM에서 분리됨";
  return { lookup: status, staleReason };
}

function labelOf(registry: CandidateRegistry, candidateId: string): string {
  return (
    registry.debugField(candidateId)?.handle.candidate.displayName ??
    "(라벨 없음)"
  );
}

function collectionRows(snapshot: CollectedSnapshot<FieldsAnalyzeRequest>) {
  const { registry } = snapshot;
  return snapshot.request.sections.flatMap((section) =>
    [
      ...section.fields.map((field) => ({ field, item: undefined })),
      ...(section.items ?? []).flatMap((item) =>
        item.fields.map((field) => ({ field, item })),
      ),
    ].map(({ field, item }) => {
      const raw = registry.debugField(field.candidateId);
      const handle = raw?.handle;
      const repeat = field.semanticContext?.repeat;
      return {
        candidateId: field.candidateId,
        section: section.displayName ?? section.sectionId,
        label: field.displayName ?? "(라벨 없음)",
        control: `${field.element}/${field.control}`,
        domId: field.domId ?? "",
        domName: field.domName ?? "",
        visibility: field.visibility,
        readonly: Boolean(field.readonly),
        disabled: Boolean(field.disabled),
        ...describeFreshness(registry, field.candidateId),
        blockedAtCollect: raw?.blockedReason ?? "",
        itemId: item?.itemId ?? "",
        itemGroupId: handle?.itemGroupId ?? item?.itemGroupId ?? "",
        itemIndex: handle?.itemIndex ?? "",
        fieldItemCount: registry.fieldItemCount(field.candidateId) ?? "",
        repeat: repeat
          ? `${repeat.groupId} #${repeat.rowIndex}/${repeat.rowCount}`
          : "",
        pageValue: handle ? pageValueOf(handle) : "",
        options:
          field.options?.map((option) => option.displayName).join(" | ") ?? "",
      };
    }),
  );
}

function analysisRow(field: FieldAnalysis, registry: CandidateRegistry) {
  const base = {
    candidateId: field.candidateId,
    label: labelOf(registry, field.candidateId),
    matchType: field.matchType,
    mappingStatus: field.mappingStatus,
    interactionStatus: field.interactionStatus,
  };
  if (field.matchType === "NO_MATCH")
    return { ...base, reasonCodes: field.reasonCodes.join(",") };
  const binding = field.valueBinding;
  return {
    ...base,
    autofillPolicy: field.autofillPolicy,
    command: field.writePlan?.command ?? "(writePlan 없음)",
    binding: binding
      ? `${binding.type}:${"profileFieldKey" in binding ? binding.profileFieldKey : ""}`
      : field.profileFieldKey
        ? `legacy:${field.profileFieldKey}`
        : "(없음)",
  };
}

/** 1~2단계: DOM 수집 결과와 백엔드 분석 응답. */
export function debugAnalysis(
  snapshot: CollectedSnapshot<FieldsAnalyzeRequest>,
  analysis: FieldsAnalyzeResponse,
): void {
  const rows = enabled ? collectionRows(snapshot) : [];
  group(`1. 필드 수집 (${rows.length}개)`, () => {
    console.table(rows);
    console.log("request", snapshot.request);
  });
  group(
    `2. 필드 분석 응답 (${analysis.mode}/${analysis.analysisStatus}, MATCH ${
      analysis.fields.filter((field) => field.matchType === "MATCH").length
    }/${analysis.fields.length})`,
    () => {
      if (analysis.blockCode) console.warn("blockCode", analysis.blockCode);
      if (analysis.warningCodes?.length)
        console.warn("warningCodes", analysis.warningCodes);
      console.table(
        analysis.fields.map((field) => analysisRow(field, snapshot.registry)),
      );
      console.log("response", analysis);
    },
  );
}

function planRow(item: ReviewPlanItem) {
  return {
    candidateId: item.candidateId,
    label: item.fieldLabel,
    status: item.status,
    selected: item.selected,
    disabled: item.disabled,
    command: item.analysis?.writePlan?.command ?? "",
    mapping: item.analysis?.mappingStatus ?? "",
    profileFieldKey: item.profileFieldKey ?? "",
    itemIndex: item.itemIndex ?? "",
    currentValue: item.currentValue,
    profileValue: item.profileValue ?? "",
    reason: item.reason,
  };
}

/** 3단계: 리뷰 계획. unavailable 항목은 여기서 막혀 실행기로 가지 않는다. */
export function debugReviewPlan(plan: ReviewPlan): void {
  const unavailable = plan.items.filter(
    (item) => item.status === "unavailable",
  );
  group(
    `3. 리뷰 계획 (${plan.status}, 입력 불가 ${unavailable.length}/${plan.items.length})`,
    () => {
      console.table(plan.items.map(planRow));
      if (unavailable.length) {
        console.warn("입력 불가 항목과 사유");
        console.table(
          unavailable.map((item) => ({
            candidateId: item.candidateId,
            label: item.fieldLabel,
            command: item.analysis?.writePlan?.command ?? "",
            reason: item.reason,
          })),
        );
      }
    },
  );
}

function resultColumns(prefix: string, result?: ApprovedWriteResult) {
  if (!result) return { [`${prefix}status`]: "(결과 없음)" };
  return result.status === "written"
    ? { [`${prefix}status`]: "written" }
    : {
        [`${prefix}status`]: `skipped${result.outcome ? `/${result.outcome}` : ""}`,
        [`${prefix}code`]: result.code ?? "",
        [`${prefix}failureCode`]: result.failureCode ?? "",
        [`${prefix}reason`]: result.reason,
      };
}

/** 4단계: 기입 실행. 실행 직후 결과와 안정화 후 최종 결과를 함께 보여 준다. */
export function debugWriteRun(
  items: readonly ReviewPlanItem[],
  approvedCandidateIds: ReadonlySet<string>,
  registry: CandidateRegistry,
  executed: readonly ApprovedWriteResult[] | undefined,
  finalResults: ApprovedWriteResult[],
): ApprovedWriteResult[] {
  if (!enabled) return finalResults;
  const approved = items.filter((item) =>
    approvedCandidateIds.has(item.candidateId),
  );
  const failed = finalResults.filter(
    (result) =>
      approvedCandidateIds.has(result.candidateId) &&
      result.status !== "written",
  );
  group(
    `4. 기입 실행 (승인 ${approved.length}, 성공 ${
      finalResults.filter((result) => result.status === "written").length
    }, 실패/보류 ${failed.length})`,
    () => {
      console.table(
        items.map((item, index) => {
          const raw = registry.debugField(item.candidateId);
          return {
            candidateId: item.candidateId,
            label: item.fieldLabel,
            approved: approvedCandidateIds.has(item.candidateId),
            command: item.analysis?.writePlan?.command ?? "",
            value: item.profileValue ?? "",
            before: item.currentValue,
            ...(executed ? resultColumns("run.", executed[index]) : {}),
            ...resultColumns("final.", finalResults[index]),
            pageValueNow: raw ? pageValueOf(raw.handle) : "",
            ...describeFreshness(registry, item.candidateId),
          };
        }),
      );
    },
  );
  return finalResults;
}

/** 5단계: 검색 실행기 내부 단계. */
export function debugSearchStep(
  candidateId: string,
  step: string,
  detail?: unknown,
): void {
  if (!enabled) return;
  if (detail === undefined)
    console.debug(`${PREFIX} 검색 ${candidateId}: ${step}`);
  else console.debug(`${PREFIX} 검색 ${candidateId}: ${step}`, detail);
}

export function debugWarn(message: string, detail?: unknown): void {
  if (!enabled) return;
  console.warn(
    `${PREFIX} ${message}`,
    ...(detail === undefined ? [] : [detail]),
  );
}

export function debugSearchFailure(
  candidateId: string,
  lastStep: string,
  reason: string,
  effect: string,
  error: unknown,
): void {
  if (!enabled) return;
  console.warn(
    `${PREFIX} 검색 실패 ${candidateId}: reason=${reason}, 마지막 단계="${lastStep}", effect=${effect}`,
    error,
  );
}

/** 백그라운드 API 메시지 요청/응답. */
export function debugApiMessage(
  message: unknown,
  outcome: { envelope?: unknown; error?: unknown },
): void {
  if (!enabled) return;
  const type =
    message && typeof message === "object" && "type" in message
      ? String(message.type)
      : "unknown";
  const log = outcome.error ? console.warn : console.debug;
  log(`${PREFIX} API ${type}`, { message, ...outcome });
}
