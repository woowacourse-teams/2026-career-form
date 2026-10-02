import { resolveDocumentCompany } from "../adapters/company";
import {
  closeGreetingEmailPopup,
  waitForGreetingEmailAcceptance,
} from "../interaction/greeting-email-close-bridge";
import { acquireDocumentRun } from "../interaction/document-run";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { SearchFollowUpControl } from "../interaction/search-follow-up";
import type { ReviewPlanItem } from "../review/review-plan";
import { greetingGpaSafe } from "../adapters/greeting/gpa";
import { greetingSyntheticDomName } from "../adapters/greeting/collection";
import { matchesResultValue } from "../workflow/result-value-match";
import { executeApprovedCalendarWrite } from "./calendar-executor";
import { executeButtonDropdownWrite } from "./button-dropdown-executor";
import { skipped, type ApprovedWriteResult } from "./write-result";
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

function settledGreetingResult(
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
  const veteranName =
    "militaryServicePreferentialEmploymentStatus.veteranStatus.veteransRegistrationNumber";
  const retainedVeteranNumber =
    handle.candidate.domName === veteranName &&
    input instanceof HTMLInputElement &&
    input.name === veteranName &&
    /^\d{2}-?\d{6}$/.test(input.value) &&
    /^\d{2}-?\d{6}$/.test(item.profileValue ?? "") &&
    input.value.replace("-", "") === item.profileValue?.replace("-", "");
  const phoneName = "basicInformation.phoneNumber.nationalNumber";
  const retainedPhone =
    handle.candidate.domName === phoneName &&
    item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
    item.analysis.valueBinding?.type === "DIRECT" &&
    item.analysis.valueBinding.profileFieldKey ===
      "contact.contact.phoneNumber" &&
    input instanceof HTMLInputElement &&
    input.name === phoneName &&
    matchesResultValue(item, input.value, item.profileValue ?? "", handle);
  return (input instanceof HTMLInputElement ||
    input instanceof HTMLTextAreaElement) &&
    handle.elements.length === 1 &&
    (input.value === item.profileValue ||
      retainedVeteranNumber ||
      retainedPhone) &&
    greetingGpaSafe(handle, item)
    ? initial
    : skipped(
        item.candidateId,
        "needs-verification",
        "RETAINED_VALUE_UNCONFIRMED",
        "입력한 값이 유지되는지 확인하지 못했습니다.",
      );
}

async function closeGreetingEmailSuggestions(
  document: Document,
  items: readonly ReviewPlanItem[],
  results: readonly ApprovedWriteResult[],
  registry: CandidateRegistry,
  current: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  const index = items.findIndex(
    (item) =>
      item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
      item.analysis?.valueBinding?.type === "DIRECT" &&
      item.analysis.valueBinding.profileFieldKey === "contact.contact.email",
  );
  if (index < 0 || results[index]?.status !== "written") return true;
  const item = items[index]!;
  const lookup = registry.lookupField(item.candidateId);
  if (lookup.status !== "ready" && lookup.status !== "blocked") return false;
  const input = lookup.handle.elements[0];
  if (!(input instanceof HTMLInputElement)) return false;
  const valid = () =>
    current() &&
    input.ownerDocument === document &&
    input.isConnected &&
    greetingSyntheticDomName(input) === "basicInformation.email" &&
    input.value === item.profileValue;
  if (!valid()) return false;
  if (!(await waitForGreetingEmailAcceptance(input, valid)) || !valid())
    return false;
  if (input.getAttribute("aria-expanded") !== "true") return true;
  if (beforeMutation && !(await beforeMutation())) return false;
  if (!valid()) return false;
  return closeGreetingEmailPopup(input, valid);
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
  onSearchFollowUp,
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
  calendarOnly?: boolean;
  /** Greeting-only readback registry, with the original candidate IDs safely rebound. */
  settledRegistry?: () =>
    CandidateRegistry | undefined | Promise<CandidateRegistry | undefined>;
  onSearchFollowUp?: (
    item: ReviewPlanItem,
    controls: readonly SearchFollowUpControl[],
  ) => void;
}): Promise<ApprovedWriteResult[]> {
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
  const url = document?.URL;
  const runCurrent = () =>
    !signal?.aborted && assertCurrent?.() !== false && document?.URL === url;
  try {
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
    let emailSettlementFailed = false;
    let pendingEmail:
      { item: ReviewPlanItem; result: ApprovedWriteResult } | undefined;
    const settlePendingEmail = async () => {
      const pending = pendingEmail;
      pendingEmail = undefined;
      if (!pending || !document) return;
      let settled = false;
      try {
        settled = await closeGreetingEmailSuggestions(
          document,
          [pending.item],
          [pending.result],
          registry,
          runCurrent,
          beforeMutation,
        );
      } catch {
        /* An unconfirmed email must not invalidate unrelated writes. */
      }
      if (!settled) {
        emailSettlementFailed = true;
        const index = items.indexOf(pending.item);
        initial[index] = skipped(
          pending.item.candidateId,
          "needs-verification",
          "RETAINED_VALUE_UNCONFIRMED",
          "이메일 입력 상태 또는 제안 목록 닫힘을 확인하지 못했습니다.",
        );
      }
    };
    const halted = await executeApprovedSearchWrites({
      items,
      approvedCandidateIds,
      registry,
      interactionDecisionProvider,
      assertCurrent: () => runCurrent() && !emailSettlementFailed,
      beforeMutation,
      signal,
      writeOrdinary: async (item) => {
        const lookup = registry.lookupField(item.candidateId);
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
        if (
          companyId === "greeting" &&
          result.status === "written" &&
          item.analysis?.valueBinding?.type === "DIRECT" &&
          item.analysis.valueBinding.profileFieldKey === "contact.contact.email"
        )
          pendingEmail = { item, result };
        return { result, effect: "continue" };
      },
      beforeWrite: async (item) => {
        // Finish email before a subsequent driver can blur or Escape its popup.
        await settlePendingEmail();
        if (!emailSettlementFailed && beforeWrite) await beforeWrite(item);
      },
      onResult: (item, result) => onResult?.(item, result, registry),
      results: initial,
      onSearchFollowUp,
    });
    await settlePendingEmail();
    const executedResults = [...initial];
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    let greetingRegistry: CandidateRegistry | undefined = registry;
    if (companyId === "greeting" && settledRegistry) {
      try {
        greetingRegistry = await settledRegistry();
      } catch {
        greetingRegistry = undefined;
      }
    }
    const adapterItems = items.filter(
      (item, index) =>
        companyId !== "greeting" &&
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
      if (item.analysis?.writePlan?.command === "SELECT_DATE") return result;
      if (
        companyId === "greeting" &&
        item.analysis?.mappingStatus === "ADAPTER_VERIFIED"
      )
        return result.status === "written"
          ? settledGreetingResult(item, result, greetingRegistry)
          : result;
      return item.analysis?.mappingStatus === "ADAPTER_VERIFIED"
        ? (adapterResults.get(item.candidateId) ?? result)
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
    release?.();
  }
}
