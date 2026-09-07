import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { normalizeDisplayName } from "../../write/display-name";
import type { CompanyWriteAdapter } from "../write";

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
  trigger.click();
  const choices = Array.from(
    trigger.ownerDocument.querySelectorAll<HTMLButtonElement>(
      "button[data-code]",
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
  return true;
}

export const hyundaiWriteAdapter: CompanyWriteAdapter = {
  tryWrite(handle, item) {
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
