import type { FieldCandidateHandle } from "../../dom/types";
import {
  isProfilePriorityStatus,
  isVerifiedProfilePriorityStatus,
} from "./profile-priority";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { CompanyWriteAdapter, CompanyWriteAttempt } from "../write";
import {
  SK_DISABILITY_GRADE_CODES,
  SK_DISABILITY_TYPE_CODES,
  SK_MILITARY_BRANCH_CODES,
  SK_MILITARY_STATUS_CODES,
  SK_MILITARY_TYPE_CODES,
  SK_NEGATIVE_CODE,
  SK_POSITIVE_CODE,
} from "./contracts";

type RadioName = "prsMilitarySvcYN" | "prsVeteranBenefitYN" | "prsDisabledYN";
type Codes = ReadonlyMap<string, string>;
const HIDDEN =
  "[hidden], [inert], [aria-hidden='true'], [style*='display: none'], [style*='display:none'], [style*='visibility: hidden'], [style*='visibility:hidden']";
const text = (element: HTMLInputElement) =>
  element.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const usable = (element: Element) =>
  element.isConnected &&
  !element.matches(":disabled") &&
  !element.closest(HIDDEN);

function radios(
  document: Document,
  name: RadioName,
): HTMLInputElement[] | undefined {
  const controls = Array.from(document.querySelectorAll(`[name='${name}']`));
  if (controls.length !== 2) return undefined;
  const group = controls.filter(
    (control): control is HTMLInputElement =>
      control instanceof HTMLInputElement && control.type === "radio",
  );
  if (group.length !== 2) return undefined;
  const zero = group.filter(
    (radio) => text(radio) === "비대상" && radio.value === SK_NEGATIVE_CODE,
  );
  const one = group.filter(
    (radio) => text(radio) === "대상" && radio.value === SK_POSITIVE_CODE,
  );
  return zero.length === 1 && one.length === 1 ? group : undefined;
}
function gate(document: Document, name: RadioName): boolean {
  return (
    radios(document, name)?.some(
      (radio) =>
        radio.checked &&
        usable(radio) &&
        text(radio) === "대상" &&
        radio.value === SK_POSITIVE_CODE,
    ) === true
  );
}
function booleanBinding(item: ReviewPlanItem, key: string): boolean {
  const binding = item.analysis?.valueBinding;
  return (
    binding?.type === "DERIVED" &&
    binding.recipe === "BOOLEAN_YN" &&
    binding.profileFieldKey === key &&
    binding.trueLabel === "대상" &&
    binding.falseLabel === "비대상"
  );
}
function statusBinding(item: ReviewPlanItem): boolean {
  const binding = item.analysis?.valueBinding;
  return (
    binding?.type === "LOOKUP" &&
    binding.profileFieldKey === "military.military.militaryStatus"
  );
}
function radioWrite(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  name: RadioName,
  key: string,
  military = false,
): CompanyWriteAttempt {
  if (
    handle.candidate.domName !== name ||
    handle.candidate.control !== "radio" ||
    item.analysis?.writePlan?.command !== "CHECK_RADIO" ||
    !["대상", "비대상"].includes(item.profileValue ?? "") ||
    !(military ? statusBinding(item) : booleanBinding(item, key))
  )
    return { handled: true, written: false };
  const group = radios(handle.elements[0]?.ownerDocument ?? document, name);
  if (
    !group ||
    handle.elements.length !== group.length ||
    !handle.elements.every((element) =>
      group.includes(element as HTMLInputElement),
    )
  )
    return { handled: true, written: false };
  const target = group.find((radio) =>
    item.profileValue === "대상"
      ? text(radio) === "대상" && radio.value === SK_POSITIVE_CODE
      : text(radio) === "비대상" && radio.value === SK_NEGATIVE_CODE,
  )!;
  if (
    !usable(target) ||
    (isProfilePriorityStatus(name) &&
      !isVerifiedProfilePriorityStatus(name, item.analysis))
  )
    return { handled: true, written: false };
  if (target.checked) return { handled: true, written: true };
  if (!isProfilePriorityStatus(name) && group.some((radio) => radio.checked))
    return { handled: true, written: false };
  target.click();
  const after = radios(target.ownerDocument, name);
  return {
    handled: true,
    written: Boolean(
      after &&
      after.length === group.length &&
      after.every((radio) => group.includes(radio)) &&
      after.includes(target) &&
      usable(target) &&
      target.checked,
    ),
  };
}
function option(
  select: HTMLSelectElement,
  value: string,
  codes: Codes,
): HTMLOptionElement | undefined {
  const code = codes.get(value);
  if (!code || !usable(select)) return undefined;
  const all = Array.from(select.options);
  const matches = all.filter(
    (current) =>
      current.value === code &&
      current.textContent?.replace(/\s+/g, " ").trim() === value &&
      !current.disabled &&
      !current.closest("optgroup:disabled"),
  );
  return matches.length === 1 &&
    all.filter((current) => current.value === code).length === 1 &&
    all.filter(
      (current) => current.textContent?.replace(/\s+/g, " ").trim() === value,
    ).length === 1
    ? matches[0]
    : undefined;
}
function servedOrServing(document: Document): boolean {
  const controls = Array.from(
    document.querySelectorAll("[name='prsMilitarySvcStatus']"),
  );
  if (controls.length !== 1 || !(controls[0] instanceof HTMLSelectElement))
    return false;
  const select = controls[0];
  const selected = select?.selectedOptions[0];
  return Boolean(
    select &&
    selected &&
    option(
      select,
      selected.textContent?.replace(/\s+/g, " ").trim() ?? "",
      SK_MILITARY_STATUS_CODES,
    ) === selected &&
    (select.value === "302001" || select.value === "302004"),
  );
}
function selectWrite(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  name: string,
  key: string,
  type: "DIRECT" | "LOOKUP",
  codes: Codes,
  gateName: RadioName,
  extraGate?: (document: Document) => boolean,
): CompanyWriteAttempt {
  const select = handle.elements[0];
  if (
    handle.elements.length !== 1 ||
    handle.candidate.domName !== name ||
    handle.candidate.control !== "select" ||
    !(select instanceof HTMLSelectElement) ||
    select.name !== name ||
    item.analysis?.writePlan?.command !== "SELECT_OPTION" ||
    item.analysis?.valueBinding?.type !== type ||
    item.analysis.valueBinding.profileFieldKey !== key ||
    select.ownerDocument.querySelectorAll(`[name='${name}']`).length !== 1 ||
    !gate(select.ownerDocument, gateName) ||
    (extraGate && !extraGate(select.ownerDocument))
  )
    return { handled: true, written: false };
  const value = item.profileValue ?? "";
  const target = option(select, value, codes);
  if (!target) return { handled: true, written: false };
  const code = target.value;
  if (select.value === code) return { handled: true, written: true };
  if (select.value !== "") return { handled: true, written: false };
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  if (!setter) return { handled: true, written: false };
  setter.call(select, code);
  if (select.value !== code || select.selectedOptions[0] !== target)
    return { handled: true, written: false };
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return {
    handled: true,
    written:
      usable(select) &&
      select.ownerDocument.querySelectorAll(`[name='${name}']`).length === 1 &&
      gate(select.ownerDocument, gateName) &&
      (!extraGate || extraGate(select.ownerDocument)) &&
      option(select, value, codes) === target &&
      select.value === code &&
      select.selectedOptions[0] === target,
  };
}
function textWrite(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  name: "prsVeteranBenefitNumber" | "prsVeteranBenefitRelation",
  key: string,
): CompanyWriteAttempt {
  const input = handle.elements[0];
  if (
    handle.elements.length !== 1 ||
    handle.candidate.domName !== name ||
    handle.candidate.control !== "text" ||
    !(input instanceof HTMLInputElement) ||
    input.type !== "text" ||
    input.name !== name ||
    input.ownerDocument.querySelectorAll(`input[name="${name}"]`).length !==
      1 ||
    !usable(input) ||
    !gate(input.ownerDocument, "prsVeteranBenefitYN") ||
    item.analysis?.writePlan?.command !== "SET_TEXT" ||
    item.analysis?.valueBinding?.type !== "DIRECT" ||
    item.analysis.valueBinding.profileFieldKey !== key ||
    !item.profileValue
  )
    return { handled: true, written: false };
  if (input.value === item.profileValue)
    return { handled: true, written: true };
  if (input.value !== "") return { handled: true, written: false };
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return { handled: true, written: false };
  setter.call(input, item.profileValue);
  if (input.value !== item.profileValue)
    return { handled: true, written: false };
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return { handled: true, written: input.value === item.profileValue };
}

export const skWriteAdapter: CompanyWriteAdapter = {
  tryWrite(handle, item) {
    switch (handle.candidate.domName) {
      case "prsMilitarySvcLevel":
      case "prsDisabledNumber":
        return { handled: true, written: false };
      case "prsMilitarySvcYN":
        return radioWrite(
          handle,
          item,
          "prsMilitarySvcYN",
          "military.military.militaryStatus",
          true,
        );
      case "prsVeteranBenefitYN":
        return radioWrite(
          handle,
          item,
          "prsVeteranBenefitYN",
          "veteran.veteran.veteranStatus",
        );
      case "prsDisabledYN":
        return radioWrite(
          handle,
          item,
          "prsDisabledYN",
          "disability.disability.disabilityStatus",
        );
      case "prsMilitarySvcStatus":
        return selectWrite(
          handle,
          item,
          "prsMilitarySvcStatus",
          "military.military.militaryStatus",
          "DIRECT",
          SK_MILITARY_STATUS_CODES,
          "prsMilitarySvcYN",
        );
      case "prsMilitarySvcType":
        return selectWrite(
          handle,
          item,
          "prsMilitarySvcType",
          "military.military.militaryType",
          "DIRECT",
          SK_MILITARY_TYPE_CODES,
          "prsMilitarySvcYN",
          servedOrServing,
        );
      case "prsMilitarySvcCategory":
        return selectWrite(
          handle,
          item,
          "prsMilitarySvcCategory",
          "military.military.militaryBranch",
          "DIRECT",
          SK_MILITARY_BRANCH_CODES,
          "prsMilitarySvcYN",
          servedOrServing,
        );
      case "prsDisabledType":
        return selectWrite(
          handle,
          item,
          "prsDisabledType",
          "disability.disability.disabilityGrade",
          "LOOKUP",
          SK_DISABILITY_GRADE_CODES,
          "prsDisabledYN",
        );
      case "prsDisabledTypeDtl":
        return selectWrite(
          handle,
          item,
          "prsDisabledTypeDtl",
          "disability.disability.disabilityType",
          "DIRECT",
          SK_DISABILITY_TYPE_CODES,
          "prsDisabledYN",
        );
      case "prsVeteranBenefitNumber":
        return textWrite(
          handle,
          item,
          "prsVeteranBenefitNumber",
          "veteran.veteran.veteranNumber",
        );
      case "prsVeteranBenefitRelation":
        return textWrite(
          handle,
          item,
          "prsVeteranBenefitRelation",
          "veteran.veteran.veteranRelation",
        );
      default:
        return { handled: false };
    }
  },
};
