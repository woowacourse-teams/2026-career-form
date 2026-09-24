import type { InteractionDecisionProvider } from "../api/interaction-types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import { executeCalendarSelection } from "../interaction/calendar-executor";
import { revalidateCalendarApproval } from "../review/calendar-approval";
import type { ReviewPlanItem } from "../review/review-plan";
import { skipped, written, type ApprovedWriteResult } from "./write-result";

export type CalendarWriteEffect = "continue" | "stop";

export type ApprovedCalendarWriteExecution = ApprovedWriteResult & {
  effect: CalendarWriteEffect;
};

export interface ExecuteApprovedCalendarWriteArgs {
  item: ReviewPlanItem;
  registry: CandidateRegistry;
  interactionDecisionProvider?: InteractionDecisionProvider;
  assertCurrent?: () => boolean;
  beforeMutation?: () => Promise<boolean>;
  signal?: AbortSignal;
}

const STALE = "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.";
const CONFLICT = "입력 직전 지원서에 다른 값이 있어 기존 값을 보존했습니다.";

function stop(
  candidateId: string,
  code: NonNullable<
    Extract<ApprovedWriteResult, { status: "skipped" }>["code"]
  >,
  reason: string,
): ApprovedCalendarWriteExecution {
  return {
    ...skipped(candidateId, "needs-verification", code, reason),
    effect: "stop",
  };
}

function current(args: ExecuteApprovedCalendarWriteArgs): boolean {
  return !args.signal?.aborted && args.assertCurrent?.() !== false;
}

function approvedTarget(
  item: ReviewPlanItem,
  registry: CandidateRegistry,
): HTMLInputElement | undefined {
  const approval = item.calendarApproval;
  const direct = item.analysis?.valueBinding;
  if (
    !approval ||
    approval.unit !== "month" ||
    item.analysis?.candidateId !== item.candidateId ||
    item.analysis.writePlan?.command !== "SELECT_DATE" ||
    direct?.type !== "DIRECT" ||
    !item.profileValue ||
    item.profileValue !== approval.targetYearMonth ||
    item.profileFieldKey !== approval.profileFieldKey ||
    item.profileEntryId !== approval.profileEntryId ||
    item.itemIndex !== approval.itemIndex
  )
    return undefined;
  if (direct.profileFieldKey !== approval.profileFieldKey) return undefined;
  const lookup = registry.lookupField(item.candidateId);
  if (
    lookup.status !== "blocked" ||
    lookup.reason !== "readonly" ||
    lookup.handle.kind !== "field" ||
    lookup.handle.elements.length !== 1 ||
    lookup.handle.elements[0] !== approval.target ||
    !(approval.target instanceof HTMLInputElement)
  )
    return undefined;
  return approval.target;
}

async function mayMutate(
  args: ExecuteApprovedCalendarWriteArgs,
): Promise<boolean> {
  if (!current(args)) return false;
  try {
    if (args.beforeMutation && !(await args.beforeMutation())) return false;
  } catch {
    return false;
  }
  return current(args);
}

export async function executeApprovedCalendarWrite(
  args: ExecuteApprovedCalendarWriteArgs,
): Promise<ApprovedCalendarWriteExecution> {
  const { item } = args;
  if (
    !item.selected ||
    item.disabled ||
    item.status === "unavailable" ||
    (item.status === "sensitive" && !item.revealed)
  )
    return stop(
      item.candidateId,
      "NOT_APPROVED",
      "달력 입력이 승인되지 않았습니다.",
    );

  const target = approvedTarget(item, args.registry);
  if (!target)
    return stop(
      item.candidateId,
      "NOT_APPROVED",
      "달력 대상, 프로필 연결 또는 별도 승인을 확인할 수 없습니다.",
    );

  const approval = item.calendarApproval!;
  if (revalidateCalendarApproval(approval).status !== "valid")
    return stop(item.candidateId, "STALE_TARGET", STALE);
  if (!current(args)) return stop(item.candidateId, "STALE_TARGET", STALE);

  if (target.value) {
    if (target.value === approval.targetYearMonth) {
      return {
        candidateId: item.candidateId,
        status: "skipped",
        outcome: "unchanged",
        code: "ALREADY_MATCHED",
        reason: "이미 같은 값이 입력되어 변경하지 않았습니다.",
        effect: "continue",
      };
    }
    return stop(item.candidateId, "CONFLICT", CONFLICT);
  }

  if (!(await mayMutate(args)))
    return stop(item.candidateId, "STALE_TARGET", STALE);
  if (revalidateCalendarApproval(approval).status !== "valid")
    return stop(item.candidateId, "STALE_TARGET", STALE);

  const decisionProvider = args.interactionDecisionProvider
    ? async (request: Parameters<InteractionDecisionProvider>[0]) => {
        const response = await args.interactionDecisionProvider!(request);
        if (
          !(await mayMutate(args)) ||
          revalidateCalendarApproval(approval).status !== "valid"
        ) {
          return {
            schemaVersion: 2 as const,
            snapshotId: request.snapshotId,
            status: "LLM_UNAVAILABLE" as const,
            mode: null,
            decisions: [],
          };
        }
        return response;
      }
    : undefined;

  try {
    const execution = await executeCalendarSelection({
      target,
      targetYearMonth: approval.targetYearMonth,
      interactionDecisionProvider: decisionProvider,
      canonicalFieldKey: approval.profileFieldKey ?? "calendar-month",
    });
    if (execution.status !== "completed")
      return stop(
        item.candidateId,
        "RETAINED_VALUE_UNCONFIRMED",
        "달력 선택 결과를 확인할 수 없어 후속 자동 기입을 중단했습니다.",
      );
  } catch {
    return stop(
      item.candidateId,
      "EXECUTION_FAILED",
      "달력 선택 중 페이지 동작 오류가 발생했습니다.",
    );
  }

  if (
    !current(args) ||
    revalidateCalendarApproval(approval).status !== "valid" ||
    target.value !== approval.targetYearMonth
  )
    return stop(
      item.candidateId,
      "RETAINED_VALUE_UNCONFIRMED",
      "달력 선택 후 값 또는 대상 상태를 확인할 수 없어 후속 자동 기입을 중단했습니다.",
    );
  return { ...written(item.candidateId), effect: "continue" };
}
