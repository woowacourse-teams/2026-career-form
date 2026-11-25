import {
  debugPreparationStop,
  debugStageCounts,
  type DebugStageName,
} from "../debug/structural-diagnostics";
import {
  executionPolicy,
  nativePolicyRequired,
} from "../workflow/execution-policy";
import { acquireDocumentRun } from "../interaction/document-run";
import { resolveDocumentCompany } from "../adapters/company";
import {
  isV1HistoryPage,
  ownedV1HistoryAddAction,
} from "../adapters/hplace/v1-history-controls";
import {
  isV1ExtraPage,
  ownedV1ExtraAddAction,
} from "../adapters/hplace/v1-extra-controls";
import type { PreparationPlan } from "../api/types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ActionCandidateHandle } from "../dom/types";

export interface PreparationSnapshot {
  registry: CandidateRegistry;
  isTargetSectionVisible(targetSectionId: string): boolean;
  countRepeatableGroups?(
    plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
  ): number | undefined;
  repeatableGroupState?(
    plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
  ): readonly string[] | undefined;
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
  onAction?: (element: HTMLElement) => void;
  onVerifiedAddition?: (
    action: ActionCandidateHandle,
    countBefore: number,
    countAfter: number,
  ) => void;
  document?: Document;
  signal?: AbortSignal;
  assertCurrent?: () => boolean;
  beforeMutation?: () => Promise<boolean>;
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
  waitForExpectedFields?: (plan: PreparationPlan) => Promise<boolean>;
  /** `stage name=` of the count line; callers name their pass. */
  diagnosticsStage?: DebugStageName;
}

export type PreparationFailureReason =
  | "action-not-executable"
  | "action-not-reidentified"
  | "invalid-local-item-count"
  | "invalid-group-count"
  | "group-count-not-incremented"
  | "existing-group-value-changed"
  | "refresh-failed"
  | "expected-fields-not-visible"
  | "action-not-ready"
  | "profile-value-unavailable"
  | "option-label-mismatch"
  | "unsupported-option-action"
  | "target-not-visible"
  | "run-in-progress"
  | "execution-cancelled";

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
    (identity.domId === undefined || handle.candidate.domId === identity.domId)
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

/** The action's key for the stop line: its structural name or id (value-free). */
function stopKey(
  snapshot: PreparationSnapshot,
  id: string | undefined,
): string {
  if (!id) return "none";
  const lookup = snapshot.registry.lookupAction(id);
  return "handle" in lookup
    ? (lookup.handle.candidate.domName ?? lookup.handle.candidate.domId ?? id)
    : id;
}

/** A failure that also names itself in one value-free line (debug only). */
function stopped(
  snapshot: PreparationSnapshot,
  id: string | undefined,
  reason: PreparationFailureReason,
  executedPlanCount: number,
  failedActionCandidateId?: string,
  detail = "",
): PreparationExecutionResult {
  debugPreparationStop(
    stopKey(snapshot, failedActionCandidateId ?? id),
    reason,
    detail,
  );
  return failure(reason, executedPlanCount, failedActionCandidateId);
}

async function executeApprovedPreparationPlansInternal(
  options: PreparationExecutionOptions,
): Promise<PreparationExecutionResult> {
  const first = options.approvedPlans.find(({ approved }) => approved);
  const lookup =
    first &&
    options.initialSnapshot.registry.lookupAction(first.plan.actionCandidateId);
  const document =
    options.document ??
    (lookup && "handle" in lookup
      ? lookup.handle.element.ownerDocument
      : undefined);
  const release = document ? acquireDocumentRun(document) : undefined;
  if (document && !release)
    return stopped(
      options.initialSnapshot,
      first?.plan.actionCandidateId,
      "run-in-progress",
      0,
    );
  const url = document?.URL;
  const nativeDigest =
    document && nativePolicyRequired(document)
      ? JSON.stringify(executionPolicy(document)?.browserPolicy)
      : undefined;
  if (
    nativeDigest !== undefined &&
    options.approvedPlans.some(({ approved, plan }) => {
      if (!approved) return false;
      const action = options.initialSnapshot.registry.lookupAction(
        plan.actionCandidateId,
      );
      return (
        plan.command !== "ADD_REPEATABLE_GROUP" ||
        action.status !== "ready" ||
        action.handle.owner !== "native"
      );
    })
  ) {
    release?.();
    return stopped(
      options.initialSnapshot,
      first?.plan.actionCandidateId,
      "action-not-executable",
      0,
    );
  }
  // Hplace pages run no preparation, except the v1 step-2 card adds (CF-509).
  const historyAdds =
    !!document &&
    options.approvedPlans.every(({ approved, plan }) => {
      if (!approved) return true;
      const action = options.initialSnapshot.registry.lookupAction(
        plan.actionCandidateId,
      );
      return (
        plan.command === "ADD_REPEATABLE_GROUP" &&
        action.status === "ready" &&
        (ownedV1HistoryAddAction(action.handle) !== undefined ||
          ownedV1ExtraAddAction(action.handle) !== undefined)
      );
    });
  try {
    return await executePreparation({
      ...options,
      assertCurrent: () =>
        !options.signal?.aborted &&
        options.assertCurrent?.() !== false &&
        document?.URL === url &&
        (nativeDigest === undefined ||
          JSON.stringify(executionPolicy(document!)?.browserPolicy) ===
            nativeDigest) &&
        (!document ||
          resolveDocumentCompany(document) !== "hplace" ||
          (historyAdds &&
            (isV1HistoryPage(document) || isV1ExtraPage(document)))),
    });
  } finally {
    release?.();
  }
}

async function executePreparation({
  approvedPlans,
  initialSnapshot,
  refreshSnapshot,
  countRepeatableGroups,
  selectProfileOption,
  waitForExpectedFields,
  onAction,
  onVerifiedAddition,
  assertCurrent,
  beforeMutation,
}: PreparationExecutionOptions): Promise<PreparationExecutionResult> {
  const permitted = async () => {
    if (assertCurrent?.() === false) return false;
    try {
      if (beforeMutation && !(await beforeMutation())) return false;
    } catch {
      return false;
    }
    return assertCurrent?.() !== false;
  };
  const selectedPlans = approvedPlans.filter(({ approved }) => approved);
  if (selectedPlans.length === 0) {
    return {
      status: "approval-required",
      mayCollectFieldsSnapshot: false,
      executedPlanCount: 0,
    };
  }

  let snapshot = initialSnapshot;
  let currentId: string | undefined;
  const stop = (
    reason: PreparationFailureReason,
    executed: number,
    failedActionCandidateId?: string,
    detail = "",
  ) =>
    stopped(
      initialSnapshot,
      currentId,
      reason,
      executed,
      failedActionCandidateId,
      detail,
    );
  let executedPlanCount = 0;
  const unavailableActionCandidateIds = new Set<string>();

  for (const approvedPlan of selectedPlans) {
    currentId = approvedPlan.plan.actionCandidateId;
    if (!(await permitted()))
      return stop("execution-cancelled", executedPlanCount);
    const { plan } = approvedPlan;
    if (plan.command === "SEARCH_ADDRESS") {
      return stop("action-not-executable", executedPlanCount);
    }

    if (plan.command === "REVEAL_SECTION") {
      const identity = actionIdentity(initialSnapshot, plan.actionCandidateId);
      const action = actionIsReadyWithIdentity(
        snapshot,
        plan.actionCandidateId,
        identity,
      );
      if (!action) {
        return stop("action-not-executable", executedPlanCount);
      }
      action.element.click();
      onAction?.(action.element);
      executedPlanCount += 1;
      const refreshed = await refresh(refreshSnapshot);
      if (!refreshed) {
        return stop("refresh-failed", executedPlanCount);
      }
      if (!refreshed.isTargetSectionVisible(plan.targetSectionId)) {
        return stop("target-not-visible", executedPlanCount);
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
      if (!action) return stop("action-not-ready", executedPlanCount);
      const selectedPlan = {
        ...plan,
        actionCandidateId: action.candidate.candidateId,
      };
      const selected =
        selectProfileOption?.(selectedPlan, snapshot) ??
        "unsupported-option-action";
      if (selected !== "selected") return stop(selected, executedPlanCount);
      executedPlanCount += 1;
      if (plan.expectedFieldNames && plan.expectedFieldNames.length > 0) {
        const expectedFieldsVisible =
          (await waitForExpectedFields?.(plan)) ?? false;
        if (!expectedFieldsVisible) {
          unavailableActionCandidateIds.add(plan.actionCandidateId);
        }
      }
      const refreshed = await refresh(refreshSnapshot);
      if (!refreshed) return stop("refresh-failed", executedPlanCount);
      if (
        (!plan.expectedFieldNames || plan.expectedFieldNames.length === 0) &&
        !refreshed.isTargetSectionVisible(plan.targetSectionId)
      ) {
        return stop("target-not-visible", executedPlanCount);
      }
      snapshot = refreshed;
      continue;
    }

    const { localItemCount } = approvedPlan;
    if (localItemCount === undefined || !isNonNegativeInteger(localItemCount)) {
      return stop("invalid-local-item-count", executedPlanCount);
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
      return stop(
        "invalid-group-count",
        executedPlanCount,
        undefined,
        "count-initial",
      );
    }
    const requiredAdditions = Math.max(0, localItemCount - currentGroupCount);
    if (requiredAdditions > 0 && !initialAction) {
      return stop("action-not-executable", executedPlanCount);
    }

    for (let addition = 0; addition < requiredAdditions; addition += 1) {
      if (!(await permitted()))
        return stop("execution-cancelled", executedPlanCount);
      const currentAction = actionIsReadyWithIdentity(
        snapshot,
        plan.actionCandidateId,
        identity,
      );
      if (!currentAction) {
        return stop("action-not-executable", executedPlanCount);
      }
      const currentPlan = planWithActionCandidateId(
        plan,
        currentAction.candidate.candidateId,
      );
      const countBefore = inspectGroupCount(
        countRepeatableGroups,
        snapshot,
        currentPlan,
      );
      const stateBefore = snapshot.repeatableGroupState?.(currentPlan);
      if (countBefore === undefined) {
        return stop(
          "invalid-group-count",
          executedPlanCount,
          undefined,
          "count-before",
        );
      }

      currentAction.element.click();
      onAction?.(currentAction.element);
      executedPlanCount += 1;
      const expectedFieldsVisible =
        plan.expectedFieldNames && plan.expectedFieldNames.length > 0
          ? ((await waitForExpectedFields?.(plan)) ?? false)
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
        return stop("refresh-failed", executedPlanCount);
      }
      const refreshedAction = actionIsReadyWithIdentity(
        refreshed,
        plan.actionCandidateId,
        identity,
      );
      if (!refreshedAction) {
        return stop(
          "action-not-reidentified",
          executedPlanCount,
          plan.actionCandidateId,
        );
      }
      const countAfter = inspectGroupCount(
        countRepeatableGroups,
        refreshed,
        planWithActionCandidateId(plan, refreshedAction.candidate.candidateId),
      );
      if (countAfter === undefined) {
        return stop(
          "invalid-group-count",
          executedPlanCount,
          undefined,
          "count-after",
        );
      }
      if (countAfter !== countBefore + 1) {
        return stop(
          "group-count-not-incremented",
          executedPlanCount,
          undefined,
          `before${countBefore}-after${countAfter}`,
        );
      }
      const refreshedPlan = planWithActionCandidateId(
        plan,
        refreshedAction.candidate.candidateId,
      );
      const stateAfter = refreshed.repeatableGroupState?.(refreshedPlan);
      if (
        stateBefore &&
        (!stateAfter ||
          stateAfter.length < stateBefore.length ||
          stateBefore.some((state, index) => stateAfter[index] !== state))
      ) {
        return stop(
          "existing-group-value-changed",
          executedPlanCount,
          undefined,
          `state${stateBefore.length}-${stateAfter?.length ?? "none"}`,
        );
      }
      onVerifiedAddition?.(refreshedAction, countBefore, countAfter);
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

export async function executeApprovedPreparationPlans(
  options: PreparationExecutionOptions,
): Promise<PreparationExecutionResult> {
  const result = await executeApprovedPreparationPlansInternal(options);
  debugStageCounts(
    options.diagnosticsStage ?? "preparation",
    options.approvedPlans.filter((p) => p.approved).length,
    result.executedPlanCount,
  );
  return result;
}
