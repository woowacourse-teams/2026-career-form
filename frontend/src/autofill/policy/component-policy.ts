import { validSyncPlan, type SyncStep } from "./sync-plan";
import { validFlowProgram, type FlowProgram } from "./flow-plan";
import { validDomPlan, type DomPlan } from "./action-plan";
import { validRuntimeRules } from "./runtime-rules";
import {
  validComponentSelectors,
  type ComponentSelectors,
} from "./component-dom";
import { executionPolicy } from "../workflow/execution-policy";
import type { RepeatedProfileCategoryId } from "../../profile/model";
export type ComponentCapability =
  | "commit"
  | "search"
  | "calendar"
  | "address"
  | "nestedRepeat"
  | "pairedNumber"
  | "employment";
export interface ComponentPolicy {
  capabilities: ComponentCapability[];
  runtimeRules?: import("./runtime-rules").RuntimeRules;
  selectors: ComponentSelectors;
  structure: {
    addressReadOnly: boolean[];
    addressRows: string;
    addressParts: string;
    addressPartLabel: string;
    addressSearchInput: string;
    sectionAddRelation: "DIRECT_CHILD" | "DESCENDANT";
    dayDateFieldNames: string[];
  };
  widget: {
    optionCodeAttribute: string;
    calendarViewAttribute: string;
    monthView: string;
    dayView: string;
    stateAttribute: string;
    openState: string;
    monthSeparator: string;
    daySeparator: string;
    monthLabelTemplate: string;
    placeholderAttributes: string[];
    searchPlaceholderAttribute: string;
    languagePlaceholder: string;
    directCodeTemplate: string;
    popupRootDepth: number;
    popupPositionerDepth: number;
    ignorePositionerAriaHidden: boolean;
  };
  workflow: {
    requireVerifiedMapping: boolean;
    refreshAfterPass: boolean;
    rebindReplacedControls: boolean;
    captureDriverResults: boolean;
    emailProfileKey: string;
  };
  emailBridge: {
    selectors: { field: string; input: string; row: string; label: string };
    plans: { commit: DomPlan };
    ownership: { excludeRows: boolean; labelCount: number; inputCount: number };
    ackTimeoutMs: number;
    flow: FlowProgram;
    entrypoints: { acceptance: string; close: string };
  };
  writeRecipes: {
    name: string;
    key: string;
    command: string;
    inputTypes: string[];
    stage: number;
    plan: SyncStep[];
  }[];
  searchFlows: {
    program: FlowProgram;
    afterSelection: string;
    retainedCompletion: string;
    cleanup: string;
  };
  addressCleanup: { program: FlowProgram; entrypoint: string };
  completions: {
    plan: string;
    key: string;
    name: string;
    enabled: boolean;
    stage: number;
    failureMessage: string;
  }[];
  actionPlans: Record<string, DomPlan>;
  syntheticFields: {
    selector: string;
    labels: string[];
    name: string;
    excludeRows: boolean;
    count: number;
  }[];
  scopedSearches: {
    key: string;
    name: string;
    label: string;
    excludeRows: boolean;
    count: number;
    navigationLimit: number;
  }[];
  failureScope: {
    selector: string;
    memberSelector: string;
    memberCount: number;
  };
  addressStructure: {
    labelCount: number;
    labelRead: "REMOVE_PREFIX" | "TEXT";
    resultLabelCount: number;
  };
  retainedSearchVerification?: "REOPEN_SELECTION" | "RECORDED_VALUE";
  gpa: {
    scoreSuffix: string;
    scaleSuffix: string;
    scalePart: string;
    placeholder: string;
  };
  languageSuffix: string;
  emailStage: number;
  groups: { education: string[]; university: string; employment: string };
  major: {
    parts: {
      suffix: string;
      selector: string;
      required: boolean;
      read: "VALUE" | "TEXT";
    }[];
    additionalTypes: string[];
    fields: string[];
    maxRows: number;
    freshCounts: number[];
    rowSuffix: string;
    classificationSuffix: string;
    fieldSuffix: string;
  };
  actionPrefix: string;
  addressAction: string;
  freshDefaults: {
    value: string;
    pattern: string;
    binding: "DIRECT" | "DERIVED";
    key: string;
  }[];
  directSearch: {
    code: string;
    labelPrefix: string;
    labelSuffix: string;
    normalNavigationLimit: number;
  };
  displayFormats: {
    pattern: string;
    key: string;
    mode: "DECIMAL" | "HYPHEN_INSENSITIVE";
    control: string;
    valuePattern: string;
  }[];
  schemaVersion: 1;
  engine: "ARIA_COMPONENTS";
  sections: Record<
    string,
    {
      label: string;
      prefix: string;
      group: string;
      anchor: string;
      singleton: boolean;
    }
  >;
  radioGroups: Record<
    string,
    {
      suffix: string;
      options: string[];
      scope: "DOCUMENT" | "ROW";
      prefix?: string;
      allowedGroups: string[];
    }
  >;
  topLevelLabels: Record<string, string>;
  buttonFieldsByGroup: Record<string, string>;
  patterns: Record<string, string>;
  fieldNames: {
    email: string;
    nationality: string;
    birthDate: string;
    personalPrefix: string;
    veteranNumber: string;
  };
  labels: {
    emailConfirmation: string;
    email: string[];
    nationality: string;
    address: string;
    addressTrigger: string;
    addressResult: string;
    postalResult: string;
    add: string;
    majorAdd: string;
    major: string;
    defaultMajor: string;
    employed: string;
    retired: string;
    employmentOptions: string[];
  };
  addressNames: string[];
  basicNames: string[];
  stages: { commands: string[]; pattern: string; stage: number }[];
  driverCommands: string[];
  driverPattern: string;
  failureCommands: string[];
  failurePattern: string;
  dateRules: { pattern: string; key: string; precision: "month" | "day" }[];
  searchKinds: {
    kind: string;
    pattern: string;
    matchMode?: "NAME_ONLY" | "NAME_AND_DETAIL";
  }[];
  profileSections: Record<
    string,
    { categoryId: RepeatedProfileCategoryId; sectionId: string }
  >;
}
export function componentPolicy(document: Document): ComponentPolicy {
  const policy = executionPolicy(document)?.componentPolicy;
  if (!policy) throw new Error("화면 실행 정책을 불러오지 못했습니다.");
  return policy;
}
export function componentPattern(document: Document, key: string): RegExp {
  const source = componentPolicy(document).patterns[key];
  if (!source) return new RegExp("(?!)");
  return new RegExp(source);
}
const selector = (v: unknown): boolean => {
  if (typeof v !== "string" || !v || v.length > 1000) return false;
  try {
    if (typeof document !== "undefined")
      document.createDocumentFragment().querySelector(v);
    return true;
  } catch {
    return false;
  }
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 1000;
const texts = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 128 && v.every(text);
const pattern = (v: unknown) => {
  if (!text(v)) return false;
  try {
    new RegExp(v);
    return true;
  } catch {
    return false;
  }
};
const entries = (v: unknown, check: (v: any) => boolean) =>
  object(v) && Object.keys(v).length <= 128 && Object.values(v).every(check);
export function validComponentPolicy(v: unknown): v is ComponentPolicy {
  if (!object(v) || v.schemaVersion !== 1 || v.engine !== "ARIA_COMPONENTS")
    return false;
  const p = v as unknown as ComponentPolicy;
  if (
    !Array.isArray(p.capabilities) ||
    !p.capabilities.every((c) =>
      [
        "commit",
        "search",
        "calendar",
        "address",
        "nestedRepeat",
        "pairedNumber",
        "employment",
      ].includes(c),
    ) ||
    new Set(p.capabilities).size !== p.capabilities.length
  )
    return false;
  const has = (name: ComponentCapability) => p.capabilities.includes(name);
  const featureRuntime: Partial<Record<ComponentCapability, string>> = {
    search: "search",
    calendar: "calendar",
    address: "address",
    nestedRepeat: "major",
    pairedNumber: "gpa",
    employment: "employment",
  };
  if (
    !p.runtimeRules?.components ||
    Object.entries(featureRuntime).some(
      ([feature, key]) =>
        has(feature as ComponentCapability) &&
        !Object.hasOwn(p.runtimeRules!.components!, key!),
    )
  )
    return false;

  const featureSelectors: Partial<Record<ComponentCapability, string[]>> = {
    search: [
      "openSearchPopup",
      "scrollRoot",
      "searchPositioner",
      "checkedItem",
      "optionDetail",
      "optionDecoration",
      "searchInput",
      "searchItem",
      "checkedSearchItem",
      "codedSearchItem",
      "searchOption",
      "searchPopup",
    ],
    calendar: [
      "calendarTrigger",
      "calendarPopup",
      "calendarInput",
      "calendarCells",
      "calendarClear",
      "calendarRoot",
      "calendarValue",
    ],
    address: ["addressResults", "openDialog", "dialogClose"],
    commit: ["unnamedEmail"],
  };
  if (
    Object.entries(featureSelectors).some(
      ([feature, keys]) =>
        has(feature as ComponentCapability) &&
        !validComponentSelectors(p.selectors, keys),
    )
  )
    return false;
  return (
    Array.isArray(p.syntheticFields) &&
    p.syntheticFields.every(
      (s) =>
        object(s) &&
        selector(s.selector) &&
        texts(s.labels) &&
        text(s.name) &&
        typeof s.excludeRows === "boolean" &&
        Number.isInteger(s.count) &&
        s.count > 0 &&
        s.count <= 32,
    ) &&
    (!has("search") || Array.isArray(p.scopedSearches)) &&
    (!has("search") ||
      p.scopedSearches.every(
        (s) =>
          object(s) &&
          text(s.key) &&
          text(s.name) &&
          text(s.label) &&
          typeof s.excludeRows === "boolean" &&
          Number.isInteger(s.count) &&
          s.count > 0 &&
          Number.isInteger(s.navigationLimit) &&
          s.navigationLimit > 0 &&
          s.navigationLimit <= 1000,
      )) &&
    object(p.failureScope) &&
    selector(p.failureScope.selector) &&
    selector(p.failureScope.memberSelector) &&
    Number.isInteger(p.failureScope.memberCount) &&
    p.failureScope.memberCount > 0 &&
    (!has("address") || object(p.addressStructure)) &&
    (!has("address") ||
      [
        p.addressStructure.labelCount,
        p.addressStructure.resultLabelCount,
      ].every((n) => Number.isInteger(n) && n > 0 && n <= 16)) &&
    (!has("address") ||
      ["REMOVE_PREFIX", "TEXT"].includes(p.addressStructure.labelRead)) &&
    (!has("commit") ||
      (Array.isArray(p.writeRecipes) &&
        p.writeRecipes.length <= 32 &&
        new Set(p.writeRecipes.map((r) => r?.name)).size ===
          p.writeRecipes.length &&
        p.writeRecipes.every(
          (r) =>
            object(r) &&
            text(r.name) &&
            text(r.key) &&
            text(r.command) &&
            Array.isArray(r.inputTypes) &&
            r.inputTypes.length > 0 &&
            r.inputTypes.every(text) &&
            Number.isInteger(r.stage) &&
            r.stage >= 0 &&
            r.stage <= 20 &&
            validSyncPlan(r.plan),
        ))) &&
    (!has("search") ||
      (object(p.searchFlows) &&
        validFlowProgram(p.searchFlows.program) &&
        [
          p.searchFlows.afterSelection,
          p.searchFlows.cleanup,
          p.searchFlows.retainedCompletion,
        ].every(
          (n) => text(n) && p.searchFlows.program.plans[n]?.realm === "LOCAL",
        ))) &&
    (!has("address") ||
      (object(p.addressCleanup) &&
        validFlowProgram(p.addressCleanup.program) &&
        text(p.addressCleanup.entrypoint) &&
        p.addressCleanup.program.plans[p.addressCleanup.entrypoint]?.realm ===
          "LOCAL")) &&
    (!has("commit") || Array.isArray(p.completions)) &&
    (!has("commit") || p.completions.length <= 32) &&
    (!has("commit") ||
      p.completions.every(
        (c) =>
          object(c) &&
          text(c.key) &&
          text(c.name) &&
          typeof c.enabled === "boolean" &&
          Number.isInteger(c.stage) &&
          c.stage >= 0 &&
          c.stage <= 20 &&
          text(c.failureMessage) &&
          text(c.plan) &&
          p.emailBridge?.flow?.plans?.[c.plan]?.realm === "LOCAL",
      )) &&
    entries(p.actionPlans, validDomPlan) &&
    [
      [
        "search",
        [
          "searchActivate",
          "searchWrite",
          "searchOpen",
          "searchClose",
          "searchReopen",
        ],
      ],
      ["calendar", ["calendarWrite", "calendarClear"]],
      ["address", ["addressSearch"]],
    ].every(
      ([feature, keys]) =>
        !has(feature as ComponentCapability) ||
        (keys as string[]).every((k) => validDomPlan(p.actionPlans[k])),
    ) &&
    validComponentSelectors(p.selectors, [
      "field",
      "row",
      "fieldLabel",
      "section",
      "extraFields",
      "fieldGroup",
      "radioGroup",
      "radioOption",
      "collectedRadioOption",
      "addTrigger",
      "choicePopup",
    ]) &&
    validRuntimeRules(p.runtimeRules) &&
    !!p.runtimeRules?.components &&
    object(p.structure) &&
    (!has("address") || Array.isArray(p.structure.addressReadOnly)) &&
    (!has("address") ||
      p.structure.addressReadOnly.length ===
        p.runtimeRules.components.address.fieldCount) &&
    (!has("address") ||
      p.structure.addressReadOnly.every((x) => typeof x === "boolean")) &&
    (!has("address") ||
      [
        p.structure.addressRows,
        p.structure.addressParts,
        p.structure.addressPartLabel,
        p.structure.addressSearchInput,
      ].every(selector)) &&
    ["DIRECT_CHILD", "DESCENDANT"].includes(p.structure.sectionAddRelation) &&
    (!has("calendar") || texts(p.structure.dayDateFieldNames)) &&
    object(p.widget) &&
    Object.values(p.widget).every(
      (v) =>
        typeof v === "string" ||
        typeof v === "boolean" ||
        typeof v === "number" ||
        (Array.isArray(v) && v.every((x) => typeof x === "string")),
    ) &&
    texts(p.widget.placeholderAttributes) &&
    (!has("search") ||
      [
        p.widget.searchPlaceholderAttribute,
        p.widget.languagePlaceholder,
        p.widget.directCodeTemplate,
      ].every(text)) &&
    (!has("search") ||
      [p.widget.popupRootDepth, p.widget.popupPositionerDepth].every(
        (x) => Number.isInteger(x) && x > 0 && x <= 8,
      )) &&
    (!has("search") ||
      typeof p.widget.ignorePositionerAriaHidden === "boolean") &&
    object(p.workflow) &&
    (!has("commit") || text(p.workflow.emailProfileKey)) &&
    [
      p.workflow.requireVerifiedMapping,
      p.workflow.refreshAfterPass,
      p.workflow.rebindReplacedControls,
      p.workflow.captureDriverResults,
    ].every((x) => typeof x === "boolean") &&
    (!has("commit") ||
      (object(p.emailBridge) &&
        ["field", "input", "row", "label"].every((k) =>
          selector((p.emailBridge.selectors as any)?.[k]),
        ) &&
        validDomPlan(p.emailBridge.plans?.commit) &&
        validFlowProgram(p.emailBridge.flow) &&
        object(p.emailBridge.entrypoints) &&
        [
          p.emailBridge.entrypoints.acceptance,
          p.emailBridge.entrypoints.close,
        ].every(
          (n) => text(n) && p.emailBridge.flow.plans[n]?.realm === "LOCAL",
        ) &&
        object(p.emailBridge.ownership) &&
        typeof p.emailBridge.ownership.excludeRows === "boolean" &&
        [
          p.emailBridge.ownership.labelCount,
          p.emailBridge.ownership.inputCount,
        ].every((n) => Number.isInteger(n) && n > 0 && n <= 8) &&
        Number.isInteger(p.emailBridge.ackTimeoutMs) &&
        p.emailBridge.ackTimeoutMs > 0 &&
        p.emailBridge.ackTimeoutMs <= 10000)) &&
    (!has("pairedNumber") || object(p.gpa)) &&
    (!has("pairedNumber") ||
      [
        p.gpa.scoreSuffix,
        p.gpa.scaleSuffix,
        p.gpa.scalePart,
        p.gpa.placeholder,
      ].every(text)) &&
    (!has("commit") || Number.isInteger(p.emailStage)) &&
    (!has("commit") || p.emailStage >= 0) &&
    (!has("commit") || p.emailStage <= 20) &&
    object(p.groups) &&
    (!has("nestedRepeat") || texts(p.groups.education)) &&
    (!has("nestedRepeat") || text(p.groups.university)) &&
    (!has("employment") || text(p.groups.employment)) &&
    (!has("nestedRepeat") || object(p.major)) &&
    (!has("nestedRepeat") || Array.isArray(p.major.parts)) &&
    (!has("nestedRepeat") || p.major.parts.length > 0) &&
    (!has("nestedRepeat") || p.major.parts.length <= 16) &&
    (!has("nestedRepeat") ||
      p.major.parts.every(
        (part) =>
          object(part) &&
          typeof part.suffix === "string" &&
          selector(part.selector) &&
          typeof part.required === "boolean" &&
          ["VALUE", "TEXT"].includes(part.read),
      )) &&
    (!has("nestedRepeat") || texts(p.major.additionalTypes)) &&
    (!has("nestedRepeat") || texts(p.major.fields)) &&
    (!has("nestedRepeat") || Number.isInteger(p.major.maxRows)) &&
    (!has("nestedRepeat") || p.major.maxRows > 0) &&
    (!has("nestedRepeat") || p.major.maxRows <= 20) &&
    (!has("nestedRepeat") || Array.isArray(p.major.freshCounts)) &&
    (!has("nestedRepeat") ||
      p.major.freshCounts.every(
        (n) => Number.isInteger(n) && n > 0 && n <= p.major.maxRows,
      )) &&
    (!has("nestedRepeat") ||
      [
        p.major.rowSuffix,
        p.major.classificationSuffix,
        p.major.fieldSuffix,
      ].every(text)) &&
    (!has("nestedRepeat") || pattern(p.patterns?.majorAction)) &&
    text(p.actionPrefix) &&
    (!has("address") || text(p.addressAction)) &&
    (!has("commit") || text(p.labels?.emailConfirmation)) &&
    (!has("nestedRepeat") || Array.isArray(p.freshDefaults)) &&
    (!has("nestedRepeat") || p.freshDefaults.length <= 32) &&
    (!has("nestedRepeat") ||
      p.freshDefaults.every(
        (s) =>
          object(s) &&
          text(s.value) &&
          pattern(s.pattern) &&
          ["DIRECT", "DERIVED"].includes(s.binding) &&
          text(s.key),
      )) &&
    (!has("search") || object(p.directSearch)) &&
    (!has("search") ||
      [
        p.directSearch.code,
        p.directSearch.labelPrefix,
        p.directSearch.labelSuffix,
      ].every(text)) &&
    (!has("search") ||
      [p.directSearch.normalNavigationLimit].every(
        (n) => Number.isInteger(n) && n > 0 && n <= 512,
      )) &&
    (!has("search") ||
      p.retainedSearchVerification === undefined ||
      ["REOPEN_SELECTION", "RECORDED_VALUE"].includes(
        p.retainedSearchVerification,
      )) &&
    Array.isArray(p.displayFormats) &&
    p.displayFormats.length <= 32 &&
    p.displayFormats.every(
      (s) =>
        object(s) &&
        pattern(s.pattern) &&
        text(s.key) &&
        ["DECIMAL", "HYPHEN_INSENSITIVE"].includes(s.mode) &&
        ["text", "button"].includes(s.control) &&
        pattern(s.valuePattern),
    ) &&
    entries(
      p.sections,
      (s) =>
        object(s) &&
        [s.label, s.prefix, s.group, s.anchor].every(text) &&
        typeof s.singleton === "boolean",
    ) &&
    Object.keys(p.sections).length > 0 &&
    entries(
      p.radioGroups,
      (s) =>
        object(s) &&
        text(s.suffix) &&
        texts(s.options) &&
        ["DOCUMENT", "ROW"].includes(String(s.scope)) &&
        texts(s.allowedGroups) &&
        (s.scope !== "DOCUMENT" || text(s.prefix)),
    ) &&
    entries(p.topLevelLabels, text) &&
    entries(p.buttonFieldsByGroup, pattern) &&
    entries(p.patterns, pattern) &&
    object(p.fieldNames) &&
    Object.values(p.fieldNames).every(
      (v) => typeof v === "string" && v.length <= 1000,
    ) &&
    object(p.labels) &&
    Object.values(p.labels).every((v) =>
      Array.isArray(v) ? texts(v) : text(v),
    ) &&
    (!has("address") || texts(p.addressNames)) &&
    (!has("address") ||
      p.addressNames.length === p.runtimeRules.components.address.fieldCount) &&
    (!has("address") ||
      new Set(p.addressNames).size === p.addressNames.length) &&
    texts(p.basicNames) &&
    p.basicNames.length > 0 &&
    Array.isArray(p.stages) &&
    p.stages.length <= 32 &&
    p.stages.every(
      (s) =>
        object(s) &&
        texts(s.commands) &&
        pattern(s.pattern) &&
        Number.isInteger(s.stage) &&
        s.stage >= 0 &&
        s.stage <= 20,
    ) &&
    texts(p.driverCommands) &&
    pattern(p.driverPattern) &&
    texts(p.failureCommands) &&
    pattern(p.failurePattern) &&
    (!has("calendar") || Array.isArray(p.dateRules)) &&
    (!has("calendar") || p.dateRules.length <= 64) &&
    (!has("calendar") ||
      p.dateRules.every(
        (s) =>
          object(s) &&
          pattern(s.pattern) &&
          text(s.key) &&
          ["month", "day"].includes(s.precision),
      )) &&
    (!has("search") || Array.isArray(p.searchKinds)) &&
    (!has("search") || p.searchKinds.length <= 32) &&
    (!has("search") ||
      p.searchKinds.every(
        (s) =>
          object(s) &&
          text(s.kind) &&
          pattern(s.pattern) &&
          (s.matchMode === undefined ||
            ["NAME_ONLY", "NAME_AND_DETAIL"].includes(s.matchMode as string)),
      )) &&
    entries(
      p.profileSections,
      (s) =>
        object(s) &&
        [
          "education",
          "careers",
          "languages",
          "projects",
          "certifications",
        ].includes(s.categoryId as string) &&
        text(s.sectionId),
    )
  );
}

export function componentCapability(
  document: Document,
  capability: ComponentCapability,
): boolean {
  return (
    executionPolicy(document)?.componentPolicy?.capabilities?.includes(
      capability,
    ) ?? false
  );
}
