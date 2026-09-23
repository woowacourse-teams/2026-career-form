import type {
  InteractionDecisionRequest,
  InteractionDecisionResponse,
} from "./interaction-types";

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

export interface SemanticContext {
  labels?: Array<{
    source:
      | "label"
      | "aria-label"
      | "aria-labelledby"
      | "placeholder"
      | "legend"
      | "section-heading"
      | "description";
    text: string;
  }>;
  inputType?:
    "text" | "email" | "tel" | "number" | "date" | "month" | "url" | "search";
  inputMode?:
    | "none"
    | "text"
    | "decimal"
    | "numeric"
    | "tel"
    | "search"
    | "email"
    | "url";
  autocomplete?:
    | "name"
    | "given-name"
    | "family-name"
    | "additional-name"
    | "email"
    | "tel"
    | "postal-code"
    | "street-address"
    | "address-line1"
    | "address-line2"
    | "country"
    | "country-name"
    | "bday"
    | "bday-day"
    | "bday-month"
    | "bday-year"
    | "organization"
    | "organization-title"
    | "off";
  required?: true;
  multiple?: true;
  maxLength?: number;
  repeat?: { groupId: string; rowIndex: number; rowCount: number };
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
  semanticContext?: SemanticContext;
}

export interface ActionCandidate extends CandidateBase {
  element: "button" | "input" | "select" | "custom";
  control: "button" | "select" | "radio" | "custom";
  options?: OptionCandidate[];
}

export interface FieldCandidate extends CandidateBase {
  element: "input" | "select" | "textarea" | "custom";
  control:
    "text" | "select" | "radio" | "checkbox" | "textarea" | "button" | "custom";
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
  itemGroupId?: string;
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
      command: "SEARCH_ADDRESS";
      expectedEffect: "ADDRESS_SELECTED";
    }
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
      optionDisplayName?: string;
      expectedFieldNames?: string[];
      selectableProfileValues?: string[];
      revealedFieldBindings?: Record<string, string>;
      targetSectionId: string;
    }
  | {
      actionCandidateId: string;
      command: "ADD_REPEATABLE_GROUP";
      expectedEffect: "GROUP_COUNT_INCREMENT";
      expectedFieldNames?: string[];
    };

export interface PreparationAnalyzeResponse {
  snapshotId: string;
  mode: AnalysisMode;
  analysisStatus: AnalysisStatus;
  preparationPlans: PreparationPlan[];
  warningCodes?: ("MANUAL_REVEAL_REQUIRED" | "LLM_UNAVAILABLE")[];
  blockCode?:
    | "ADAPTER_STRUCTURE_MISMATCH"
    | "ADAPTER_POLICY_UNAVAILABLE"
    | "UNSUPPORTED_SNAPSHOT";
}

export type WriteCommand =
  | "SEARCH_SELECTION"
  | "SET_TEXT"
  | "SELECT_OPTION"
  | "SELECT_BUTTON_OPTION"
  | "CHECK_RADIO"
  | "CHECK_CHECKBOX";

export type DerivedRecipe =
  | "KOREAN_FULL_NAME"
  | "ENGLISH_FULL_NAME_GIVEN_FIRST"
  | "ENGLISH_FULL_NAME_FAMILY_FIRST"
  | "BOOLEAN_YN"
  | "YEAR_MONTH";

export type ValueBinding =
  | { type: "DIRECT"; profileFieldKey: string }
  | {
      type: "DERIVED";
      recipe: DerivedRecipe;
      profileFieldKey?: string;
      trueLabel?: string;
      falseLabel?: string;
    }
  | {
      type: "LOOKUP";
      profileFieldKey: string;
      optionMap: Record<string, string>;
    }
  | {
      type: "BUTTON_OPTION";
      profileFieldKey: string;
      optionMap: Record<string, string>;
      optionCodeMap: Record<string, string>;
    };

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
  blockCode?: "ADAPTER_STRUCTURE_MISMATCH" | "ADAPTER_POLICY_UNAVAILABLE";
}

export interface AnalysisApiClient {
  decideInteractions?(
    request: InteractionDecisionRequest,
  ): Promise<InteractionDecisionResponse>;
  analyzePreparation(
    request: PreparationAnalyzeRequest,
  ): Promise<PreparationAnalyzeResponse>;
  analyzeFields(request: FieldsAnalyzeRequest): Promise<FieldsAnalyzeResponse>;
}
