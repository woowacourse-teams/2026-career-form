export type AnalysisMode = "ADAPTER" | "GENERIC";
export type AnalysisStatus = "COMPLETE" | "PARTIAL" | "BLOCKED";
export type Visibility = "visible" | "hidden";

export interface SiteDescriptor {
  host: string;
  pathPattern: string;
}

export interface OptionCandidate {
  optionId: string;
  displayName: string;
}

interface CandidateBase {
  candidateId: string;
  visibility: Visibility;
  displayName?: string;
  domId?: string;
  domName?: string;
  disabled?: true;
  readonly?: true;
  inert?: true;
}

export interface ActionCandidate extends CandidateBase {
  element: "button" | "input" | "select" | "custom";
  control: "button" | "select" | "custom";
  options?: OptionCandidate[];
}

export interface FieldCandidate extends CandidateBase {
  element: "input" | "select" | "textarea" | "custom";
  control: "text" | "select" | "radio" | "checkbox" | "textarea" | "custom";
  placeholder?: string;
  options?: OptionCandidate[];
}

export interface PreparationItem {
  itemId: string;
  actionCandidates: ActionCandidate[];
}

export interface PreparationSection {
  sectionId: string;
  parentSectionId?: string;
  displayName?: string;
  actionCandidates: ActionCandidate[];
  items?: PreparationItem[];
}

export interface FieldsItem {
  itemId: string;
  fields: FieldCandidate[];
}

export interface FieldsSection {
  sectionId: string;
  parentSectionId?: string;
  displayName?: string;
  fields: FieldCandidate[];
  items?: FieldsItem[];
}

export interface PreparationAnalyzeRequest {
  schemaVersion: 2;
  snapshotId: string;
  site: SiteDescriptor;
  sections: PreparationSection[];
}

export interface FieldsAnalyzeRequest {
  schemaVersion: 2;
  snapshotId: string;
  site: SiteDescriptor;
  sections: FieldsSection[];
}

export type PreparationPlan =
  | {
      actionCandidateId: string;
      command: "REVEAL_SECTION";
      expectedEffect: "TARGET_VISIBLE";
      targetSectionId: string;
    }
  | {
      actionCandidateId: string;
      command: "SELECT_OPTION_TO_REVEAL";
      expectedEffect: "TARGET_FIELDS_VISIBLE";
      profileFieldKey: string;
      targetSectionId: string;
    }
  | {
      actionCandidateId: string;
      command: "ADD_REPEATABLE_GROUP";
      expectedEffect: "GROUP_COUNT_INCREMENT";
    };

export interface PreparationAnalyzeResponse {
  snapshotId: string;
  mode: AnalysisMode;
  analysisStatus: AnalysisStatus;
  preparationPlans: PreparationPlan[];
  warningCodes?: "MANUAL_REVEAL_REQUIRED"[];
  blockCode?: "ADAPTER_STRUCTURE_MISMATCH" | "UNSUPPORTED_SNAPSHOT";
}

export type WriteCommand =
  "SET_TEXT" | "SELECT_OPTION" | "CHECK_RADIO" | "CHECK_CHECKBOX";

export type DerivedRecipe =
  | "KOREAN_FULL_NAME"
  | "ENGLISH_FULL_NAME_GIVEN_FIRST"
  | "ENGLISH_FULL_NAME_FAMILY_FIRST"
  | "EDUCATION_TYPE_AND_DEGREE";

export type ValueBinding =
  | { type: "DIRECT"; profileFieldKey: string }
  | { type: "DERIVED"; recipe: DerivedRecipe };

export interface MatchedFieldAnalysis {
  candidateId: string;
  matchType: "MATCH";
  valueBinding?: ValueBinding;
  /** @deprecated Responses should use valueBinding. */
  profileFieldKey?: string;
  autofillPolicy: "ALLOWED" | "CONDITIONAL" | "SENSITIVE_CONFIRMATION";
  mappingStatus: "ADAPTER_VERIFIED" | "LLM_SUGGESTED";
  interactionStatus:
    | "READY"
    | "MANUAL_REVEAL_REQUIRED"
    | "BLOCKED"
    | "SYSTEM_CONTROL"
    | "UNVERIFIED";
  writePlan?: { command: WriteCommand };
}

export interface NoMatchFieldAnalysis {
  candidateId: string;
  matchType: "NO_MATCH";
  mappingStatus: "ADAPTER_VERIFIED" | "LLM_SUGGESTED";
  interactionStatus: "BLOCKED";
  reasonCodes: ["NO_MATCH"];
}

export type FieldAnalysis = MatchedFieldAnalysis | NoMatchFieldAnalysis;

export interface FieldsAnalyzeResponse {
  snapshotId: string;
  mode: AnalysisMode;
  analysisStatus: AnalysisStatus;
  fields: FieldAnalysis[];
  warningCodes?: ("UNRESOLVED_FIELD" | "LLM_UNAVAILABLE")[];
  blockCode?: "ADAPTER_STRUCTURE_MISMATCH";
}

export interface AnalysisApiClient {
  analyzePreparation(
    request: PreparationAnalyzeRequest,
  ): Promise<PreparationAnalyzeResponse>;
  analyzeFields(request: FieldsAnalyzeRequest): Promise<FieldsAnalyzeResponse>;
}
