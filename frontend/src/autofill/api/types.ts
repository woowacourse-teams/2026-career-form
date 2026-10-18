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
  /** Optional so pre-calendar servers retain the schemaVersion 2 contract. */
  supportedWriteCommands?: ["SELECT_DATE"];
  snapshotId: string;
  site: SiteDescriptor;
  sections: FieldsSection[];
}

export type SectionControlKind =
  | "TEXT"
  | "TEXTAREA"
  | "SELECT"
  | "RADIO"
  | "CHECKBOX"
  | "DATE"
  | "FILE"
  | "BUTTON"
  | "OTHER";

/** Section structure only; never profile values, current input values or counts. */
export interface SectionClassifyRequest {
  schemaVersion: 1;
  snapshotId: string;
  site: SiteDescriptor;
  sections: Array<{
    sectionId: string;
    parentSectionId?: string;
    title?: string;
    labels: string[];
    controlKinds: SectionControlKind[];
    repeated: boolean;
  }>;
}

export type GenericAnalysisStatus =
  "COMPLETE" | "STATIC_POLICY_PRESENT" | "POLICY_UNAVAILABLE";

export interface SectionClassifyResponse {
  schemaVersion: 1;
  snapshotId: string;
  status: GenericAnalysisStatus;
  sections: Array<{ sectionId: string; category: string; confidence: number }>;
}

export interface GenericFieldsSection {
  sectionId: string;
  parentSectionId?: string;
  displayName?: string;
  fields: FieldCandidate[];
  items?: FieldsItem[];
  category?: string;
}

export interface GenericFieldsRequest {
  schemaVersion: 2;
  supportedWriteCommands?: ["SELECT_DATE"];
  snapshotId: string;
  site: SiteDescriptor;
  sections: GenericFieldsSection[];
}

export interface GenericFieldsResponse {
  schemaVersion: 3;
  snapshotId: string;
  status: GenericAnalysisStatus;
  fields: Array<{
    candidateId: string;
    profileFieldKey: string | null;
    confidence: number;
    categoryConfirmed: boolean;
    reason?: "LLM_UNAVAILABLE";
    binding?:
      | {
          type: "DERIVED";
          recipe:
            | "KOREAN_FULL_NAME"
            | "ENGLISH_FULL_NAME_GIVEN_FIRST"
            | "ENGLISH_FULL_NAME_FAMILY_FIRST";
        }
      | { type: "DATE_PART"; part: "YEAR" | "MONTH" | "DAY" };
    /** Present when profileFieldKey or a derived name binding is set. */
    autofillPolicy?: MatchedFieldAnalysis["autofillPolicy"];
    /** BLOCKED when neither profileFieldKey nor binding is present. */
    interactionStatus: MatchedFieldAnalysis["interactionStatus"];
    /** Only when interactionStatus is READY. */
    writePlan?: { command: WriteCommand };
  }>;
  diagnostics: { jevCalls: number; elapsedMs: number };
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
  | "CHECK_CHECKBOX"
  | "SELECT_DATE";

export type DerivedRecipe =
  | "KOREAN_FULL_NAME"
  | "ENGLISH_FULL_NAME_GIVEN_FIRST"
  | "ENGLISH_FULL_NAME_FAMILY_FIRST"
  | "BOOLEAN_YN"
  | "YEAR_MONTH"
  | "UNIVERSITY_ADDITIONAL_MAJOR_1_NAME"
  | "UNIVERSITY_ADDITIONAL_MAJOR_1_CLASSIFICATION"
  | "UNIVERSITY_ADDITIONAL_MAJOR_2_NAME"
  | "UNIVERSITY_ADDITIONAL_MAJOR_2_CLASSIFICATION"
  | "UNIVERSITY_ADDITIONAL_MAJOR_1_FIELD"
  | "UNIVERSITY_ADDITIONAL_MAJOR_2_FIELD";

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
  executionPolicy?: import("../workflow/execution-policy").ExecutionPolicy;
  snapshotId: string;
  mode: AnalysisMode;
  analysisStatus: AnalysisStatus;
  fields: FieldAnalysis[];
  warningCodes?: ("UNRESOLVED_FIELD" | "LLM_UNAVAILABLE")[];
  blockCode?: "ADAPTER_STRUCTURE_MISMATCH" | "ADAPTER_POLICY_UNAVAILABLE";
}

export interface AnalysisApiClient {
  loadExecutionPolicy?(
    site: SiteDescriptor,
  ): Promise<
    import("../workflow/execution-policy").ExecutionPolicy | undefined
  >;
  readonly quality?: import("../quality/observation").QualityObservation;
  decideInteractions?(
    request: InteractionDecisionRequest,
  ): Promise<InteractionDecisionResponse>;
  classifySections?(
    request: SectionClassifyRequest,
  ): Promise<SectionClassifyResponse>;
  analyzeGenericFields?(
    request: GenericFieldsRequest,
  ): Promise<GenericFieldsResponse>;
  analyzePreparation(
    request: PreparationAnalyzeRequest,
  ): Promise<PreparationAnalyzeResponse>;
  analyzeFields(request: FieldsAnalyzeRequest): Promise<FieldsAnalyzeResponse>;
}
