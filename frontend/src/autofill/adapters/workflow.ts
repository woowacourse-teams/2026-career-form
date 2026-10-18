import {
  isBasicStateDriver,
  writeBasic,
  settleBasicStateDriver,
} from "./hplace/basic-write";
import { ownedBasicControl } from "./hplace/basic-controls";
import { isRegistrationItem, writeRegistration } from "./hplace/write";
import { startLocalTiming } from "../debug/local-timing";
import { hiddenCodeAdapters } from "../policy/hidden-code";
import { componentWorkflowAdapter } from "../policy/components/workflow";
import type { MatchedFieldAnalysis, PreparationPlan } from "../api/types";
import type { ActionCandidateHandle, FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import type { Profile, RepeatedProfileCategoryId } from "../../profile/model";
import { resolveCompany, resolveDocumentCompany } from "./company";
import { policyWorkflowAdapter } from "../policy/workflow";
import { executionPolicy } from "../workflow/execution-policy";
import type { FailureReporter } from "../write/failure";

export interface FreshRowPreparation {
  plan: PreparationPlan;
  currentGroupCount?: number;
  requiredAdditions?: number;
}

export interface RevealSelection {
  domName: string;
  profileFieldKey: string;
  itemIndex: number;
}

export interface WorkflowDiagnostic {
  code:
    | "PROFILE_UNAVAILABLE"
    | "PROFILE_NOT_SELECTED"
    | "TARGET_MISSING"
    | "SELECTED"
    | "SELECTION_FAILED"
    | "FOLLOW_UP_PLANS"
    | "FOLLOW_UP_BINDINGS"
    | "ANALYSIS_BLOCKED"
    | "ELIGIBLE_FIELDS"
    | "WRITTEN"
    | "SKIPPED";
  count: number;
}

export interface WorkflowAdapter {
  // Explicit company/field policy only; never a general conflict bypass.
  prefersProfileValue?(
    handle: FieldCandidateHandle,
    analysis: MatchedFieldAnalysis,
  ): boolean;
  normalizeProfileValue?(profileFieldKey: string, value: string): string;
  addressFieldNames?: readonly string[];
  prepareEducation?(
    document: Document,
    profile: import("../../profile/model").Profile,
    signal: AbortSignal,
  ): Promise<boolean>;
  educationPreparationActionId?: string;
  executeStateDriver?(
    document: Document,
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
    signal: AbortSignal,
    onFailure?: FailureReporter,
    beforeMutation?: () => Promise<boolean>,
  ): Promise<boolean | undefined>;
  canSelectProfileOption?(
    handle: ActionCandidateHandle,
    profileValue: string,
    profileFieldKey?: string,
  ): boolean | undefined;
  canWriteProfileOption?(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
  ): boolean | undefined;

  runAddress?(
    options: import("../address/types").AddressExecutionOptions,
  ): Promise<import("../address/types").AddressResult>;
  // The detail field must never be written without its verified search.
  addressRequiresSearch?: boolean;
  diagnosticsTitle?: string;
  repeatedProfileSectionHint?(actionDomId: string | undefined):
    | {
        categoryId: RepeatedProfileCategoryId;
        sectionId: string;
      }
    | undefined;
  repeatableProfileCount?(
    actionDomId: string | undefined,
    profile: Profile,
  ): number | null | undefined;
  followUpRepeatableAction?(actionDomId: string | undefined): boolean;
  freshDefaultAfterAdd?(handle: ActionCandidateHandle): Element | undefined;
  educationSectionHint?(
    matchLabel: string,
  ): "highSchool" | "university" | "graduateSchool" | undefined;
  hasFreshRows(items: readonly FreshRowPreparation[]): boolean;
  isFreshRowDefault(domName: string | undefined): boolean;
  isStateDriver(item: ReviewPlanItem, domName: string | undefined): boolean;
  stateDriverStage?(
    item: ReviewPlanItem,
    handle: FieldCandidateHandle,
  ): number | undefined;
  waitForStateDriverReady?(
    document: Document,
    handle: FieldCandidateHandle,
    onFailure?: FailureReporter,
    context?: StateDriverContext,
  ): Promise<boolean>;
  settleStateDriver?(
    document: Document,
    handle: FieldCandidateHandle,
    onFailure?: FailureReporter,
    context?: StateDriverContext,
  ): Promise<boolean>;
  stateDriverFailureTargets?(
    item: ReviewPlanItem,
    handle: FieldCandidateHandle,
  ): Element[] | undefined;
  // Opt-in only: a failed search may defer its whole independently bound row.
  stateDriverFailureGroup?(
    item: ReviewPlanItem,
    handle: FieldCandidateHandle,
  ): Element | undefined;
  revealSelections: readonly RevealSelection[];
  selectReveal(
    document: Document,
    selection: RevealSelection,
    profileValue: string | undefined,
  ): WorkflowDiagnostic;
  revealedBindings(
    plans: readonly PreparationPlan[],
  ): ReadonlyMap<string, string>;
  revealedProfileFieldKey(
    field: MatchedFieldAnalysis,
    domName: string | undefined,
    bindings: ReadonlyMap<string, string>,
  ): string | undefined;
}

export interface StateDriverContext {
  readonly item: ReviewPlanItem;
  readonly signal: AbortSignal;
  readonly beforeMutation?: () => Promise<boolean>;
}

const genericWorkflowAdapter: WorkflowAdapter = {
  hasFreshRows: () => false,
  isFreshRowDefault: () => false,
  isStateDriver: () => false,
  revealSelections: [],
  selectReveal: () => ({ code: "TARGET_MISSING", count: 0 }),
  revealedBindings: () => new Map(),
  revealedProfileFieldKey: () => undefined,
};

const hplaceWorkflowAdapter: WorkflowAdapter = {
  ...genericWorkflowAdapter,
  isStateDriver: (item, name) =>
    isRegistrationItem(item, name) || isBasicStateDriver(item, name),
  stateDriverStage: (item, handle) =>
    ownedBasicControl(handle) &&
    isBasicStateDriver(item, handle.candidate.domName)
      ? 1
      : undefined,
  settleStateDriver: (_document, handle, _report, context) =>
    handle.candidate.domName?.startsWith("hplace.detail.")
      ? settleBasicStateDriver(handle, context?.signal, context?.item)
      : Promise.resolve(
          !!context &&
            isRegistrationItem(context.item, handle.candidate.domName),
        ),
  stateDriverFailureGroup: (item, handle) =>
    isBasicStateDriver(item, handle.candidate.domName)
      ? (handle.elements[0]?.closest(".subject") ?? undefined)
      : undefined,
  executeStateDriver: (
    document,
    handle,
    item,
    signal,
    report,
    beforeMutation,
  ) =>
    ownedBasicControl(handle)
      ? writeBasic(handle, item, () => !signal.aborted, beforeMutation)
      : writeRegistration(
          document,
          handle,
          item,
          signal,
          report,
          beforeMutation,
        ),
};

function resolveWorkflowAdapter(source: string | Document): WorkflowAdapter {
  if (typeof source !== "string") {
    const configured = hiddenCodeAdapters(source);
    if (configured) return configured.workflow;
  }
  if (typeof source !== "string" && executionPolicy(source)?.browserPolicy)
    return policyWorkflowAdapter(source);
  switch (
    typeof source === "string"
      ? resolveCompany(source)
      : resolveDocumentCompany(source)
  ) {
    case "hplace":
      return hplaceWorkflowAdapter;
    case "components":
      return typeof source === "string"
        ? genericWorkflowAdapter
        : componentWorkflowAdapter(source);
    case "policy":
    case "generic":
      return genericWorkflowAdapter;
  }
}

export function getWorkflowAdapter(source: string | Document): WorkflowAdapter {
  const adapter = resolveWorkflowAdapter(source);
  if (
    import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS !== "1" ||
    import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080"
  )
    return adapter;
  return {
    ...adapter,
    ...(adapter.executeStateDriver
      ? {
          executeStateDriver: async (
            ...args: Parameters<
              NonNullable<WorkflowAdapter["executeStateDriver"]>
            >
          ) => {
            const finish = startLocalTiming("driver-execute", {
              field: args[1].candidate.domName ?? "",
              command: args[2].analysis?.writePlan?.command ?? "",
            });
            try {
              return await adapter.executeStateDriver!(...args);
            } finally {
              finish();
            }
          },
        }
      : {}),
    ...(adapter.waitForStateDriverReady
      ? {
          waitForStateDriverReady: async (
            ...args: Parameters<
              NonNullable<WorkflowAdapter["waitForStateDriverReady"]>
            >
          ) => {
            const finish = startLocalTiming("driver-ready", {
              field: args[1].candidate.domName ?? "",
            });
            try {
              return await adapter.waitForStateDriverReady!(...args);
            } finally {
              finish();
            }
          },
        }
      : {}),
    ...(adapter.settleStateDriver
      ? {
          settleStateDriver: async (
            ...args: Parameters<
              NonNullable<WorkflowAdapter["settleStateDriver"]>
            >
          ) => {
            const finish = startLocalTiming("driver-settle", {
              field: args[1].candidate.domName ?? "",
            });
            try {
              return await adapter.settleStateDriver!(...args);
            } finally {
              finish();
            }
          },
        }
      : {}),
  };
}
