import type { PreparationPlan } from "../api/types";
import type { CandidateRegistry } from "../dom/candidate-registry";

export interface PreparationSnapshot {
  registry: CandidateRegistry;
  isTargetSectionVisible(targetSectionId: string): boolean;
  countRepeatableGroups?(
    plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
  ): number | undefined;
}

export interface ApprovedPreparationPlan {
  plan: PreparationPlan;
  approved: boolean;
  /**
   * Browser-local count only. The profile itself and its values never cross
   * this executor boundary.
   */
  localItemCount?: number;
}

export interface PreparationExecutionOptions {
  approvedPlans: readonly ApprovedPreparationPlan[];
  initialSnapshot: PreparationSnapshot;
  refreshSnapshot: () => Promise<PreparationSnapshot>;
  countRepeatableGroups: (
    snapshot: PreparationSnapshot,
    plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
  ) => number;
}

export type PreparationFailureReason =
  | "action-not-executable"
  | "action-not-reidentified"
  | "invalid-local-item-count"
  | "invalid-group-count"
  | "group-count-not-incremented"
  | "refresh-failed"
  | "target-not-visible";

export type PreparationExecutionResult =
  | {
      status: "completed";
      mayCollectFieldsSnapshot: true;
      executedPlanCount: number;
    }
  | {
      status: "approval-required";
      mayCollectFieldsSnapshot: false;
      executedPlanCount: 0;
    }
  | {
      status: "failed";
      reason: PreparationFailureReason;
      mayCollectFieldsSnapshot: false;
      executedPlanCount: number;
    };

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

async function refresh(
  refreshSnapshot: PreparationExecutionOptions["refreshSnapshot"],
): Promise<PreparationSnapshot | undefined> {
  try {
    return await refreshSnapshot();
  } catch {
    return undefined;
  }
}

function actionIsReady(snapshot: PreparationSnapshot, candidateId: string) {
  const lookup = snapshot.registry.lookupAction(candidateId);
  return lookup.status === "ready" ? lookup.handle : undefined;
}

function inspectGroupCount(
  countRepeatableGroups: PreparationExecutionOptions["countRepeatableGroups"],
  snapshot: PreparationSnapshot,
  plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
): number | undefined {
  try {
    const count = countRepeatableGroups(snapshot, plan);
    return isNonNegativeInteger(count) ? count : undefined;
  } catch {
    return undefined;
  }
}

function failure(
  reason: PreparationFailureReason,
  executedPlanCount: number,
): PreparationExecutionResult {
  return {
    status: "failed",
    reason,
    mayCollectFieldsSnapshot: false,
    executedPlanCount,
  };
}

export async function executeApprovedPreparationPlans({
  approvedPlans,
  initialSnapshot,
  refreshSnapshot,
  countRepeatableGroups,
}: PreparationExecutionOptions): Promise<PreparationExecutionResult> {
  if (approvedPlans.some(({ approved }) => !approved)) {
    return {
      status: "approval-required",
      mayCollectFieldsSnapshot: false,
      executedPlanCount: 0,
    };
  }

  let snapshot = initialSnapshot;
  let executedPlanCount = 0;

  for (const approvedPlan of approvedPlans) {
    const { plan } = approvedPlan;

    if (plan.command === "REVEAL_SECTION") {
      const action = actionIsReady(snapshot, plan.actionCandidateId);
      if (!action) {
        return failure("action-not-executable", executedPlanCount);
      }
      action.element.click();
      executedPlanCount += 1;
      const refreshed = await refresh(refreshSnapshot);
      if (!refreshed) {
        return failure("refresh-failed", executedPlanCount);
      }
      if (!refreshed.isTargetSectionVisible(plan.targetSectionId)) {
        return failure("target-not-visible", executedPlanCount);
      }
      snapshot = refreshed;
      continue;
    }

    const { localItemCount } = approvedPlan;
    if (localItemCount === undefined || !isNonNegativeInteger(localItemCount)) {
      return failure("invalid-local-item-count", executedPlanCount);
    }

    const currentGroupCount = inspectGroupCount(
      countRepeatableGroups,
      snapshot,
      plan,
    );
    if (currentGroupCount === undefined) {
      return failure("invalid-group-count", executedPlanCount);
    }
    const requiredAdditions = Math.max(0, localItemCount - currentGroupCount);

    for (let addition = 0; addition < requiredAdditions; addition += 1) {
      const currentAction = actionIsReady(snapshot, plan.actionCandidateId);
      if (!currentAction) {
        return failure("action-not-executable", executedPlanCount);
      }
      const countBefore = inspectGroupCount(
        countRepeatableGroups,
        snapshot,
        plan,
      );
      if (countBefore === undefined) {
        return failure("invalid-group-count", executedPlanCount);
      }

      currentAction.element.click();
      executedPlanCount += 1;
      const refreshed = await refresh(refreshSnapshot);
      if (!refreshed) {
        return failure("refresh-failed", executedPlanCount);
      }
      const countAfter = inspectGroupCount(
        countRepeatableGroups,
        refreshed,
        plan,
      );
      if (countAfter !== countBefore + 1) {
        return failure("group-count-not-incremented", executedPlanCount);
      }
      if (!actionIsReady(refreshed, plan.actionCandidateId)) {
        return failure("action-not-reidentified", executedPlanCount);
      }
      snapshot = refreshed;
    }
  }

  return {
    status: "completed",
    mayCollectFieldsSnapshot: true,
    executedPlanCount,
  };
}
