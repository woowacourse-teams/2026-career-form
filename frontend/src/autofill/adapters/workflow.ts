import type { MatchedFieldAnalysis, PreparationPlan } from "../api/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { resolveCompany } from "./company";
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
  diagnosticsTitle?: string;
  educationSectionHint?(
    matchLabel: string,
  ): "highSchool" | "university" | "graduateSchool" | undefined;
  hasFreshRows(items: readonly FreshRowPreparation[]): boolean;
  isFreshRowDefault(domName: string | undefined): boolean;
  isStateDriver(item: ReviewPlanItem, domName: string | undefined): boolean;
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
  return resolveCompany(host) === "sk"
    ? skWorkflowAdapter
    : genericWorkflowAdapter;
}
