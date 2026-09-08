import { runSkAddress } from "./address";
import type { WorkflowAdapter } from "../workflow";

function hasUuidSuffix(value: string, baseName: string): boolean {
  return new RegExp(
    `^${baseName}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
    "i",
  ).test(value);
}

export const skWorkflowAdapter: WorkflowAdapter = {
  runAddress: runSkAddress,
  diagnosticsTitle: "SK 복수·부전공명 진단",
  repeatedProfileSectionHint: (actionDomId) => {
    if (actionDomId === "btnAddLangExam") {
      return { categoryId: "languages", sectionId: "languageTest" };
    }
    if (actionDomId === "btnAddLangAbility") {
      return { categoryId: "languages", sectionId: "languageSkill" };
    }
    return undefined;
  },
  educationSectionHint: (matchLabel) => {
    const label = matchLabel.toLowerCase();
    if (label.includes("educationgrad")) return "graduateSchool";
    if (label.includes("educationhigh")) return "highSchool";
    if (label.includes("educationuniv")) return "university";
    return undefined;
  },
  hasFreshRows: (items) =>
    items.some(
      (item) =>
        item.plan.command === "ADD_REPEATABLE_GROUP" &&
        item.plan.expectedFieldNames?.includes("eduEducationName") === true &&
        item.currentGroupCount === 0 &&
        (item.requiredAdditions ?? 0) > 0,
    ),
  isFreshRowDefault: (domName) => domName === "eduEducationType",
  isStateDriver: (item, domName) => {
    if (item.analysis?.writePlan?.command !== "SELECT_OPTION") return false;
    if (domName === "lngLanguageType") return true;
    const binding = item.analysis.valueBinding;
    return (
      domName === "carWorkingYN" &&
      binding?.type === "LOOKUP" &&
      binding.profileFieldKey === "careers.career.employmentStatus"
    );
  },
  revealSelections: [
    {
      domName: "eduMajorDoubleYN",
      profileFieldKey: "education.university.doubleMajorStatus",
      itemIndex: 0,
    },
    {
      domName: "eduMajorSubYN",
      profileFieldKey: "education.university.minorStatus",
      itemIndex: 0,
    },
  ],
  selectReveal: (document, selection, profileValue) => {
    if (profileValue === undefined)
      return { code: "PROFILE_UNAVAILABLE", count: 1 };
    if (profileValue.normalize("NFKC").trim() !== "있음")
      return { code: "PROFILE_NOT_SELECTED", count: 1 };
    // Preserve the existing first matching radio behavior during extraction.
    const target = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[type='radio']"),
    ).find(
      (input) =>
        (input.name === selection.domName ||
          hasUuidSuffix(input.name, selection.domName)) &&
        input.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() === "있음",
    );
    if (!target) return { code: "TARGET_MISSING", count: 1 };
    if (!target.checked) target.click();
    return { code: target.checked ? "SELECTED" : "SELECTION_FAILED", count: 1 };
  },
  revealedBindings: (plans) =>
    new Map(
      plans.flatMap((plan) =>
        plan.command === "SELECT_OPTION_TO_REVEAL"
          ? Object.entries(plan.revealedFieldBindings ?? {})
          : [],
      ),
    ),
  revealedProfileFieldKey: (field, domName, bindings) => {
    const profileFieldKey = domName ? bindings.get(domName) : undefined;
    return profileFieldKey &&
      field.valueBinding?.profileFieldKey === profileFieldKey &&
      field.writePlan?.command === "SET_TEXT"
      ? profileFieldKey
      : undefined;
  },
};
