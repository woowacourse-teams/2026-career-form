import {
  SCHOOL_REGION_OPTIONS,
  standardValueAliases,
} from "../../../profile/standard-values";
import { runSkAddress } from "./address";
import {
  confirmSkAutocomplete,
  isSkAutocompleteBridgeReady,
} from "./autocomplete-bridge";
import type { WorkflowAdapter } from "../workflow";
import type {
  ActionCandidateHandle,
  FieldCandidateHandle,
} from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

function hasUuidSuffix(value: string, baseName: string): boolean {
  return new RegExp(
    `^${baseName}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
    "i",
  ).test(value);
}

function selectionTarget(
  selection: { domName: string },
  profileValue: string,
): { label: string; permitsUuidSuffix: boolean } | undefined {
  if (
    selection.domName === "eduMajorDoubleYN" ||
    selection.domName === "eduMajorSubYN"
  ) {
    return profileValue === "있음"
      ? { label: "있음", permitsUuidSuffix: true }
      : undefined;
  }
  if (selection.domName === "prsMilitarySvcYN") {
    return ["군필", "미필", "면제", "복무중"].includes(profileValue)
      ? { label: "대상", permitsUuidSuffix: false }
      : undefined;
  }
  if (selection.domName === "prsVeteranBenefitYN") {
    return profileValue === "대상"
      ? { label: "대상", permitsUuidSuffix: false }
      : undefined;
  }
  return undefined;
}

function isProtectedConditionalSelection(domName: string): boolean {
  return domName === "prsMilitarySvcYN" || domName === "prsVeteranBenefitYN";
}

function isVisibleInteractiveRadio(input: HTMLInputElement): boolean {
  return Boolean(
    input.isConnected &&
    !input.disabled &&
    !input.closest(
      "[hidden], [inert], [aria-hidden='true'], [style*='display: none'], [style*='display:none'], [style*='visibility: hidden'], [style*='visibility:hidden']",
    ),
  );
}

function canSelectProtectedRadio(
  handle: ActionCandidateHandle,
  profileValue: string,
): boolean {
  const input = handle.element;
  const domName = handle.candidate.domName;
  const target = domName
    ? selectionTarget({ domName }, profileValue.normalize("NFKC").trim())
    : undefined;
  if (
    !(input instanceof HTMLInputElement) ||
    input.type !== "radio" ||
    !domName ||
    input.name !== domName ||
    !target ||
    handle.candidate.displayName !== target.label ||
    !isVisibleInteractiveRadio(input)
  ) {
    return false;
  }
  const radios = Array.from(
    input.ownerDocument.querySelectorAll<HTMLInputElement>(
      `input[type='radio'][name='${domName}']`,
    ),
  );
  const targets = radios.filter(
    (radio) =>
      radio.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() ===
        target.label && isVisibleInteractiveRadio(radio),
  );
  return (
    targets.length === 1 &&
    targets[0] === input &&
    !radios.some((radio) => radio !== input && radio.checked)
  );
}

function canSelectMilitaryStatus(
  handle: ActionCandidateHandle,
  profileValue: string,
): boolean {
  const select = handle.element;
  if (
    !(select instanceof HTMLSelectElement) ||
    handle.candidate.domName !== "prsMilitarySvcStatus" ||
    select.name !== "prsMilitarySvcStatus" ||
    !select.isConnected ||
    select.disabled ||
    select.closest("[hidden], [inert], [aria-hidden='true']") ||
    !["군필", "미필", "면제", "복무중"].includes(profileValue)
  ) {
    return false;
  }
  const targetRadios = Array.from(
    select.ownerDocument.querySelectorAll<HTMLInputElement>(
      "input[type='radio'][name='prsMilitarySvcYN']",
    ),
  ).filter(
    (radio) =>
      radio.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() === "대상" &&
      isVisibleInteractiveRadio(radio),
  );
  if (targetRadios.length !== 1 || !targetRadios[0]!.checked) return false;
  if (select.value.trim() === "") return true;
  return (
    select.selectedOptions[0]?.textContent?.replace(/\s+/g, " ").trim() ===
    profileValue
  );
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
const MILITARY_STATUS_FIELD_KEY = "military.military.militaryStatus";

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
  normalizeProfileValue: (profileFieldKey, value) => {
    const normalized = value.normalize("NFKC").trim();
    if (
      profileFieldKey === MILITARY_STATUS_FIELD_KEY &&
      normalized === "만기전역"
    )
      return "군필";
    if (
      /^education\.(highSchool|university|graduateSchool)\.schoolRegion$/.test(
        profileFieldKey,
      )
    ) {
      const region = SCHOOL_REGION_OPTIONS.find(
        (option) => option.label === normalized,
      );
      // SK uses the verified full province name; preserve standard IDs and unknown labels.
      return region
        ? (standardValueAliases(region.value).find(
            (alias) => alias !== region.label,
          ) ?? value)
        : value;
    }
    return value;
  },
  canSelectProfileOption: (handle, profileValue) => {
    if (
      handle.candidate.domName === "prsMilitarySvcYN" ||
      handle.candidate.domName === "prsVeteranBenefitYN"
    ) {
      return canSelectProtectedRadio(handle, profileValue);
    }
    if (handle.candidate.domName === "prsMilitarySvcStatus") {
      return canSelectMilitaryStatus(handle, profileValue);
    }
    return undefined;
  },
  canWriteProfileOption: (handle, item) => {
    const select = handle.elements[0];
    if (
      handle.candidate.domName !== "prsMilitarySvcStatus" ||
      handle.elements.length !== 1 ||
      !(select instanceof HTMLSelectElement) ||
      select.name !== "prsMilitarySvcStatus" ||
      item.analysis?.valueBinding?.type !== "DIRECT" ||
      item.analysis.valueBinding.profileFieldKey !==
        "military.military.militaryStatus"
    ) {
      return undefined;
    }
    return select.selectedOptions[0]?.textContent?.trim() === item.profileValue
      ? false
      : undefined;
  },
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
  stateDriverFailureGroup: (item, handle) => {
    if (!isVerifiedSearchDriver(item, handle) || handle.elements.length !== 1)
      return undefined;
    const input = handle.elements[0];
    const selectors: Record<string, string> = {
      eduEducationName: ".form-item-group.educationUniv-item",
      cerCertName: ".form-item-group.cert-Item",
      lngExamName: ".form-item-group.langExam-Item",
    };
    const selector = selectors[handle.candidate.domName ?? ""];
    if (
      !selector ||
      !(input instanceof HTMLInputElement) ||
      input.name !== handle.candidate.domName ||
      !input.isConnected
    )
      return undefined;
    const group = input.closest(selector);
    return group?.isConnected && input.closest(".form-item-group") === group
      ? group
      : undefined;
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
    {
      domName: "prsMilitarySvcYN",
      profileFieldKey: "military.military.militaryStatus",
      itemIndex: 0,
    },
    {
      domName: "prsVeteranBenefitYN",
      profileFieldKey: "veteran.veteran.veteranStatus",
      itemIndex: 0,
    },
  ],
  selectReveal: (document, selection, profileValue) => {
    if (profileValue === undefined)
      return { code: "PROFILE_UNAVAILABLE", count: 1 };
    const target = selectionTarget(
      selection,
      profileValue.normalize("NFKC").trim(),
    );
    if (!target) return { code: "PROFILE_NOT_SELECTED", count: 1 };
    const radios = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[type='radio']"),
    );
    const matchesName = (input: HTMLInputElement) =>
      input.name === selection.domName ||
      (target.permitsUuidSuffix &&
        hasUuidSuffix(input.name, selection.domName));
    const matchingRadios = radios.filter(matchesName);
    const targets = matchingRadios.filter(
      (input) =>
        input.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() ===
        target.label,
    );
    const protectedSelection = isProtectedConditionalSelection(
      selection.domName,
    );
    const radio = protectedSelection
      ? targets.length === 1 && isVisibleInteractiveRadio(targets[0]!)
        ? targets[0]
        : undefined
      : targets[0];
    if (!radio) return { code: "TARGET_MISSING", count: 1 };
    if (
      protectedSelection &&
      !radio.checked &&
      matchingRadios.some((input) => input !== radio && input.checked)
    ) {
      return { code: "SKIPPED", count: 1 };
    }
    if (!radio.checked) radio.click();
    return { code: radio.checked ? "SELECTED" : "SELECTION_FAILED", count: 1 };
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
