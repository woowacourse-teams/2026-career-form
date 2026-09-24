import { acquireDocumentRun } from "../interaction/document-run";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { skipped, type ApprovedWriteResult } from "./write-result";
import {
  executeApprovedSearchWrites,
  settledSearchSelectionResult,
} from "./search-executor";
import {
  executeApprovedWrites,
  settledGenericResult,
  type WriteResultListener,
} from "./native-executor";
export { executeApprovedWrites } from "./native-executor";
export type { WriteResultListener } from "./native-executor";
export type { ApprovedWriteResult } from "./write-result";

export async function executeApprovedWritesAfterPageSettles({
  items,
  approvedCandidateIds,
  registry,
  beforeWrite,
  onResult,
  interactionDecisionProvider,
  assertCurrent,
  beforeMutation,
  signal,
  document: suppliedDocument,
}: {
  items: readonly ReviewPlanItem[];
  approvedCandidateIds: ReadonlySet<string>;
  registry: CandidateRegistry;
  beforeWrite?: (item: ReviewPlanItem) => Promise<void>;
  onResult?: WriteResultListener;
  interactionDecisionProvider?: InteractionDecisionProvider;
  assertCurrent?: () => boolean;
  beforeMutation?: () => Promise<boolean>;
  signal?: AbortSignal;
  document?: Document;
}): Promise<ApprovedWriteResult[]> {
  const first = items[0] && registry.lookupField(items[0].candidateId);
  const document =
    suppliedDocument ??
    (first && "handle" in first
      ? first.handle.elements[0]?.ownerDocument
      : undefined);
  const release = document ? acquireDocumentRun(document) : undefined;
  if (document && !release)
    return items.map((item) =>
      skipped(
        item.candidateId,
        "needs-verification",
        "STALE_TARGET",
        "이미 자동 기입이 실행 중입니다.",
      ),
    );
  const url = document?.URL;
  const runCurrent = () =>
    !signal?.aborted && assertCurrent?.() !== false && document?.URL === url;
  try {
    const initial = executeApprovedWrites({
      items,
      approvedCandidateIds: new Set(),
      registry,
    });
    const halted = await executeApprovedSearchWrites({
      items,
      approvedCandidateIds,
      registry,
      interactionDecisionProvider,
      assertCurrent: runCurrent,
      beforeMutation,
      signal,
      writeOrdinary: (item) =>
        executeApprovedWrites({
          items: [item],
          approvedCandidateIds,
          registry,
        })[0]!,
      beforeWrite,
      onResult: (item, result) => onResult?.(item, result, registry),
      results: initial,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const adapterItems = items.filter(
      (item, index) =>
        !halted &&
        runCurrent() &&
        initial[index]?.status === "written" &&
        item.analysis?.mappingStatus === "ADAPTER_VERIFIED",
    );
    const retried: ApprovedWriteResult[] = [];
    for (const item of adapterItems) {
      if (
        !runCurrent() ||
        (beforeMutation && !(await beforeMutation())) ||
        !runCurrent()
      )
        break;
      retried.push(
        ...executeApprovedWrites({
          items: [item],
          approvedCandidateIds: new Set([item.candidateId]),
          registry,
        }),
      );
    }
    const adapterResults = new Map(
      retried.map((result) => [result.candidateId, result]),
    );
    let profileCurrent = true;
    try {
      profileCurrent = !beforeMutation || (await beforeMutation());
    } catch {
      profileCurrent = false;
    }
    const finalResults = initial.map((result, index) => {
      const item = items[index];
      if (
        !item ||
        (result.status !== "written" && result.outcome !== "unchanged")
      )
        return result;
      if (!profileCurrent || !runCurrent())
        return skipped(
          item.candidateId,
          "needs-verification",
          "STALE_TARGET",
          "실행 중 프로필 또는 지원서 상태가 변경되어 입력 결과를 확인해 주세요.",
        );
      if (item.analysis?.writePlan?.command === "SEARCH_SELECTION")
        return settledSearchSelectionResult(item, registry, result);
      return item.analysis?.mappingStatus === "ADAPTER_VERIFIED"
        ? (adapterResults.get(item.candidateId) ?? result)
        : settledGenericResult(item, registry);
    });
    if (runCurrent())
      finalResults.forEach((result, index) => {
        if (approvedCandidateIds.has(result.candidateId))
          onResult?.(items[index]!, result, registry);
      });
    return finalResults;
  } finally {
    release?.();
  }
}
