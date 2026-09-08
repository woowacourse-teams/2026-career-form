import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { normalizeDisplayName } from "../../write/display-name";
import type { CompanyWriteAdapter } from "../write";

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
    if (currentValue || triggerValue) {
      return (
        currentValue === normalizeDisplayName(displayName) &&
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
