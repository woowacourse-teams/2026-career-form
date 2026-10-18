import { ownedBasicControl } from "../adapters/hplace/basic-controls";
import {
  writeBasic,
  basicValue,
  basicTarget,
  basicDateOrder,
} from "../adapters/hplace/basic-write";
import {
  detailAddressMatches,
  writeDetail,
} from "../adapters/hplace/detail-write";
import { ownedDetailControl } from "../adapters/hplace/detail";
import type { AddressIdentity } from "../address/match";
import { resolveDocumentCompany } from "../adapters/company";
import { runtimeRules } from "../policy/runtime-rules";
import { startLocalTiming } from "../debug/local-timing";
import { executionPolicy } from "../workflow/execution-policy";
import { getWriteAdapter } from "../adapters/write";
import { resultFieldState } from "../workflow/result-field-state";
import { acquireDocumentRun } from "../interaction/document-run";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import type { FieldCandidateHandle } from "../dom/types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { SearchFollowUpControl } from "../interaction/search-follow-up";
import type { ReviewPlanItem } from "../review/review-plan";
import { componentGpaSafe } from "../policy/components/gpa";
import { matchesResultValue } from "../workflow/result-value-match";
import { executeApprovedCalendarWrite } from "./calendar-executor";
import { executeButtonDropdownWrite } from "./button-dropdown-executor";
import { skipped, written, type ApprovedWriteResult } from "./write-result";
import { debugWriteRun } from "../debug/autofill-debug";
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

function legacyValueRetained(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  initialValue: string | undefined,
  address?: AddressIdentity,
): boolean {
  const basic = ownedBasicControl(handle);
  const target = basic
    ? basicTarget(basic.key, item.profileValue ?? "")
    : undefined;
  return (
    (ownedDetailControl(handle)?.key !== "detailAddress" ||
      detailAddressMatches(handle, address)) &&
    item.profileValue === initialValue &&
    (basic
      ? target !== undefined &&
        basicDateOrder(handle, target) &&
        basicValue(handle) === target
      : matchesResultValue(
          item,
          handle.elements[0]?.value ?? "",
          item.profileValue ?? "",
          handle,
        ))
  );
}

/** Verify retained state without dispatching events or invoking a writer. */
function settledAdapterResult(
  item: ReviewPlanItem,
  initial: ApprovedWriteResult,
  registry: CandidateRegistry,
): ApprovedWriteResult {
  const lookup = registry.lookupField(item.candidateId);
  const handle =
    lookup.status === "ready" || lookup.status === "blocked"
      ? lookup.handle
      : undefined;
  const element = handle?.elements[0] ?? handle?.customElements?.[0];
  if (!handle || !element?.isConnected || handle.isCurrentContext?.() === false)
    return skipped(
      item.candidateId,
      "needs-verification",
      "STALE_TARGET",
      "페이지가 변경되어 입력 결과를 확인할 수 없습니다.",
    );
  const live = resultFieldState(
    registry,
    element.ownerDocument,
    item.candidateId,
  );
  const verified = getWriteAdapter(element.ownerDocument).verifyRetained?.(
    handle,
    item,
  );
  return live?.visible &&
    (verified ??
      matchesResultValue(item, live.value, item.profileValue ?? "", handle))
    ? initial
    : skipped(
        item.candidateId,
        "needs-verification",
        "RETAINED_VALUE_UNCONFIRMED",
        "입력한 값이 유지되는지 확인하지 못했습니다.",
      );
}

function settledComponentResult(
  item: ReviewPlanItem,
  initial: ApprovedWriteResult,
  registry: CandidateRegistry | undefined,
): ApprovedWriteResult {
  const lookup = registry?.lookupField(item.candidateId);
  if (!registry || lookup?.status !== "ready")
    return skipped(
      item.candidateId,
      "needs-verification",
      "STALE_TARGET",
      "페이지가 변경되어 입력 결과를 확인할 수 없습니다.",
    );
  const handle = lookup.handle;
  if (item.analysis?.writePlan?.command !== "SET_TEXT")
    return settledGenericResult(item, registry);
  const input = handle.elements[0];
  return (input instanceof HTMLInputElement ||
    input instanceof HTMLTextAreaElement) &&
    handle.elements.length === 1 &&
    matchesResultValue(item, input.value, item.profileValue ?? "", handle) &&
    componentGpaSafe(handle, item)
    ? initial
    : skipped(
        item.candidateId,
        "needs-verification",
        "RETAINED_VALUE_UNCONFIRMED",
        "입력한 값이 유지되는지 확인하지 못했습니다.",
      );
}

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
  calendarOnly = false,
  settledRegistry,
  currentOrdinaryRegistry,
  onSearchFollowUp,
  hplaceAddress,
  followUpHaltScope,
}: {
  items: readonly ReviewPlanItem[];
  approvedCandidateIds: ReadonlySet<string>;
  registry: CandidateRegistry;
  beforeWrite?: (item: ReviewPlanItem) => Promise<void>;
  /** Fresh, structurally verified Component forms targets for each ordinary write. */
  currentOrdinaryRegistry?: (
    item: ReviewPlanItem,
  ) => Promise<CandidateRegistry>;
  onResult?: WriteResultListener;
  interactionDecisionProvider?: InteractionDecisionProvider;
  assertCurrent?: () => boolean;
  beforeMutation?: () => Promise<boolean>;
  signal?: AbortSignal;
  document?: Document;
  calendarOnly?: boolean;
  /** Local profile identity only; never included in analysis requests. */
  hplaceAddress?: AddressIdentity;
  /** Component-engine readback registry, with the original candidate IDs safely rebound. */
  settledRegistry?: () =>
    CandidateRegistry | undefined | Promise<CandidateRegistry | undefined>;
  onSearchFollowUp?: (
    item: ReviewPlanItem,
    controls: readonly SearchFollowUpControl[],
  ) => void;
  /** Opt-in narrower hold after an unconfirmed search failure; default holds the rest. */
  followUpHaltScope?: "all" | "row";
}): Promise<ApprovedWriteResult[]> {
  const finishTiming = startLocalTiming("write-batch", {
    count: approvedCandidateIds.size,
  });
  const first = items
    .map((item) => registry.lookupField(item.candidateId))
    .find((lookup) => "handle" in lookup);
  const document =
    suppliedDocument ??
    (first && "handle" in first
      ? (first.handle.elements[0] ?? first.handle.customElements?.[0])
          ?.ownerDocument
      : undefined);
  const companyId = document ? resolveDocumentCompany(document) : "generic";
  const componentWorkflow = document
    ? executionPolicy(document)?.componentPolicy?.workflow
    : undefined;
  const runtimeWorkflow = document
    ? runtimeRules(document)?.components?.workflow
    : undefined;
  const release = document ? acquireDocumentRun(document) : undefined;
  if (document && !release)
    return debugWriteRun(
      items,
      approvedCandidateIds,
      registry,
      undefined,
      items.map((item) =>
        skipped(
          item.candidateId,
          "needs-verification",
          "STALE_TARGET",
          "이미 자동 기입이 실행 중입니다.",
        ),
      ),
    );
  const initialValues = items.map((item) => item.profileValue);
  const url = document?.URL;
  const nativeDigest =
    document && executionPolicy(document)?.browserPolicy?.schemaVersion === 2
      ? JSON.stringify(executionPolicy(document)?.browserPolicy)
      : undefined;
  const runCurrent = () =>
    !signal?.aborted &&
    assertCurrent?.() !== false &&
    document?.URL === url &&
    (nativeDigest === undefined ||
      JSON.stringify(executionPolicy(document!)?.browserPolicy) ===
        nativeDigest) &&
    (!document || resolveDocumentCompany(document) !== "hplace");
  try {
    if (companyId === "hplace" && !calendarOnly) {
      const results: ApprovedWriteResult[] = [];
      const seen = new Set<string>();
      const current = () =>
        !signal?.aborted &&
        assertCurrent?.() !== false &&
        document?.URL === url &&
        resolveDocumentCompany(document!) === "hplace";
      for (const item of items) {
        if (beforeWrite) await beforeWrite(item);
        const lookup = registry.lookupField(item.candidateId);
        const success =
          approvedCandidateIds.has(item.candidateId) &&
          !seen.has(item.candidateId) &&
          lookup.status === "ready" &&
          (ownedBasicControl(lookup.handle)
            ? await writeBasic(lookup.handle, item, current, beforeMutation)
            : await writeDetail(
                lookup.handle,
                item,
                current,
                beforeMutation,
                hplaceAddress,
              ));
        seen.add(item.candidateId);
        const result = success
          ? written(item.candidateId)
          : skipped(
              item.candidateId,
              "needs-verification",
              "REVIEW_UNAVAILABLE",
              "검증된 상세 지원서 필드만 입력할 수 있습니다.",
            );
        results.push(result);
      }
      const profileRetained = beforeMutation ? await beforeMutation() : true;
      return results.map((result, index) => {
        const item = items[index];
        const lookup = registry.lookupField(item.candidateId);
        const retained =
          profileRetained &&
          current() &&
          lookup.status === "ready" &&
          legacyValueRetained(
            lookup.handle,
            item,
            initialValues[index],
            hplaceAddress,
          );
        const finalResult =
          result.status === "written" && !retained
            ? skipped(
                item.candidateId,
                "needs-verification",
                "RETAINED_VALUE_UNCONFIRMED",
                "입력한 값이 유지되는지 확인하지 못했습니다.",
              )
            : result;
        if (current()) onResult?.(item, finalResult, registry);
        return finalResult;
      });
    }
    if (calendarOnly) {
      const calendarResults: ApprovedWriteResult[] = [];
      let halted = false;
      for (const item of items) {
        if (
          halted ||
          item.analysis?.writePlan?.command !== "SELECT_DATE" ||
          !approvedCandidateIds.has(item.candidateId)
        ) {
          calendarResults.push(
            skipped(
              item.candidateId,
              "needs-verification",
              halted ? "STALE_TARGET" : "NOT_APPROVED",
              halted
                ? "이전 달력 선택 결과를 확인할 수 없어 후속 입력을 중단했습니다."
                : "선택한 달력 항목만 별도로 실행할 수 있습니다.",
            ),
          );
          continue;
        }
        if (beforeWrite) await beforeWrite(item);
        if (!runCurrent()) {
          const result = skipped(
            item.candidateId,
            "needs-verification",
            "STALE_TARGET",
            "실행 중 지원서 상태가 변경되어 후속 입력을 중단했습니다.",
          );
          calendarResults.push(result);
          halted = true;
          continue;
        }
        const { effect, ...result } = await executeApprovedCalendarWrite({
          item,
          registry,
          interactionDecisionProvider,
          assertCurrent: runCurrent,
          beforeMutation,
          signal,
        });
        calendarResults.push(result);
        if (runCurrent()) onResult?.(item, result, registry);
        if (effect === "stop") halted = true;
      }
      return debugWriteRun(
        items,
        approvedCandidateIds,
        registry,
        undefined,
        calendarResults,
      );
    }
    const initial = executeApprovedWrites({
      items,
      approvedCandidateIds: new Set(),
      registry,
    });
    let completionFailed = false;
    let pendingCompletion:
      { item: ReviewPlanItem; result: ApprovedWriteResult } | undefined;
    const settlePendingCompletion = async () => {
      const pending = pendingCompletion;
      pendingCompletion = undefined;
      if (!pending || !document) return;
      let settled = false;
      let failureMessage = "입력 후 완료 조건을 확인하지 못했습니다.";
      try {
        const lookup = registry.lookupField(pending.item.candidateId);
        const hook =
          lookup.status === "ready" || lookup.status === "blocked"
            ? getWriteAdapter(document).completion?.(
                lookup.handle,
                pending.item,
              )
            : undefined;
        if (hook) failureMessage = hook.failureMessage;
        settled = !!hook && (await hook.settle(runCurrent, beforeMutation));
      } catch {
        /* Completion failure is recorded against its owning field. */
      }
      if (!settled) {
        completionFailed = true;
        const index = items.indexOf(pending.item);
        initial[index] = skipped(
          pending.item.candidateId,
          "needs-verification",
          "RETAINED_VALUE_UNCONFIRMED",
          failureMessage,
        );
      }
    };
    const halted = await executeApprovedSearchWrites({
      items,
      approvedCandidateIds,
      registry,
      interactionDecisionProvider,
      assertCurrent: () => runCurrent() && !completionFailed,
      beforeMutation,
      signal,
      writeOrdinary: async (item) => {
        if (
          componentWorkflow?.rebindReplacedControls &&
          currentOrdinaryRegistry
        ) {
          registry = await currentOrdinaryRegistry(item);
          if (!runCurrent())
            return {
              result: skipped(
                item.candidateId,
                "needs-verification",
                "STALE_TARGET",
                "입력 대상이 변경되었습니다.",
              ),
              effect: "stop",
            };
        }
        const lookup = registry.lookupField(item.candidateId);
        if (lookup.status === "ready" && lookup.handle.owner === "legacy") {
          const success = ownedBasicControl(lookup.handle)
            ? await writeBasic(lookup.handle, item, runCurrent, beforeMutation)
            : await writeDetail(
                lookup.handle,
                item,
                runCurrent,
                beforeMutation,
                hplaceAddress,
              );
          return {
            result: success
              ? written(item.candidateId)
              : skipped(
                  item.candidateId,
                  "needs-verification",
                  "REVIEW_UNAVAILABLE",
                  "검증된 기존 필드만 입력할 수 있습니다.",
                ),
            effect: "continue",
          };
        }
        if (lookup.status === "ready" && lookup.handle.buttonDropdown)
          return {
            result: await executeButtonDropdownWrite({
              item,
              registry,
              assertCurrent: runCurrent,
              beforeMutation,
              signal,
            }),
            effect: "continue",
          };
        if (item.analysis?.writePlan?.command === "SELECT_DATE") {
          const { effect, ...result } = await executeApprovedCalendarWrite({
            item,
            registry,
            interactionDecisionProvider,
            assertCurrent: runCurrent,
            beforeMutation,
            signal,
          });
          return { result, effect };
        }
        const result = executeApprovedWrites({
          items: [item],
          approvedCandidateIds,
          registry,
        })[0]!;
        const completionLookup = registry.lookupField(item.candidateId);
        if (
          document &&
          result.status === "written" &&
          (completionLookup.status === "ready" ||
            completionLookup.status === "blocked") &&
          getWriteAdapter(document).completion?.(completionLookup.handle, item)
        )
          pendingCompletion = { item, result };
        return { result, effect: "continue" };
      },
      beforeWrite: async (item) => {
        // Complete the previous control before a subsequent write changes focus.
        await settlePendingCompletion();
        if (!completionFailed && beforeWrite) await beforeWrite(item);
      },
      onResult: (item, result) => onResult?.(item, result, registry),
      results: initial,
      onSearchFollowUp,
      ...(followUpHaltScope ? { followUpHaltScope } : {}),
    });
    await settlePendingCompletion();
    const executedResults = [...initial];
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    let componentRegistry: CandidateRegistry | undefined = registry;
    if (componentWorkflow?.rebindReplacedControls && settledRegistry) {
      try {
        componentRegistry = await settledRegistry();
      } catch {
        componentRegistry = undefined;
      }
    }
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
      const legacy = registry.lookupField(item.candidateId);
      if ("handle" in legacy && legacy.handle.owner === "legacy") {
        const lookup = legacy;
        const retained =
          lookup.status === "ready" &&
          legacyValueRetained(
            lookup.handle,
            item,
            initialValues[index],
            hplaceAddress,
          );
        return retained
          ? result
          : skipped(
              item.candidateId,
              "needs-verification",
              "RETAINED_VALUE_UNCONFIRMED",
              "입력한 값이 유지되는지 확인하지 못했습니다.",
            );
      }
      if (item.analysis?.writePlan?.command === "SEARCH_SELECTION")
        return settledSearchSelectionResult(item, registry, result);
      if (item.analysis?.writePlan?.command === "SELECT_DATE") return result;
      if (item.catalogMatch) {
        const verified = settledGenericResult(
          item,
          componentRegistry ?? registry,
        );
        return verified.status === "written" ? result : verified;
      }
      if (
        runtimeWorkflow?.verifySettledValues &&
        item.analysis?.mappingStatus === "ADAPTER_VERIFIED"
      )
        return result.status === "written"
          ? settledComponentResult(item, result, componentRegistry)
          : result;
      return item.analysis?.mappingStatus === "ADAPTER_VERIFIED"
        ? settledAdapterResult(item, result, registry)
        : settledGenericResult(item, registry);
    });
    if (runCurrent())
      finalResults.forEach((result, index) => {
        if (approvedCandidateIds.has(result.candidateId))
          onResult?.(items[index]!, result, registry);
      });
    return debugWriteRun(
      items,
      approvedCandidateIds,
      registry,
      executedResults,
      finalResults,
    );
  } finally {
    finishTiming();
    release?.();
  }
}
