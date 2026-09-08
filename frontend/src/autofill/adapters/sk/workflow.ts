import { runSkAddress } from "./address";
import {
  confirmSkAutocomplete,
  isSkAutocompleteBridgeReady,
} from "./autocomplete-bridge";
import type { WorkflowAdapter } from "../workflow";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

function hasUuidSuffix(value: string, baseName: string): boolean {
  return new RegExp(
    `^${baseName}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
    "i",
  ).test(value);
}

const SEARCH_FIELD_BINDINGS = new Map([
  ["eduEducationName", "education.university.schoolName"],
  ["cerCertName", "certifications.certificate.name"],
  ["lngExamName", "languages.languageTest.testName"],
]);
const SEARCH_FIELD_OFFSETS = new Map([
  ["eduEducationName", 0],
  ["cerCertName", 1],
  ["lngExamName", 2],
]);

function directProfileFieldKey(item: ReviewPlanItem): string | undefined {
  const binding = item.analysis?.valueBinding;
  return binding?.type === "DIRECT" ? binding.profileFieldKey : undefined;
}

function isVerifiedSearchDriver(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  const domName = handle.candidate.domName;
  return Boolean(
    item.selected &&
    !item.disabled &&
    item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
    item.analysis.interactionStatus === "READY" &&
    item.analysis.writePlan?.command === "SET_TEXT" &&
    domName &&
    SEARCH_FIELD_BINDINGS.get(domName) === directProfileFieldKey(item),
  );
}

export const skWorkflowAdapter: WorkflowAdapter = {
  runAddress: runSkAddress,
  addressFieldNames: ["prsZipCode", "prsAddress", "prsAddressDtl"],
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
  stateDriverStage: (item, handle) => {
    const binding = item.analysis?.valueBinding;
    if (
      item.selected &&
      !item.disabled &&
      item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
      item.analysis.interactionStatus === "READY" &&
      item.analysis.writePlan?.command === "SELECT_OPTION" &&
      handle.candidate.domName === "lngLanguageType" &&
      binding?.type === "DIRECT" &&
      binding.profileFieldKey === "languages.languageTest.language"
    ) {
      return 1;
    }
    if (!isVerifiedSearchDriver(item, handle)) return undefined;
    const offset = SEARCH_FIELD_OFFSETS.get(handle.candidate.domName ?? "");
    return offset === undefined
      ? undefined
      : 2 + (handle.itemIndex ?? 0) * 3 + offset;
  },
  waitForStateDriverReady: (document, handle) =>
    handle.candidate.domName &&
    SEARCH_FIELD_BINDINGS.has(handle.candidate.domName)
      ? isSkAutocompleteBridgeReady(document, handle)
      : Promise.resolve(true),
  settleStateDriver: (document, handle) =>
    handle.candidate.domName &&
    SEARCH_FIELD_BINDINGS.has(handle.candidate.domName)
      ? confirmSkAutocomplete(document, handle)
      : Promise.resolve(true),
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
