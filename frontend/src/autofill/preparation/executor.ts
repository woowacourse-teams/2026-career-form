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

interface ActionIdentity {
  sectionId: string;
  displayName?: string;
  domId?: string;
  domName?: string;
}

function actionIdentity(
  snapshot: PreparationSnapshot,
  candidateId: string,
): ActionIdentity | undefined {
  const lookup = snapshot.registry.lookupAction(candidateId);
  if (!("handle" in lookup)) return undefined;
  const { handle } = lookup;
  return {
    sectionId: handle.sectionId,
    ...(handle.candidate.displayName
      ? { displayName: handle.candidate.displayName }
      : {}),
    ...(handle.candidate.domId ? { domId: handle.candidate.domId } : {}),
    ...(handle.candidate.domName ? { domName: handle.candidate.domName } : {}),
  };
}

function actionMatchesIdentity(
  handle: { sectionId: string; candidate: { displayName?: string } },
  identity: ActionIdentity,
): boolean {
  return (
    handle.sectionId === identity.sectionId &&
    (identity.displayName === undefined ||
      handle.candidate.displayName === identity.displayName)
  );
}

function actionIsReadyWithIdentity(
  snapshot: PreparationSnapshot,
  candidateId: string,
  identity: ActionIdentity | undefined,
) {
  const direct = snapshot.registry.lookupAction(candidateId);
  if (
    direct.status === "ready" &&
    (!identity || actionMatchesIdentity(direct.handle, identity))
  ) {
    return direct.handle;
  }
  if (!identity) return undefined;
  const fallback = snapshot.registry.lookupActionByIdentity(identity);
  return fallback.status === "ready" ? fallback.handle : undefined;
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

function planWithActionCandidateId(
  plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
  actionCandidateId: string,
): Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }> {
  return { ...plan, actionCandidateId };
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
  const selectedPlans = approvedPlans.filter(({ approved }) => approved);
  if (selectedPlans.length === 0) {
    return {
      status: "approval-required",
      mayCollectFieldsSnapshot: false,
      executedPlanCount: 0,
    };
  }

  let snapshot = initialSnapshot;
  let executedPlanCount = 0;

  for (const approvedPlan of selectedPlans) {
    const { plan } = approvedPlan;

    if (plan.command === "REVEAL_SECTION") {
      const identity = actionIdentity(initialSnapshot, plan.actionCandidateId);
      const action = actionIsReadyWithIdentity(
        snapshot,
        plan.actionCandidateId,
        identity,
      );
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

    const identity = actionIdentity(initialSnapshot, plan.actionCandidateId);
    const initialAction = actionIsReadyWithIdentity(
      snapshot,
      plan.actionCandidateId,
      identity,
    );
    const currentGroupCount = inspectGroupCount(
      countRepeatableGroups,
      snapshot,
      initialAction
        ? planWithActionCandidateId(plan, initialAction.candidate.candidateId)
        : plan,
    );
    if (currentGroupCount === undefined) {
      return failure("invalid-group-count", executedPlanCount);
    }
    const requiredAdditions = Math.max(0, localItemCount - currentGroupCount);
    if (requiredAdditions > 0 && !initialAction) {
      return failure("action-not-executable", executedPlanCount);
    }

    for (let addition = 0; addition < requiredAdditions; addition += 1) {
      const currentAction = actionIsReadyWithIdentity(
        snapshot,
        plan.actionCandidateId,
        identity,
      );
      if (!currentAction) {
        return failure("action-not-executable", executedPlanCount);
      }
      const countBefore = inspectGroupCount(
        countRepeatableGroups,
        snapshot,
        planWithActionCandidateId(plan, currentAction.candidate.candidateId),
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
      const refreshedAction = actionIsReadyWithIdentity(
        refreshed,
        plan.actionCandidateId,
        identity,
      );
      if (!refreshedAction) {
        return failure("action-not-reidentified", executedPlanCount);
      }
      const countAfter = inspectGroupCount(
        countRepeatableGroups,
        refreshed,
        planWithActionCandidateId(plan, refreshedAction.candidate.candidateId),
      );
      if (countAfter !== countBefore + 1) {
        return failure("group-count-not-incremented", executedPlanCount);
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
