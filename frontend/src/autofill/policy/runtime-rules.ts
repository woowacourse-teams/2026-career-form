import { executionPolicy } from "../workflow/execution-policy";
import schema from "./runtime-rules-schema.json";
import { validPolicyData } from "./hidden-code/validate-data";
import type { RepeatedProfileCategoryId } from "../../profile/model";
export interface RuntimeRules {
  sectionSelector: string;
  presentationSelector: string;
  placeholderAttributes: string[];
  placeholderValues: string[];
  addressFields?: {
    selectorTemplate: string;
    inputType: string;
    requireId: boolean;
    requireName: boolean;
    readOnly: boolean[];
    zipIndex: number;
    addressIndex: number;
    detailIndex: number;
    requireClosed: boolean;
    requireDetailUnchanged: boolean;
    callbackMs: number;
    pollMs: number;
  };
  autocomplete?: {
    confirmationDataKey: string;
    confirmationValue: boolean;
    invalidResultIds: string[];
    readyCount: number;
  };
  hiddenCode?: {
    protectCatalogText: boolean;
    rowSelector: string;
    rowRelation: "DIRECT_CHILD" | "DESCENDANT";
    overwriteSelections: boolean;
    schoolMatch: {
      mode: "NAME_ONLY" | "NAME_AND_DETAIL";
      splitPosition: "FIRST" | "LAST";
      requireDetail: boolean;
      unspecifiedRegion: "REJECT" | "UNIQUE_CATALOG";
      requireUniqueCampus: boolean;
    };
  };
  components?: {
    fingerprint: {
      element: string;
      control: string;
      selector: string;
      count: number;
    };
    employment: {
      checkedValue: string;
      uncheckedValue: string;
      allowUncheck: boolean;
    };
    radio: { optionSelector: string; overwrite: boolean };
    gpa: {
      requirePair: boolean;
      scaleBeforeScore: boolean;
      scoreSelector: string;
      scaleSelector: string;
    };
    row: {
      separator: string;
      indexPattern: string;
      singletonIndex: number;
      maxIndex: number;
      requireContiguous: boolean;
    };
    major: {
      startIndex: number;
      requireContiguous: boolean;
      actionTemplate: string;
      requiredParts: ("name" | "classification" | "field")[];
      nameSelector: string;
      classificationSelector: string;
      fieldSelector: string;
      baseCount: number;
      newRowPosition: "FIRST" | "LAST";
      sourceCategory: RepeatedProfileCategoryId;
    };
    search: {
      preferCatalogOptions: boolean;
      languageQualifierKinds: string[];
      languageSuffixTemplate: string;
      selectionMode: "CLICK" | "KEYBOARD_WHEN_IDENTIFIED";
      confirmationMode: "VALUE" | "CHECKED_OPTION";
      closedPopup: "UNMOUNTED" | "HIDDEN_OR_UNMOUNTED";
    };
    address: {
      selectionStrategy: "FIRST_RESULT";
      protectExisting: boolean;
      fieldCount: number;
      verification: "POSTAL_ONLY" | "POSTAL_AND_ADDRESS";
      requireClosed: boolean;
      zipIndex: number;
      addressIndex: number;
      detailIndex: number;
    };
    calendar: {
      clearMismatchedNewValue: boolean;
      clearControlCount: number;
      allowDayFallback: boolean;
      resultMonthPattern: string;
      resultDayPattern: string;
      resultSeparatorPattern: string;
    };
    collection: {
      includeSearchOptions: boolean;
      ownedLabelsOnly: boolean;
      revalidateAdapterRows: boolean;
    };
    workflow: {
      settleEmailSuggestions: boolean;
      verifySettledValues: boolean;
      requireAdapterResponse: boolean;
      enforceUniqueEmail: boolean;
      emailCommitDriver: boolean;
      driverFailureLabel: boolean;
    };
    timeouts: {
      defaultMs: number;
      pollMs: number;
      searchMs: number;
      navigationMs: number;
      addressCloseMs: number;
    };
  };
}
export function runtimeRules(document: Document): RuntimeRules | undefined {
  const policy = executionPolicy(document);
  return (
    policy?.browserPolicy?.runtimeRules ?? policy?.componentPolicy?.runtimeRules
  );
}
export function componentRules(
  document: Document,
): NonNullable<RuntimeRules["components"]> {
  const rules = runtimeRules(document)?.components;
  if (!rules) throw new Error("Missing component execution rules");
  return rules;
}
export function hiddenCodeRules(
  document: Document,
): NonNullable<RuntimeRules["hiddenCode"]> {
  const rules = runtimeRules(document)?.hiddenCode;
  if (!rules) throw new Error("Missing hidden-code execution rules");
  return rules;
}
export function namedSelector(template: string, name: string): string {
  return template.replaceAll("{name}", CSS.escape(name));
}
export function componentName(
  document: Document,
  ...parts: (string | number)[]
): string {
  return parts.join(componentRules(document).row.separator);
}
export function validRuntimeRules(value: unknown): value is RuntimeRules {
  if (!validPolicyData(value, schema)) return false;
  const v = value as RuntimeRules;
  try {
    const walk = (node: unknown, key = ""): boolean => {
      if (typeof node === "number")
        return Number.isInteger(node) && node >= 0 && node <= 10000;
      if (typeof node === "string") {
        if (
          (key.endsWith("Selector") ||
            key === "separator" ||
            key === "confirmationDataKey") &&
          !node
        )
          return false;
        if (key.endsWith("Pattern")) new RegExp(node);
        if (key.endsWith("Selector") && typeof document !== "undefined")
          document
            .createDocumentFragment()
            .querySelector(node.replaceAll("{name}", "field"));
      }
      if (Array.isArray(node)) return node.every((x) => walk(x, key));
      if (node && typeof node === "object")
        return Object.entries(node).every(([k, x]) => walk(x, k));
      return true;
    };
    if (!walk(v)) return false;
    if (
      v.autocomplete &&
      (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(v.autocomplete.confirmationDataKey) ||
        v.autocomplete.invalidResultIds.length > 64 ||
        v.autocomplete.invalidResultIds.some((x) => x.length > 128))
    )
      return false;
    if (v.addressFields) {
      const a = v.addressFields;
      const indices = [a.zipIndex, a.addressIndex, a.detailIndex];
      if (
        new Set(indices).size !== indices.length ||
        indices.some((i) => i >= a.readOnly.length) ||
        !a.pollMs ||
        !a.callbackMs ||
        !a.selectorTemplate.includes("{name}")
      )
        return false;
      if (typeof document !== "undefined")
        document
          .createDocumentFragment()
          .querySelector(a.selectorTemplate.replaceAll("{name}", "field"));
    }
    if (v.components) {
      const c = v.components;
      if (
        c.major &&
        (!c.major.requiredParts.includes("name") ||
          new Set(c.major.requiredParts).size !== c.major.requiredParts.length)
      )
        return false;
      if (
        c.address &&
        (new Set([
          c.address.zipIndex,
          c.address.addressIndex,
          c.address.detailIndex,
        ]).size !== 3 ||
          [
            c.address.zipIndex,
            c.address.addressIndex,
            c.address.detailIndex,
          ].some((i) => i >= c.address.fieldCount))
      )
        return false;
      if (
        !c.timeouts.pollMs ||
        !c.row.separator ||
        c.row.singletonIndex > c.row.maxIndex ||
        (c.major && c.major.baseCount > 20)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
