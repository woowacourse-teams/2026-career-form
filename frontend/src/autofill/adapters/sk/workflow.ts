import {
  SCHOOL_REGION_OPTIONS,
  standardValueAliases,
} from "../../../profile/standard-values";
import { runSkAddress } from "./address";
import {
  isProfilePriorityStatus,
  matchesProfilePriorityKey,
  isVerifiedProfilePriorityStatus,
  settleProfilePriorityStatus,
} from "./profile-priority";
import {
  SK_DISABILITY_GRADE_CODES,
  SK_DISABILITY_TYPE_CODES,
  SK_MILITARY_BRANCH_CODES,
  SK_MILITARY_STATUS_CODES,
} from "./contracts";
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
import { selectNativeProfileOption } from "../../preparation/select-profile-option";

function hasUuidSuffix(value: string, baseName: string): boolean {
  return new RegExp(
    `^${baseName}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
    "i",
  ).test(value);
}

type SelectionTarget = {
  label: string;
  code: string;
  permitsUuidSuffix: boolean;
};
function selectionTarget(
  selection: { domName: string },
  profileValue: string,
): SelectionTarget | undefined {
  if (
    selection.domName === "eduMajorDoubleYN" ||
    selection.domName === "eduMajorSubYN"
  ) {
    return profileValue === "있음"
      ? { label: "있음", code: "1", permitsUuidSuffix: true }
      : undefined;
  }
  if (selection.domName === "prsMilitarySvcYN") {
    if (profileValue === "비대상") {
      return { label: "비대상", code: "0", permitsUuidSuffix: false };
    }
    return ["군필", "미필", "면제", "복무중"].includes(profileValue)
      ? { label: "대상", code: "1", permitsUuidSuffix: false }
      : undefined;
  }
  if (
    selection.domName === "prsVeteranBenefitYN" ||
    selection.domName === "prsDisabledYN"
  ) {
    return profileValue === "대상" || profileValue === "비대상"
      ? {
          label: profileValue,
          code: profileValue === "대상" ? "1" : "0",
          permitsUuidSuffix: false,
        }
      : undefined;
  }
  return undefined;
}

function isProtectedConditionalSelection(
  domName: string,
): domName is "prsMilitarySvcYN" | "prsVeteranBenefitYN" | "prsDisabledYN" {
  return (
    domName === "prsMilitarySvcYN" ||
    domName === "prsVeteranBenefitYN" ||
    domName === "prsDisabledYN"
  );
}

function exactProtectedGroup(
  document: Document,
  name: "prsMilitarySvcYN" | "prsVeteranBenefitYN" | "prsDisabledYN",
): HTMLInputElement[] | undefined {
  const group = Array.from(
    document.querySelectorAll<HTMLInputElement>(`[name="${name}"]`),
  );
  if (
    group.length !== 2 ||
    group.some(
      (radio) => !(radio instanceof HTMLInputElement) || radio.type !== "radio",
    )
  )
    return undefined;
  const negative = group.filter(
    (radio) =>
      radio.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() ===
        "비대상" && radio.value === "0",
  );
  const positive = group.filter(
    (radio) =>
      radio.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() === "대상" &&
      radio.value === "1",
  );
  return negative.length === 1 && positive.length === 1 ? group : undefined;
}

function militaryTargetSelected(document: Document): boolean {
  const target = exactProtectedGroup(document, "prsMilitarySvcYN")?.find(
    (radio) => radio.value === "1",
  );
  return Boolean(target?.checked && isVisibleInteractiveRadio(target));
}

function selectMilitaryStatusReveal(
  document: Document,
  value: string,
): { code: "SELECTED" | "SELECTION_FAILED"; count: 1 } {
  const controls = Array.from(
    document.querySelectorAll("[name='prsMilitarySvcStatus']"),
  );
  const select = controls[0];
  if (
    controls.length !== 1 ||
    !(select instanceof HTMLSelectElement) ||
    !militaryTargetSelected(document) ||
    !SK_MILITARY_STATUS_CODES.has(value) ||
    !hasUniqueOptions(select, SK_MILITARY_STATUS_CODES)
  )
    return { code: "SELECTION_FAILED", count: 1 };
  return {
    code:
      selectNativeProfileOption(select, value, true) === "selected"
        ? "SELECTED"
        : "SELECTION_FAILED",
    count: 1,
  };
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
    !isProtectedConditionalSelection(domName) ||
    input.name !== domName ||
    !target ||
    handle.candidate.displayName !== target.label ||
    input.value !== target.code ||
    !isVisibleInteractiveRadio(input)
  ) {
    return false;
  }
  const radios = exactProtectedGroup(input.ownerDocument, domName);
  return Boolean(
    radios?.includes(input) &&
    (isProfilePriorityStatus(domName) ||
      !radios.some((radio) => radio !== input && radio.checked)),
  );
}

function hasUniqueOptions(
  select: HTMLSelectElement,
  options: ReadonlyMap<string, string>,
): boolean {
  return [...options].every(([label, code]) => {
    const labeled = Array.from(select.options).filter(
      (o) => o.textContent?.trim() === label,
    );
    return (
      labeled.length === 1 &&
      labeled[0]?.value === code &&
      Array.from(select.options).filter((option) => option.value === code)
        .length === 1
    );
  });
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
    select.ownerDocument.querySelectorAll("[name='prsMilitarySvcStatus']")
      .length !== 1 ||
    !select.isConnected ||
    select.disabled ||
    select.closest("[hidden], [inert], [aria-hidden='true']") ||
    !SK_MILITARY_STATUS_CODES.has(profileValue) ||
    !hasUniqueOptions(select, SK_MILITARY_STATUS_CODES)
  ) {
    return false;
  }
  if (!militaryTargetSelected(select.ownerDocument)) return false;
  if (select.value.trim() === "") return true;
  return (
    select.selectedOptions[0]?.textContent?.replace(/\s+/g, " ").trim() ===
      profileValue &&
    select.value === SK_MILITARY_STATUS_CODES.get(profileValue)
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
  prefersProfileValue: (handle, analysis) => {
    const name = handle.candidate.domName;
    if (
      !isVerifiedProfilePriorityStatus(name, analysis) ||
      !name ||
      !isProtectedConditionalSelection(name) ||
      handle.candidate.control !== "radio"
    )
      return false;
    const ownerDocument = handle.elements[0]?.ownerDocument;
    if (!ownerDocument) return false;
    const group = exactProtectedGroup(ownerDocument, name);
    return Boolean(
      group &&
      handle.elements.length === 2 &&
      group.every(
        (radio) =>
          handle.elements.includes(radio) && isVisibleInteractiveRadio(radio),
      ),
    );
  },
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
        (option) =>
          option.value === normalized || option.label === normalized,
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
  canSelectProfileOption: (handle, profileValue, profileFieldKey) => {
    if (
      isProfilePriorityStatus(handle.candidate.domName) &&
      profileFieldKey !== undefined &&
      !matchesProfilePriorityKey(handle.candidate.domName, profileFieldKey)
    )
      return false;
    if (
      handle.candidate.domName === "prsMilitarySvcYN" ||
      handle.candidate.domName === "prsVeteranBenefitYN" ||
      handle.candidate.domName === "prsDisabledYN"
    ) {
      return canSelectProtectedRadio(handle, profileValue);
    }
    if (handle.candidate.domName === "prsMilitarySvcStatus") {
      return canSelectMilitaryStatus(handle, profileValue);
    }
    return undefined;
  },
  canWriteProfileOption: (handle, item) => {
    if (isProfilePriorityStatus(handle.candidate.domName)) {
      if (
        !item.analysis ||
        !skWorkflowAdapter.prefersProfileValue?.(handle, item.analysis) ||
        !["대상", "비대상"].includes(item.profileValue ?? "")
      )
        return false;
      const code = item.profileValue === "대상" ? "1" : "0";
      return !handle.elements.some(
        (element) =>
          element instanceof HTMLInputElement &&
          element.value === code &&
          element.checked,
      );
    }
    const select = handle.elements[0];
    const key = item.analysis?.valueBinding?.profileFieldKey;
    if (
      handle.elements.length !== 1 ||
      !(select instanceof HTMLSelectElement) ||
      item.analysis?.valueBinding?.type !== "DIRECT" ||
      !item.selected ||
      item.disabled
    )
      return undefined;
    const options =
      handle.candidate.domName === "prsMilitarySvcStatus" &&
      key === "military.military.militaryStatus"
        ? SK_MILITARY_STATUS_CODES
        : handle.candidate.domName === "prsMilitarySvcCategory" &&
            key === "military.military.militaryBranch"
          ? SK_MILITARY_BRANCH_CODES
          : undefined;
    if (!options) return undefined;
    if (!hasUniqueOptions(select, options)) return false;
    const gateName =
      handle.candidate.domName === "prsDisabledType"
        ? "prsDisabledYN"
        : "prsMilitarySvcYN";
    const gate = Array.from(
      select.ownerDocument.querySelectorAll<HTMLInputElement>(
        "input[type='radio'][name='" + gateName + "']",
      ),
    ).filter(
      (radio) =>
        radio.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() ===
          "대상" &&
        (!radio.hasAttribute("value") || radio.value === "1") &&
        isVisibleInteractiveRadio(radio),
    );
    if (gate.length !== 1 || !gate[0].checked) return false;
    const expected = Array.from(select.options).find(
      (option) =>
        option.textContent?.replace(/\s+/g, " ").trim() === item.profileValue &&
        option.value === options.get(item.profileValue),
    );
    if (!expected) return false;
    return select.value === expected.value ? false : true;
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
    if (
      item.selected &&
      !item.disabled &&
      isVerifiedProfilePriorityStatus(handle.candidate.domName, item.analysis)
    )
      return handle.candidate.domName === "prsVeteranBenefitYN" ? -2 : -1;
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
    isProfilePriorityStatus(handle.candidate.domName)
      ? settleProfilePriorityStatus(document, handle)
      : handle.candidate.domName &&
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
    {
      domName: "prsDisabledYN",
      profileFieldKey: "disability.disability.disabilityStatus",
      itemIndex: 0,
    },
  ],
  selectReveal: (document, selection, profileValue) => {
    if (
      isProfilePriorityStatus(selection.domName) &&
      !matchesProfilePriorityKey(selection.domName, selection.profileFieldKey)
    )
      return { code: "PROFILE_NOT_SELECTED", count: 1 };
    if (selection.domName === "prsMilitarySvcStatus") {
      return profileValue === undefined
        ? { code: "PROFILE_UNAVAILABLE", count: 1 }
        : selectMilitaryStatusReveal(
            document,
            profileValue.normalize("NFKC").trim(),
          );
    }
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
    const protectedSelection = isProtectedConditionalSelection(
      selection.domName,
    );
    const group = protectedSelection
      ? exactProtectedGroup(
          document,
          selection.domName as
            "prsMilitarySvcYN" | "prsVeteranBenefitYN" | "prsDisabledYN",
        )
      : matchingRadios;
    if (!group) return { code: "TARGET_MISSING", count: 1 };
    const targets = group.filter(
      (input) =>
        input.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() ===
          target.label &&
        (!protectedSelection || input.value === target.code),
    );
    const radio = protectedSelection
      ? targets.length === 1 && isVisibleInteractiveRadio(targets[0]!)
        ? targets[0]
        : undefined
      : targets[0];
    if (!radio) return { code: "TARGET_MISSING", count: 1 };
    if (
      protectedSelection &&
      !isProfilePriorityStatus(selection.domName) &&
      !radio.checked &&
      group.some((input) => input !== radio && input.checked)
    ) {
      return { code: "SKIPPED", count: 1 };
    }
    if (!radio.checked) radio.click();
    if (
      isProtectedConditionalSelection(selection.domName) &&
      isProfilePriorityStatus(selection.domName)
    ) {
      const after = exactProtectedGroup(document, selection.domName);
      const valid =
        after?.length === group.length &&
        after.every((element) => group.includes(element)) &&
        after.includes(radio) &&
        radio.checked &&
        radio.value === target.code &&
        isVisibleInteractiveRadio(radio);
      return { code: valid ? "SELECTED" : "SELECTION_FAILED", count: 1 };
    }
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
