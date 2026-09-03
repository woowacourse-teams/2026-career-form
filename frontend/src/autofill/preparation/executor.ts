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
  selectProfileOption?: (
    plan: Extract<PreparationPlan, { command: "SELECT_OPTION_TO_REVEAL" }>,
    snapshot: PreparationSnapshot,
  ) => OptionSelectionResult;
  waitForExpectedFields?: (
    plan: PreparationPlan,
  ) => Promise<boolean>;
}

export type PreparationFailureReason =
  | "action-not-executable"
  | "action-not-reidentified"
  | "invalid-local-item-count"
  | "invalid-group-count"
  | "group-count-not-incremented"
  | "refresh-failed"
  | "expected-fields-not-visible"
  | "action-not-ready"
  | "profile-value-unavailable"
  | "option-label-mismatch"
  | "unsupported-option-action"
  | "target-not-visible";

export type OptionSelectionResult =
  | "selected"
  | "action-not-ready"
  | "profile-value-unavailable"
  | "option-label-mismatch"
  | "unsupported-option-action";

export type PreparationExecutionResult =
  | {
      status: "completed";
      mayCollectFieldsSnapshot: true;
      executedPlanCount: number;
      unavailableActionCandidateIds: string[];
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
      failedActionCandidateId?: string;
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
  handle: {
    sectionId: string;
    candidate: { displayName?: string; domId?: string; domName?: string };
  },
  identity: ActionIdentity,
): boolean {
  const hasStableStructuralName =
    identity.domName !== undefined || identity.domId !== undefined;
  return (
    (hasStableStructuralName || handle.sectionId === identity.sectionId) &&
    (identity.displayName === undefined ||
      handle.candidate.displayName === identity.displayName) &&
    (identity.domName === undefined ||
      handle.candidate.domName === identity.domName) &&
    (identity.domId === undefined ||
      handle.candidate.domId === identity.domId ||
      (handle.candidate.domId === undefined &&
        identity.displayName !== undefined))
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
  failedActionCandidateId?: string,
): PreparationExecutionResult {
  return {
    status: "failed",
    reason,
    mayCollectFieldsSnapshot: false,
    executedPlanCount,
    ...(failedActionCandidateId ? { failedActionCandidateId } : {}),
  };
}

export async function executeApprovedPreparationPlans({
  approvedPlans,
  initialSnapshot,
  refreshSnapshot,
  countRepeatableGroups,
  selectProfileOption,
  waitForExpectedFields,
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
  const unavailableActionCandidateIds = new Set<string>();

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

    if (plan.command === "SELECT_OPTION_TO_REVEAL") {
      const identity = actionIdentity(initialSnapshot, plan.actionCandidateId);
      const action = actionIsReadyWithIdentity(
        snapshot,
        plan.actionCandidateId,
        identity,
      );
      if (!action) return failure("action-not-ready", executedPlanCount);
      const selectedPlan = {
        ...plan,
        actionCandidateId: action.candidate.candidateId,
      };
      const selected =
        selectProfileOption?.(selectedPlan, snapshot) ?? "unsupported-option-action";
      if (selected !== "selected") return failure(selected, executedPlanCount);
      executedPlanCount += 1;
      if (plan.expectedFieldNames && plan.expectedFieldNames.length > 0) {
        const expectedFieldsVisible =
          (await waitForExpectedFields?.(plan)) ?? false;
        if (!expectedFieldsVisible) {
          unavailableActionCandidateIds.add(plan.actionCandidateId);
        }
      }
      const refreshed = await refresh(refreshSnapshot);
      if (!refreshed) return failure("refresh-failed", executedPlanCount);
      if (
        (!plan.expectedFieldNames || plan.expectedFieldNames.length === 0) &&
        !refreshed.isTargetSectionVisible(plan.targetSectionId)
      ) {
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
      const expectedFieldsVisible =
        plan.expectedFieldNames && plan.expectedFieldNames.length > 0
          ? (await waitForExpectedFields?.(plan)) ?? false
          : false;
      if (
        plan.expectedFieldNames &&
        plan.expectedFieldNames.length > 0 &&
        !expectedFieldsVisible
      ) {
        unavailableActionCandidateIds.add(plan.actionCandidateId);
      }
      const refreshed = await refresh(refreshSnapshot);
      if (!refreshed) {
        return failure("refresh-failed", executedPlanCount);
      }
      const refreshedAction = actionIsReadyWithIdentity(
        refreshed,
        plan.actionCandidateId,
        identity,
      );
      const countAfter = refreshedAction
        ? inspectGroupCount(
            countRepeatableGroups,
            refreshed,
            planWithActionCandidateId(plan, refreshedAction.candidate.candidateId),
          )
        : undefined;
      if (countAfter === undefined) {
        if (
          expectedFieldsVisible &&
          addition === requiredAdditions - 1
        ) {
          snapshot = refreshed;
          continue;
        }
        return failure(
          "action-not-reidentified",
          executedPlanCount,
          plan.actionCandidateId,
        );
      }
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
    unavailableActionCandidateIds: [...unavailableActionCandidateIds],
  };
}
