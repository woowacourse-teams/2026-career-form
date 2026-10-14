import type { DomCondition } from "./dom-condition";
import type { RepeatedProfileCategoryId } from "../../../profile/model";
export interface RuleMatch {
  field: string;
  key: string;
  command: string;
  group?: string;
}
export interface HiddenCodeBehavior {
  confirmations: Record<string, import("../action-plan").PlanCondition[]>;
  actionPlans: Record<string, import("../action-plan").DomPlan>;
  snapshots: Record<string, import("../dom-snapshot").SnapshotRule[]>;
  searchObservation: {
    childList: boolean;
    subtree: boolean;
    requireMutation: boolean;
  };
  datasetKeys: {
    autoApi: string;
    autoParams: string;
    autoType: string;
    code: string;
    codegb: string;
    disabled: string;
    enabled: string;
    result: string;
    search: string;
    searchResult: string;
    valid: string;
  };
  groupIdentity: {
    rootSelector: string;
    rules: { group: string; condition: DomCondition }[];
  };
  fixedCodeSearches: {
    name: string;
    key: string;
    options: Record<string, string>;
    attributes: Record<string, string>;
    displaySelector: string;
    hiddenSelector: string;
  }[];
  conditionalStates: {
    driver: string;
    code: string;
    label: string;
    controls: {
      id: string;
      disabled: boolean;
      required?: boolean;
      allowAbsent: boolean;
    }[];
  }[];
  dependencies: {
    fields: string[];
    driver: string;
    code: string;
    label: string;
  }[];
  rowKinds: {
    section: string;
    code: string;
    valueField?: string;
    value?: string;
  }[];
  rowPreparation: {
    alignment: import("../row-alignment").RowAlignmentPolicy;
    rowSelector: string;
    groupSelector: string;
    resetCode: string;
    resetOptionCount: number;
    requireCompleteOptions: boolean;
    selectSteps: ("OPEN_TRIGGER" | "CLICK_EXACT_OPTION" | "WAIT_REVEALED")[];
    resetSteps: ("OPEN_TRIGGER" | "CLICK_RESET" | "WAIT_EMPTY")[];
    sourceCategory: RepeatedProfileCategoryId;
    sectionOrder: string[];
    add: {
      sourcePosition: "FIRST" | "LAST";
      resultPosition: "FIRST" | "LAST";
      selector: string;
      reset: boolean;
      plan: import("../action-plan").DomPlan;
    };
    selectionOrder?: "AFTER_ALL_ROWS" | "BEFORE_NEXT_ROW";
    revealTemplates: string[][];
  };
  groupKinds: Record<string, [string, string]>;
  rowActions: {
    id: string;
    fields: {
      element: "input" | "textarea";
      idBase: string;
      name: string;
      type?: string;
    }[];
  }[];
  searches: {
    domName: string;
    hiddenName: string;
    autoType: string;
    params: string;
    profileFieldKey: string;
    group: string;
    allowDirectInput: boolean;
    directInputCode: string;
    catalogKind: string | null;
    resultMatch?: SearchResultMatchPolicy;
  }[];
  drivers: (RuleMatch & {
    stage: number;
    stride: number;
    handler: "NONE" | "CODED_SEARCH" | "FIXED_CODE_SEARCH";
    conditional: boolean;
    waitForOptions: boolean;
  })[];
  settlements: {
    field: string;
    scope: string;
    condition: DomCondition;
    fallbackSelector?: string;
    fallbackPlan?: import("../action-plan").DomPlan;
    failureCondition?: DomCondition;
    failureCode?: string;
    selectedCodeSelector?: string;
  }[];
  failureScopes: (RuleMatch & {
    scope: string;
    conditional: boolean;
    ancestor?: string;
    inputType?: string;
    attributes?: Record<string, string>;
    idPattern?: string;
    condition?: DomCondition;
  })[];
  repeatHints: Record<
    string,
    { categoryId: RepeatedProfileCategoryId; sectionId: string }
  >;
  prepareActionId: string;
  ownOptions: DomCondition;
  groupSections: Record<string, string>;
  textControls: {
    id: string;
    key: string;
    binding: "DIRECT" | "DERIVED";
    recipe: string | null;
    maxLength: number;
    attributes: Record<string, string>;
    pattern: { source: string; flags: string };
    ancestor: string;
  }[];
  codedButtons: {
    key: string;
    group: string;
    idPattern: string;
    attributes: Record<string, string>;
    hiddenSelector: string;
    codes: Record<string, string>;
  }[];
  catalogButtons: {
    key: string;
    kind: string;
    idPattern: string;
    hiddenSelector: string;
  }[];
  catalogTexts: {
    name: string;
    key: string;
    kind: string;
    forbiddenDataAttribute: string;
    forbiddenAncestor: string;
  }[];
  delegatedFields: string[];
  searchRejectedCodes: string[];
  address: {
    roles: { zip: number; address: number; detail: number; trigger: number };
    inputType: string;
    requireId: boolean;
    requireName: boolean;
    callbackTimeoutMs: number;
    callbackPollMs: number;
    existingValueGuards: {
      role: "zip" | "address" | "detail";
      comparison: "EXACT" | "NORMALIZED";
    }[];
    existingVerification: "NEVER" | "POSTAL_ONLY" | "POSTAL_AND_ADDRESS";
    detailWorkflow: import("../flow-plan").FlowProgram;
    detailEntrypoint: string;
    selection: "FIRST_VISIBLE";
    verification:
      "SELECTED_POSTAL_AND_ADDRESS" | "POSTAL_AND_ROAD_WITHOUT_REFERENCE";
    detailAfterSelection: "EMPTY" | "UNCHANGED";
    readOnlyFields: string[];
    requireClosed: boolean;
    requiredSelection: {
      selector: string;
      name: string;
      type: string;
      checked: boolean;
    };
  };
}

export interface SearchResultMatchPolicy {
  separator: string;
  nameReplacements: { from: string; to: string }[];
  detailSeparator: string;
  regionDetailIndexes: number[];
  regionReplacements: { from: string; to: string }[];
  unspecifiedRegions: string[];
}
