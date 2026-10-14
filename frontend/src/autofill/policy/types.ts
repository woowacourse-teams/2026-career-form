import type { RepeatedProfileCategoryId } from "../../profile/model";
export interface Gate {
  name: string;
  labels: string[];
}
export interface FieldRule {
  name: string;
  kind: "radio" | "select" | "text" | "yearMonth" | "blocked";
  key?: string;
  binding?: "DIRECT" | "LOOKUP" | "DERIVED";
  recipe?: string | null;
  options?: Record<string, string>;
  labels?: string[];
  overwrite?: boolean;
  radioValidation?: "TARGET_ONLY";
  acceptAlreadySelected?: boolean;
  priority?: boolean;
  stage?: number | null;
  details?: string[];
  positiveLabel?: string;
  negativeLabel?: string;
  settleMs?: number;
  gates?: Gate[];
  requireAllOptions?: boolean;
  reviewWritable?: boolean;
  inputType?: string;
  maxLength?: number;
  inputFormat?: "YYYYMM";
  resultFormat?: "YYYY-MM";
}
export interface ActionRule {
  id: string;
  label: string;
  selector: string;
  parentSelector?: string;
  grandparentSelector?: string;
  rowSelector?: string;
  rootSelector?: string;
  assetSelector?: string;
  requiredSelector?: string;
}
export interface BrowserPolicy {
  runtimeRules?: import("./runtime-rules").RuntimeRules;
  completionAutocompleteSelector?: string;
  schemaVersion: 1;
  resultComparisons?: { name: string; key: string; mode: "GROUPED_NUMBER" }[];
  presentationGroups?: {
    rootSelector: string;
    fieldSelector: string;
    families: string[][];
  };
  hiddenCodeContract?: import("./hidden-code/contract").HiddenCodeContract;
  fields: FieldRule[];
  failureDependencies?: Record<string, string[]>;
  normalizations: { keys: string[]; values: Record<string, string> }[];
  reveals: {
    domName: string;
    profileFieldKey: string;
    itemIndex: number;
    values: Record<string, string>;
    nameSuffixPattern: string;
  }[];
  collection: {
    actions: ActionRule[];
    visiblePhases: string[];
    collectsInputButtonFields: boolean;
    sectionSelectors: string[];
  };
  repeatHints: Record<
    string,
    { categoryId: RepeatedProfileCategoryId; sectionId: string }
  >;
  educationHints: Record<
    string,
    "highSchool" | "university" | "graduateSchool"
  >;
  freshRowFields: string[];
  freshDefaults: string[];
  stateDrivers: {
    name: string;
    key: string;
    binding: string;
    stage?: number;
  }[];
  searchStageBase: number;
  searchRowStride: number;
  refreshAfterPass: boolean;
  diagnosticsTitle: string;
  addressAction: { domId: string; domName?: string; element: string };
  addressVerification?: "POSTAL_AND_ROAD_WITHOUT_REFERENCE";
  mainWorldBridge: "JQUERY_AUTOCOMPLETE" | "NONE";
}
