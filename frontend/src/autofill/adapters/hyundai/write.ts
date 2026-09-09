import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { normalizeDisplayName } from "../../write/display-name";
import { matchStandardOption } from "../../profile/standard-option-match";
import type { CompanyWriteAdapter } from "../write";

function matchingLiveButtonOption(
  value: string,
  choices: readonly HTMLButtonElement[],
): HTMLButtonElement | undefined {
  const options = choices.map((choice, index) => ({
    optionId: String(index),
    displayName: choice.textContent ?? "",
  }));
  const standardMatch = matchStandardOption(value, options);
  if (standardMatch.status === "unique") {
    return choices[Number(standardMatch.option.optionId)];
  }
  if (standardMatch.status !== "not-standard") return undefined;
  const desired = normalizeDisplayName(value);
  const exact = choices.filter(
    (choice) => normalizeDisplayName(choice.textContent ?? "") === desired,
  );
  return exact.length === 1 ? exact[0] : undefined;
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
  const trigger = handle.elements[0];
  if (
    !(trigger instanceof HTMLInputElement) ||
    trigger.type !== "button"
  ) {
    return false;
  }
  const selectWrap = trigger.closest(".select-wrap");
  if (!selectWrap) return false;
  trigger.click();
  const choices = Array.from(
    selectWrap.querySelectorAll<HTMLButtonElement>(
      ":scope > .select-option button[data-code]",
    ),
  ).filter(
    (choice) => choice.offsetParent !== null,
  );
  const choice = matchingLiveButtonOption(displayName, choices);
  if (!choice || !choice.dataset.code) return false;
  choice.click();
  const hiddenValue = selectWrap.querySelector<HTMLInputElement>(
    "input[type='hidden'].js-field",
  );
  return (
    normalizeDisplayName(trigger.value) ===
      normalizeDisplayName(choice.textContent ?? "") &&
    hiddenValue?.value === choice.dataset.code
  );
}

export const hyundaiWriteAdapter: CompanyWriteAdapter = {
  tryWrite(handle, item) {
    if (
      handle.candidate.domName === "nationCd1Nm" ||
      handle.candidate.domName === "schNm" ||
      handle.candidate.domName === "majorNm"
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
