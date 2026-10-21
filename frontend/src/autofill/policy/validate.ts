import { validNativeForm } from "./native-form-contract";
import { validRuntimeRules } from "./runtime-rules";
import { validHiddenCodeContract } from "./hidden-code/contract";
import type { BrowserPolicy } from "./types";
// Policies contain data only. Bound lists, validate selectors and reject executable values.
export function validBrowserPolicy(value: unknown): value is BrowserPolicy {
  if (!value || typeof value !== "object") return false;
  const p = value as BrowserPolicy;
  if (p.schemaVersion === 2) {
    if (
      Object.keys(p).some(
        (k) =>
          ![
            "schemaVersion",
            "nativeForm",
            "runtimeRules",
            "fields",
            "normalizations",
            "reveals",
            "collection",
            "repeatHints",
            "educationHints",
            "freshRowFields",
            "freshDefaults",
            "stateDrivers",
            "searchStageBase",
            "searchRowStride",
            "refreshAfterPass",
            "diagnosticsTitle",
            "addressAction",
            "mainWorldBridge",
          ].includes(k),
      )
    )
      return false;
    if (
      p.runtimeRules &&
      Object.keys(p.runtimeRules).some(
        (k) =>
          ![
            "sectionSelector",
            "presentationSelector",
            "placeholderAttributes",
            "placeholderValues",
          ].includes(k),
      )
    )
      return false;
    const { nativeForm, ...base } = p;
    return (
      validNativeForm(nativeForm) &&
      Array.isArray(p.fields) &&
      Array.isArray(p.collection?.actions) &&
      Array.isArray(p.reveals) &&
      Array.isArray(p.stateDrivers) &&
      p.fields.length === 0 &&
      p.collection.actions.length === 0 &&
      p.reveals.length === 0 &&
      p.stateDrivers.length === 0 &&
      !p.hiddenCodeContract &&
      p.mainWorldBridge === "NONE" &&
      validBrowserPolicy({ ...base, schemaVersion: 1 })
    );
  }
  const str = (x: unknown): x is string =>
    typeof x === "string" && x.length > 0 && x.length <= 1500;
  const list = (x: unknown): x is string[] =>
    Array.isArray(x) && x.length <= 256 && x.every(str);
  const map = (x: unknown): x is Record<string, string> =>
    !!x &&
    typeof x === "object" &&
    !Array.isArray(x) &&
    Object.entries(x).length <= 256 &&
    Object.entries(x).every(
      ([k, v]) =>
        str(k) &&
        str(v) &&
        !["__proto__", "constructor", "prototype"].includes(k),
    );
  const pattern = (x: string) => {
    try {
      new RegExp(x);
      return x.length <= 1500;
    } catch {
      return false;
    }
  };
  const optionalBool = (x: unknown) =>
    x === undefined || typeof x === "boolean";
  const selector = (x: unknown) =>
    str(x) &&
    (() => {
      try {
        if (typeof document !== "undefined")
          document.createDocumentFragment().querySelector(x);
        return true;
      } catch {
        return false;
      }
    })();
  const name = (x: unknown) => str(x) && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(x);
  return (
    p.schemaVersion === 1 &&
    validRuntimeRules(p.runtimeRules) &&
    (!p.hiddenCodeContract || !!p.runtimeRules?.hiddenCode) &&
    (p.mainWorldBridge !== "JQUERY_AUTOCOMPLETE" ||
      !!p.runtimeRules?.autocomplete) &&
    (p.completionAutocompleteSelector === undefined ||
      selector(p.completionAutocompleteSelector)) &&
    (p.resultComparisons === undefined ||
      (Array.isArray(p.resultComparisons) &&
        p.resultComparisons.length <= 64 &&
        p.resultComparisons.every(
          (r) => r && name(r.name) && str(r.key) && r.mode === "GROUPED_NUMBER",
        ) &&
        new Set(p.resultComparisons.map((r) => r.name)).size ===
          p.resultComparisons.length)) &&
    (p.presentationGroups === undefined ||
      (!!p.presentationGroups &&
        selector(p.presentationGroups.rootSelector) &&
        selector(p.presentationGroups.fieldSelector) &&
        Array.isArray(p.presentationGroups.families) &&
        p.presentationGroups.families.length <= 32 &&
        p.presentationGroups.families.every(list))) &&
    (p.hiddenCodeContract === undefined ||
      validHiddenCodeContract(p.hiddenCodeContract)) &&
    (p.addressVerification === undefined ||
      p.addressVerification === "POSTAL_AND_ROAD_WITHOUT_REFERENCE") &&
    (p.failureDependencies === undefined ||
      (!!p.failureDependencies &&
        typeof p.failureDependencies === "object" &&
        !Array.isArray(p.failureDependencies) &&
        Object.entries(p.failureDependencies).length <= 64 &&
        Object.entries(p.failureDependencies).every(
          ([key, values]) => name(key) && list(values) && values.every(name),
        ))) &&
    Array.isArray(p.fields) &&
    p.fields.length <= 256 &&
    p.fields.every(
      (r) =>
        r &&
        name(r.name) &&
        ["radio", "select", "text", "yearMonth", "blocked"].includes(r.kind) &&
        (r.kind === "blocked" ||
          (str(r.key) &&
            ["DIRECT", "LOOKUP", "DERIVED"].includes(r.binding ?? ""))) &&
        (r.radioValidation === undefined ||
          (r.kind === "radio" && r.radioValidation === "TARGET_ONLY")) &&
        optionalBool(r.acceptAlreadySelected) &&
        (r.kind !== "radio" || map(r.options)) &&
        (r.kind !== "select" || list(r.labels)) &&
        [r.overwrite, r.priority, r.requireAllOptions, r.reviewWritable].every(
          optionalBool,
        ) &&
        (r.details === undefined || list(r.details)) &&
        (r.stage == null ||
          (Number.isInteger(r.stage) && Math.abs(r.stage) <= 100)) &&
        (r.settleMs === undefined ||
          (Number.isInteger(r.settleMs) &&
            r.settleMs >= 0 &&
            r.settleMs <= 10000)) &&
        (r.gates === undefined ||
          (Array.isArray(r.gates) &&
            r.gates.length <= 32 &&
            r.gates.every((g) => g && name(g.name) && list(g.labels)))) &&
        (r.kind !== "yearMonth" ||
          (["text", "tel"].includes(r.inputType ?? "") &&
            Number.isInteger(r.maxLength) &&
            (r.maxLength ?? 0) > 0 &&
            (r.maxLength ?? 0) <= 32 &&
            r.inputFormat === "YYYYMM" &&
            r.resultFormat === "YYYY-MM")),
    ) &&
    new Set(p.fields.map((r) => r.name)).size === p.fields.length &&
    Array.isArray(p.normalizations) &&
    p.normalizations.length <= 64 &&
    p.normalizations.every((r) => r && list(r.keys) && map(r.values)) &&
    Array.isArray(p.reveals) &&
    p.reveals.length <= 64 &&
    p.reveals.every(
      (r) =>
        r &&
        name(r.domName) &&
        str(r.profileFieldKey) &&
        Number.isInteger(r.itemIndex) &&
        r.itemIndex >= 0 &&
        r.itemIndex < 128 &&
        map(r.values) &&
        typeof r.nameSuffixPattern === "string" &&
        (!r.nameSuffixPattern || pattern(r.nameSuffixPattern)),
    ) &&
    !!p.collection &&
    list(p.collection.sectionSelectors) &&
    p.collection.sectionSelectors.every(selector) &&
    list(p.collection.visiblePhases) &&
    typeof p.collection.collectsInputButtonFields === "boolean" &&
    Array.isArray(p.collection.actions) &&
    p.collection.actions.length <= 128 &&
    p.collection.actions.every(
      (r) =>
        r &&
        str(r.id) &&
        str(r.label) &&
        selector(r.selector) &&
        [
          r.parentSelector,
          r.grandparentSelector,
          r.rowSelector,
          r.rootSelector,
          r.assetSelector,
          r.requiredSelector,
        ].every((x) => x === undefined || selector(x)),
    ) &&
    !!p.repeatHints &&
    typeof p.repeatHints === "object" &&
    Object.values(p.repeatHints).every(
      (r) =>
        r &&
        [
          "education",
          "languages",
          "certifications",
          "careers",
          "projects",
          "publications",
          "health",
        ].includes(r.categoryId) &&
        str(r.sectionId),
    ) &&
    map(p.educationHints) &&
    Object.values(p.educationHints).every((v) =>
      ["highSchool", "university", "graduateSchool"].includes(v),
    ) &&
    list(p.freshRowFields) &&
    list(p.freshDefaults) &&
    Array.isArray(p.stateDrivers) &&
    p.stateDrivers.length <= 128 &&
    p.stateDrivers.every(
      (r) =>
        r &&
        name(r.name) &&
        str(r.key) &&
        ["DIRECT", "DERIVED", "LOOKUP"].includes(r.binding) &&
        (r.stage === undefined ||
          (Number.isInteger(r.stage) && Math.abs(r.stage) <= 100)),
    ) &&
    Number.isInteger(p.searchStageBase) &&
    Math.abs(p.searchStageBase) <= 100 &&
    Number.isInteger(p.searchRowStride) &&
    p.searchRowStride > 0 &&
    p.searchRowStride <= 100 &&
    typeof p.refreshAfterPass === "boolean" &&
    str(p.diagnosticsTitle) &&
    !!p.addressAction &&
    str(p.addressAction.domId) &&
    (p.addressAction.domName === undefined || name(p.addressAction.domName)) &&
    ["button", "input"].includes(p.addressAction.element) &&
    ["JQUERY_AUTOCOMPLETE", "NONE"].includes(p.mainWorldBridge)
  );
}
