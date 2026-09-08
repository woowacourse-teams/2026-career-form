import type { MatchedFieldAnalysis, PreparationPlan } from "../api/types";
import type { ActionCandidateHandle, FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import type { RepeatedProfileCategoryId } from "../../profile/model";
import { resolveCompany } from "./company";
import { hyundaiWorkflowAdapter } from "./hyundai/workflow";
import { skWorkflowAdapter } from "./sk/workflow";

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
  ): Promise<boolean | undefined>;
  canSelectProfileOption?(
    handle: ActionCandidateHandle,
    profileValue: string,
  ): boolean | undefined;
  canWriteProfileOption?(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
  ): boolean | undefined;

  runAddress?(
    options: import("../address/types").AddressExecutionOptions,
  ): Promise<import("../address/types").AddressResult>;
  diagnosticsTitle?: string;
  repeatedProfileSectionHint?(actionDomId: string | undefined):
    | {
        categoryId: RepeatedProfileCategoryId;
        sectionId: string;
      }
    | undefined;
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
  ): Promise<boolean>;
  settleStateDriver?(
    document: Document,
    handle: FieldCandidateHandle,
  ): Promise<boolean>;
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

const genericWorkflowAdapter: WorkflowAdapter = {
  hasFreshRows: () => false,
  isFreshRowDefault: () => false,
  isStateDriver: () => false,
  revealSelections: [],
  selectReveal: () => ({ code: "TARGET_MISSING", count: 0 }),
  revealedBindings: () => new Map(),
  revealedProfileFieldKey: () => undefined,
};

export function getWorkflowAdapter(host: string): WorkflowAdapter {
  switch (resolveCompany(host)) {
    case "hyundai":
      return hyundaiWorkflowAdapter;
    case "sk":
      return skWorkflowAdapter;
    case "generic":
      return genericWorkflowAdapter;
  }
}
