import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { normalizeDisplayName } from "../../write/display-name";
import type { CompanyWriteAdapter } from "../write";
import {
  dependentDriverSettled,
  exactHyundaiEtcArticle,
} from "./military-veteran";

const HYUNDAI_EDUCATION_SEARCH_NAMES = new Set([
  "schNm",
  "majorNm",
  "dblMajorNm",
  "minorNm",
]);

const GPA_SCALE_CODES = new Map([
  ["4.0", "4"],
  ["4.3", "4.3"],
  ["4.5", "4.5"],
  ["100", "100"],
]);
const GPA_TRIGGER_ID = /^rcdPerf_([1-9][0-9]*)$/;

interface ExactButtonSpec {
  codegb: string;
  profileFieldKey: string;
  transitionByCode?: ReadonlyMap<
    string,
    { enabled: string; disabled: string; valid: string }
  >;
}

const MILITARY_TRANSITIONS = new Map([
  [
    "1",
    {
      enabled: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
      disabled: "milExcptCd",
      valid: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
    },
  ],
  [
    "2",
    {
      enabled: "",
      disabled: "milExcptCd,milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
      valid: "",
    },
  ],
  [
    "5",
    {
      enabled: "milExcptCd",
      disabled: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
      valid: "milExcptCd",
    },
  ],
  [
    "7",
    {
      enabled: "",
      disabled: "milExcptCd,milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
      valid: "",
    },
  ],
]);
const VETERAN_TRANSITIONS = new Map([
  [
    "Y",
    {
      enabled: "branchRel,branchSupplyYn,branchAddPoint,branchNo",
      disabled: "",
      valid: "branchRel,branchAddPoint,branchNo",
    },
  ],
  [
    "N",
    {
      enabled: "",
      disabled: "branchRel,branchSupplyYn,branchAddPoint,branchNo",
      valid: "",
    },
  ],
]);
const EXACT_BUTTONS = new Map<string, ExactButtonSpec>([
  [
    "milCd",
    {
      codegb: "0004",
      profileFieldKey: "military.military.militaryStatus",
      transitionByCode: MILITARY_TRANSITIONS,
    },
  ],
  [
    "milExcptCd",
    {
      codegb: "0094",
      profileFieldKey: "military.military.exemptionReason",
    },
  ],
  [
    "milRank",
    { codegb: "0006", profileFieldKey: "military.military.militaryRank" },
  ],
  [
    "milDitinc",
    {
      codegb: "0005",
      profileFieldKey: "military.military.militaryBranch",
    },
  ],
  [
    "branchYn",
    {
      codegb: "1502",
      profileFieldKey: "veteran.veteran.veteranStatus",
      transitionByCode: VETERAN_TRANSITIONS,
    },
  ],
  [
    "branchRel",
    {
      codegb: "0007",
      profileFieldKey: "veteran.veteran.veteranRelation",
    },
  ],
]);

function exactTextContract(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  id: "milStartDt" | "milEndDt" | "branchNo",
): boolean {
  const input = handle.elements[0];
  const binding = item.analysis?.valueBinding;
  const article = input ? exactHyundaiEtcArticle(input) : undefined;
  const expectedFieldKey =
    id === "milStartDt"
      ? "military.military.serviceStartDate"
      : id === "milEndDt"
        ? "military.military.serviceEndDate"
        : "veteran.veteran.veteranNumber";
  if (
    handle.elements.length !== 1 ||
    !(input instanceof HTMLInputElement) ||
    !article ||
    item.candidateId !== handle.candidateId ||
    item.analysis?.candidateId !== item.candidateId ||
    item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
    item.analysis.interactionStatus !== "READY" ||
    item.analysis.writePlan?.command !== "SET_TEXT" ||
    handle.candidate.domId !== id ||
    handle.candidate.domName !== id ||
    handle.candidate.element !== "input" ||
    handle.candidate.control !== "text" ||
    input.id !== id ||
    input.name !== id ||
    input.type !== "text" ||
    !input.isConnected ||
    article.querySelectorAll(`input[type='text']#${id}[name='${id}']`)
      .length !== 1 ||
    !dependentDriverSettled(input.ownerDocument, id)
  ) {
    return false;
  }
  if (id === "branchNo") {
    return (
      binding?.type === "DIRECT" &&
      binding.profileFieldKey === expectedFieldKey &&
      input.maxLength === 10 &&
      input.dataset.parsleyType === "digits" &&
      /^\d{1,10}$/.test(item.profileValue ?? "") &&
      input.closest(".field.col-medium.js-required") !== null
    );
  }
  return (
    binding?.type === "DERIVED" &&
    binding.recipe === "YEAR_MONTH" &&
    binding.profileFieldKey === expectedFieldKey &&
    input.maxLength === 7 &&
    input.dataset.dateFormat === "yyyy-mm" &&
    input.dataset.minView === "months" &&
    input.dataset.view === "months" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(item.profileValue ?? "") &&
    input.closest(".field.calendar.col-medium.js-required") !== null
  );
}

function exactGpaHidden(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  trigger: HTMLInputElement,
  displayName: string,
  code: string,
): HTMLInputElement | undefined {
  const rowMatch = GPA_TRIGGER_ID.exec(trigger.id);
  const binding = item.analysis?.valueBinding;
  if (
    item.candidateId !== handle.candidateId ||
    item.analysis?.candidateId !== item.candidateId ||
    binding?.type !== "BUTTON_OPTION" ||
    binding.profileFieldKey !== "education.university.gpaScale" ||
    handle.itemGroupId !== "educationuniversity" ||
    !rowMatch ||
    handle.candidate.domId !== trigger.id ||
    trigger.name !== "" ||
    trigger.dataset.codegb !== "0017" ||
    GPA_SCALE_CODES.get(displayName) !== code
  ) {
    return undefined;
  }
  const selectWrap = trigger.closest(".select-wrap");
  const matches = Array.from(
    selectWrap?.querySelectorAll<HTMLInputElement>(
      ":scope > input[type='hidden'].js-field[name='rcdPerf']",
    ) ?? [],
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function selectButtonOption(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  const binding = item.analysis?.valueBinding;
  const displayName = item.profileValue;
  if (
    handle.candidate.control !== "button" ||
    binding?.type !== "BUTTON_OPTION" ||
    !displayName
  ) {
    return false;
  }
  const code = binding.optionCodeMap[displayName];
  const trigger = handle.elements[0];
  if (
    !code ||
    !(trigger instanceof HTMLInputElement) ||
    trigger.type !== "button"
  ) {
    return false;
  }
  const exactSpec = handle.candidate.domId
    ? EXACT_BUTTONS.get(handle.candidate.domId)
    : undefined;
  if (exactSpec) {
    const id = handle.candidate.domId!;
    const article = exactHyundaiEtcArticle(trigger);
    const exactTriggers = article?.querySelectorAll<HTMLInputElement>(
      `input[type='button']#${id}`,
    );
    const exactWrap = trigger.closest(".select-wrap");
    const exactHidden = exactWrap?.querySelectorAll<HTMLInputElement>(
      `:scope > input[type='hidden'][name='${id}']`,
    );
    if (
      handle.elements.length !== 1 ||
      !article ||
      !exactWrap ||
      item.candidateId !== handle.candidateId ||
      item.analysis?.candidateId !== item.candidateId ||
      item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
      item.analysis.interactionStatus !== "READY" ||
      handle.candidate.domName !== undefined ||
      handle.candidate.element !== "input" ||
      trigger.id !== id ||
      trigger.name !== "" ||
      trigger.dataset.codegb !== exactSpec.codegb ||
      binding.profileFieldKey !== exactSpec.profileFieldKey ||
      exactTriggers?.length !== 1 ||
      exactHidden?.length !== 1 ||
      !exactHidden[0]!.classList.contains("js-field") ||
      !dependentDriverSettled(trigger.ownerDocument, id)
    ) {
      return false;
    }
    const transition = exactSpec.transitionByCode?.get(code);
    const exactChoices = Array.from(
      exactWrap.querySelectorAll<HTMLButtonElement>(
        ":scope > .select-option > button[data-code]",
      ),
    ).filter(
      (choice) =>
        choice.dataset.code === code &&
        normalizeDisplayName(choice.textContent ?? "") ===
          normalizeDisplayName(displayName) &&
        (!transition ||
          ((choice.dataset.enabled ?? "") === transition.enabled &&
            (choice.dataset.disabled ?? "") === transition.disabled &&
            (choice.dataset.valid ?? "") === transition.valid)),
    );
    if (
      exactChoices.length !== 1 ||
      (exactSpec.transitionByCode && !transition)
    ) {
      return false;
    }
    const hidden = exactHidden[0]!;
    const originalValue = normalizeDisplayName(item.currentValue);
    const actualValue = normalizeDisplayName(trigger.value);
    if (originalValue) {
      return (
        originalValue === normalizeDisplayName(displayName) &&
        actualValue === normalizeDisplayName(displayName) &&
        hidden.value === code
      );
    }
    if (actualValue || hidden.value.trim()) {
      return (
        actualValue === normalizeDisplayName(displayName) &&
        hidden.value === code
      );
    }
  }
  const selectWrap = trigger.closest(".select-wrap");
  if (!selectWrap) return false;
  const isGpaScale =
    binding.profileFieldKey === "education.university.gpaScale";
  let hiddenValue: HTMLInputElement | undefined;
  if (isGpaScale) {
    hiddenValue = exactGpaHidden(handle, item, trigger, displayName, code);
    if (!hiddenValue) return false;
    const currentValue = normalizeDisplayName(item.currentValue);
    const triggerValue = normalizeDisplayName(trigger.value);
    if (currentValue) {
      return (
        currentValue === normalizeDisplayName(displayName) &&
        triggerValue === normalizeDisplayName(displayName) &&
        hiddenValue.value === code
      );
    }
    if (triggerValue || hiddenValue.value.trim()) {
      return (
        triggerValue === normalizeDisplayName(displayName) &&
        hiddenValue.value === code
      );
    }
  }
  trigger.click();
  const choices = Array.from(
    selectWrap.querySelectorAll<HTMLButtonElement>(
      ":scope > .select-option button[data-code]",
    ),
  ).filter(
    (choice) =>
      choice.offsetParent !== null &&
      choice.dataset.code === code &&
      normalizeDisplayName(choice.textContent ?? "") ===
        normalizeDisplayName(displayName),
  );
  if (choices.length !== 1) return false;
  choices[0].click();
  hiddenValue ??=
    selectWrap.querySelector<HTMLInputElement>(
      "input[type='hidden'].js-field",
    ) ?? undefined;
  return (
    normalizeDisplayName(trigger.value) === normalizeDisplayName(displayName) &&
    hiddenValue?.value === code
  );
}

export const hyundaiWriteAdapter: CompanyWriteAdapter = {
  tryWrite(handle, item) {
    if (
      handle.candidate.domName === "nationCd1Nm" ||
      HYUNDAI_EDUCATION_SEARCH_NAMES.has(handle.candidate.domName ?? "")
    ) {
      return { handled: true, written: false };
    }
    const exactTextId = ["milStartDt", "milEndDt", "branchNo"].find(
      (id) => handle.candidate.domId === id || handle.candidate.domName === id,
    ) as "milStartDt" | "milEndDt" | "branchNo" | undefined;
    if (exactTextId && item.analysis?.writePlan?.command === "SET_TEXT") {
      return exactTextContract(handle, item, exactTextId)
        ? { handled: false }
        : { handled: true, written: false };
    }
    if (item.analysis?.writePlan?.command !== "SELECT_BUTTON_OPTION")
      return { handled: false };
    return { handled: true, written: selectButtonOption(handle, item) };
  },
  afterWrite(handle, item) {
    if (item.analysis?.writePlan?.command !== "SET_TEXT") return;
    const element = handle.elements[0];
    if (
      (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement) &&
      element.value.trim()
    ) {
      element.closest(".field")?.classList.add("exist");
    }
  },
};
