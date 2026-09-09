import { runHyundaiEducationSearch } from "./school-search";
import { runHyundaiAddress, hyundaiAddressNames } from "./address";
import { runHyundaiNationality } from "./nationality";
import { prepareHyundaiEducation } from "./education";
import {
  conditionalDriverSettled,
  exactConditionalDriver,
} from "./military-veteran";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { WorkflowAdapter } from "../workflow";

const STATE_SETTLE_TIMEOUT_MILLISECONDS = 3_000;
const EDUCATION_SEARCH_STAGE_OFFSETS = new Map([
  ["schNm", 0],
  ["majorNm", 1],
  ["dblMajorNm", 2],
  ["minorNm", 3],
]);
const DEFERRED_ADDITIONAL_MAJOR_SEARCHES = new Map([
  [
    "dblMajorNm",
    {
      hiddenName: "dblMajor",
      profileFieldKey: "education.university.additionalMajorName",
    },
  ],
  [
    "minorNm",
    {
      hiddenName: "minor",
      profileFieldKey: "education.university.minorName",
    },
  ],
]);

function isEducationSearch(handle: FieldCandidateHandle): boolean {
  return EDUCATION_SEARCH_STAGE_OFFSETS.has(structuralBase(handle) ?? "");
}

function profileFieldKey(item: ReviewPlanItem): string | undefined {
  const binding = item.analysis?.valueBinding;
  return binding?.type === "DIRECT" ||
    binding?.type === "LOOKUP" ||
    binding?.type === "BUTTON_OPTION"
    ? binding.profileFieldKey
    : item.profileFieldKey;
}

function fieldGroup(handle: FieldCandidateHandle): HTMLElement | undefined {
  const element = handle.elements[0];
  const group = element?.closest<HTMLElement>(".field-group");
  return group ?? undefined;
}

function structuralBase(handle: FieldCandidateHandle): string | undefined {
  const value = handle.candidate.domName ?? handle.candidate.domId;
  return value?.replace(/_[1-9][0-9]*$/, "");
}

function uniqueOwnedElement<T extends Element>(
  field: HTMLElement,
  selector: string,
): T | undefined {
  const matches = Array.from(field.querySelectorAll<T>(selector)).filter(
    (element) => element.closest(".field.search") === field,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function additionalMajorFailureGroup(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): HTMLElement | undefined {
  const domName = structuralBase(handle);
  const spec = domName
    ? DEFERRED_ADDITIONAL_MAJOR_SEARCHES.get(domName)
    : undefined;
  const display = handle.elements[0];
  const domId = handle.candidate.domId;
  if (
    !spec ||
    handle.itemGroupId !== "educationuniversity" ||
    handle.elements.length !== 1 ||
    handle.candidate.domName !== domName ||
    !domId ||
    !new RegExp(`^${domName}_[1-9][0-9]*$`).test(domId) ||
    handle.candidate.element !== "input" ||
    handle.candidate.control !== "text" ||
    !(display instanceof HTMLInputElement) ||
    !display.isConnected ||
    display.id !== domId ||
    display.name !== domName ||
    display.type !== "text" ||
    display.dataset.autoType !== "basic" ||
    display.dataset.autoApi !== "0200" ||
    display.dataset.autoParams !== "0015" ||
    item.candidateId !== handle.candidateId ||
    item.analysis?.candidateId !== item.candidateId ||
    item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
    item.analysis.interactionStatus !== "READY" ||
    item.analysis.writePlan?.command !== "SET_TEXT" ||
    profileFieldKey(item) !== spec.profileFieldKey
  ) {
    return undefined;
  }
  const field = display.closest<HTMLElement>(".field.search");
  if (
    !field ||
    field.matches("[hidden], [aria-hidden='true'], [inert]") ||
    uniqueOwnedElement<HTMLInputElement>(
      field,
      `input#${domId}[name='${domName}'][type='text']`,
    ) !== display ||
    !uniqueOwnedElement<HTMLInputElement>(
      field,
      `input[type='hidden'][name='${spec.hiddenName}']`,
    ) ||
    !uniqueOwnedElement<HTMLElement>(field, ".search-result-list")
  ) {
    return undefined;
  }
  return field;
}

function waitFor(
  document: Document,
  condition: () => boolean,
): Promise<boolean> {
  if (condition()) return Promise.resolve(true);
  const view = document.defaultView;
  if (!view) return Promise.resolve(false);
  return new Promise((resolve) => {
    const observer = new view.MutationObserver(() => {
      if (!condition()) return;
      observer.disconnect();
      view.clearTimeout(timeout);
      resolve(true);
    });
    const timeout = view.setTimeout(() => {
      observer.disconnect();
      resolve(condition());
    }, STATE_SETTLE_TIMEOUT_MILLISECONDS);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "required", "hidden", "class", "style"],
    });
  });
}

function hasExamOptions(group: HTMLElement): boolean {
  const examValue = group.querySelector<HTMLInputElement>(
    "input[name='foreExamCd']",
  );
  const examButton = group.querySelector<HTMLInputElement>(
    "input[type='button'][id^='foreExamCd_']",
  );
  const selectWrap = examButton?.closest(".select-wrap");
  return Boolean(
    examValue &&
    examButton &&
    !examButton.disabled &&
    selectWrap?.querySelector(
      ".select-option button[data-code]:not([data-code=''])",
    ),
  );
}

function hasOwnOptions(handle: FieldCandidateHandle): boolean {
  return Boolean(
    handle.elements[0]
      ?.closest(".select-wrap")
      ?.querySelector(".select-option button[data-code]:not([data-code=''])"),
  );
}

function languageDetailsAreEnabled(group: HTMLElement): boolean {
  const textFields = ["acqNm", "acqDt"].map((name) =>
    group.querySelector<HTMLInputElement>(`input[name='${name}']`),
  );
  const point = group.querySelector<HTMLInputElement>("input[name='point']");
  const grade = group.querySelector<HTMLInputElement>("input[name='grade']");
  const gradeButton =
    grade?.parentElement?.querySelector<HTMLElement>(".btn-select");
  const gradeOptions = gradeButton
    ?.closest(".select-wrap")
    ?.querySelector(".select-option button[data-code]:not([data-code=''])");
  return (
    textFields.every((field) => field && !field.disabled) &&
    Boolean(
      (point && !point.disabled) ||
      (gradeButton && !gradeButton.matches(":disabled") && gradeOptions),
    )
  );
}

function isReadyManualAction(button: HTMLButtonElement): boolean {
  if (
    !button.isConnected ||
    button.disabled ||
    button.matches(":disabled") ||
    button.closest(
      "fieldset[disabled], [hidden], [aria-hidden='true'], [inert]",
    )
  ) {
    return false;
  }
  const view = button.ownerDocument.defaultView;
  if (!view) return false;
  for (
    let current: HTMLElement | null = button;
    current;
    current = current.parentElement
  ) {
    const style = view.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

async function settleLanguageDriver(
  document: Document,
  handle: FieldCandidateHandle,
): Promise<boolean> {
  const group = fieldGroup(handle);
  return group ? waitFor(document, () => hasExamOptions(group)) : false;
}

async function settleExamDriver(
  document: Document,
  handle: FieldCandidateHandle,
): Promise<boolean> {
  const group = fieldGroup(handle);
  if (!group) return false;
  const directInput = () =>
    Array.from(
      group.querySelectorAll<HTMLButtonElement>("button.exam_cancle"),
    ).filter(isReadyManualAction);
  if (directInput().length > 1) return false;
  const ready = await waitFor(
    document,
    () => languageDetailsAreEnabled(group) || directInput().length === 1,
  );
  if (!ready || languageDetailsAreEnabled(group)) return ready;
  const manualActions = directInput();
  if (manualActions.length !== 1) return false;
  manualActions[0]!.click();
  return waitFor(document, () => languageDetailsAreEnabled(group));
}

export const hyundaiWorkflowAdapter: WorkflowAdapter = {
  runAddress: runHyundaiAddress,
  addressFieldNames: hyundaiAddressNames,
  prepareEducation: prepareHyundaiEducation,
  educationPreparationActionId: "hyundai:add:academic",
  executeStateDriver: async (document, handle, item, signal) => {
    if (structuralBase(handle) === "nationCd1Nm")
      return runHyundaiNationality(document, handle, item, signal);
    if (isEducationSearch(handle))
      return runHyundaiEducationSearch(document, handle, item, signal);
    return undefined;
  },
  repeatedProfileSectionHint: (actionDomId) => {
    switch (actionDomId) {
      case "hyundai:add:foreign":
        return { categoryId: "languages", sectionId: "languageTest" };
      case "hyundai:add:foreignAbility":
        return { categoryId: "languages", sectionId: "languageSkill" };
      default:
        return undefined;
    }
  },
  hasFreshRows: () => false,
  isFreshRowDefault: () => false,
  isStateDriver: () => false,
  stateDriverStage: (item, handle) => {
    if (
      item.selected &&
      !item.disabled &&
      exactConditionalDriver(handle, item)
    ) {
      return 1;
    }
    const fieldKey = profileFieldKey(item);
    if (
      isEducationSearch(handle) &&
      item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
      item.analysis.interactionStatus === "READY" &&
      item.analysis.writePlan?.command === "SET_TEXT" &&
      fieldKey?.startsWith("education.") &&
      handle.itemGroupId?.startsWith("education")
    ) {
      return (
        3 +
        (handle.itemIndex ?? 0) * 4 +
        EDUCATION_SEARCH_STAGE_OFFSETS.get(structuralBase(handle) ?? "")!
      );
    }
    if (
      structuralBase(handle) === "nationCd1Nm" &&
      fieldKey === "personal.personal.nationality" &&
      item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
      item.analysis.interactionStatus === "READY"
    )
      return 1;
    if (
      structuralBase(handle) === "foreLang" &&
      fieldKey === "languages.languageTest.language"
    ) {
      return 1;
    }
    if (
      structuralBase(handle) === "foreExamCd" &&
      fieldKey === "languages.languageTest.testName"
    ) {
      return 2;
    }
    return undefined;
  },
  waitForStateDriverReady: (document, handle) =>
    structuralBase(handle) === "nationCd1Nm" || isEducationSearch(handle)
      ? Promise.resolve(true)
      : waitFor(document, () => hasOwnOptions(handle)),
  settleStateDriver: (document, handle) => {
    if (exactConditionalDriver(handle)) {
      return waitFor(document, () =>
        conditionalDriverSettled(document, handle),
      );
    }
    if (structuralBase(handle) === "foreLang") {
      return settleLanguageDriver(document, handle);
    }
    if (structuralBase(handle) === "foreExamCd") {
      return settleExamDriver(document, handle);
    }
    return Promise.resolve(true);
  },
  stateDriverFailureGroup: (item, handle) => {
    if (exactConditionalDriver(handle, item)) {
      const field = handle.elements[0]?.closest<HTMLElement>(".field");
      return field?.isConnected ? field : undefined;
    }
    return additionalMajorFailureGroup(item, handle);
  },
  revealSelections: [],
  selectReveal: () => ({ code: "TARGET_MISSING", count: 0 }),
  revealedBindings: () => new Map(),
  revealedProfileFieldKey: () => undefined,
};
