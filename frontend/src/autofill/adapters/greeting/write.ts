import { commitGreetingEmailInput } from "../../interaction/greeting-email-close-bridge";
import { greetingGpaSafe } from "./gpa";
import { greetingSyntheticDomName, greetingRowIdentity } from "./collection";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { CompanyWriteAdapter } from "../write";

export const greetingText = (element: Element) =>
  element.textContent?.replace(/\s+/g, " ").trim() ?? "";
export function greetingUsable(element: Element): boolean {
  if (
    !element.isConnected ||
    element.matches(':disabled, [aria-disabled="true"]') ||
    element.closest('[hidden], [inert], [aria-hidden="true"]')
  )
    return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display !== "none" && style?.visibility !== "hidden";
}
export function greetingApproved(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  return (
    item.candidateId === handle.candidateId &&
    item.analysis?.candidateId === handle.candidateId &&
    item.analysis.mappingStatus === "ADAPTER_VERIFIED" &&
    item.analysis.interactionStatus === "READY" &&
    !!item.profileValue &&
    !item.disabled &&
    greetingGpaSafe(handle, item) &&
    handle.isCurrentContext?.() !== false
  );
}
export function greetingRadioWrite(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  onClick?: () => void,
): boolean {
  if (
    !greetingApproved(handle, item) ||
    !["CHECK_RADIO", "SELECT_BUTTON_OPTION"].includes(
      item.analysis?.writePlan?.command ?? "",
    )
  )
    return false;
  const entries = handle.candidate.options ?? [];
  const matching = entries.filter(
    (option) => option.displayName === item.profileValue,
  );
  if (matching.length !== 1 || entries.length !== handle.optionElements.size)
    return false;
  const nodes = entries.map((option) =>
    handle.optionElements.get(option.optionId),
  );
  if (
    nodes.some(
      (node, index) =>
        !node ||
        !node.matches('button[role="radio"]') ||
        !greetingUsable(node) ||
        !["true", "false"].includes(node.getAttribute("aria-checked") ?? "") ||
        greetingText(node) !== entries[index].displayName,
    )
  )
    return false;
  const radios = nodes as HTMLElement[];
  const group = radios[0]?.closest(
    '[data-scope="toggle-group"][data-part="root"][role="radiogroup"]',
  );
  if (
    !group ||
    greetingSyntheticDomName(group) !== handle.candidate.domName ||
    radios.some((node) => node.closest('[role="radiogroup"]') !== group) ||
    group.querySelectorAll('[role="radio"]').length !== radios.length
  )
    return false;
  const target = handle.optionElements.get(matching[0].optionId)!;
  const checked = radios.filter(
    (node) => node.getAttribute("aria-checked") === "true",
  );
  if (checked.length > 0) return checked.length === 1 && checked[0] === target;
  onClick?.();
  target.click();
  return (
    target.getAttribute("aria-checked") === "true" &&
    radios.filter((node) => node.getAttribute("aria-checked") === "true")
      .length === 1
  );
}
/** The unchecked native control represents retired, not an empty profile choice. */
export function greetingEmploymentStatusValue(
  handle: FieldCandidateHandle,
): "재직중" | "퇴사" | undefined {
  const input = handle.elements[0];
  const options = handle.candidate.options ?? [];
  if (
    !(input instanceof HTMLInputElement) ||
    input.type !== "checkbox" ||
    handle.elements.length !== 1 ||
    !greetingUsable(input) ||
    handle.isCurrentContext?.() === false ||
    !/^workHistory\.workExperiences\.(0|[1-9]\d*)\.employmentStatus$/.test(
      input.name,
    ) ||
    greetingRowIdentity(
      input.closest('[data-scope="accordion"][data-part="item"]') ?? input,
    )?.itemGroupId !== "careerscareer" ||
    input.ownerDocument.querySelectorAll(`[name="${input.name}"]`).length !==
      1 ||
    input.name !== handle.candidate.domName ||
    options.length !== 1 ||
    !["재직중", "재직 중"].includes(options[0].displayName) ||
    handle.optionElements.size !== 1 ||
    handle.optionElements.get(options[0].optionId) !== input
  )
    return undefined;
  return input.checked ? "재직중" : "퇴사";
}
export function greetingEmploymentWrite(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  if (
    !greetingApproved(handle, item) ||
    item.analysis?.writePlan?.command !== "CHECK_CHECKBOX"
  )
    return false;
  const current = greetingEmploymentStatusValue(handle);
  if (!current || !["재직중", "퇴사"].includes(item.profileValue ?? ""))
    return false;
  if (current === item.profileValue) return true;
  if (current === "재직중") return false;
  const input = handle.elements[0] as HTMLInputElement;
  input.click();
  return input.isConnected && input.checked;
}
/** Email suggestions are optional; this exact Greeting field accepts free text. */
function greetingEmailWrite(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  const input = handle.elements[0];
  const value = item.profileValue;
  if (
    !greetingApproved(handle, item) ||
    item.analysis?.writePlan?.command !== "SET_TEXT" ||
    !(input instanceof HTMLInputElement) ||
    handle.elements.length !== 1 ||
    greetingSyntheticDomName(input) !== "basicInformation.email" ||
    !greetingUsable(input) ||
    input.readOnly ||
    !["text", "email"].includes(input.type) ||
    !value ||
    (input.maxLength >= 0 && value.length > input.maxLength) ||
    (input.value !== "" && input.value !== value)
  )
    return false;
  if (input.value === value) return true;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return false;
  const writable = () =>
    greetingApproved(handle, item) &&
    greetingSyntheticDomName(input) === "basicInformation.email" &&
    greetingUsable(input) &&
    !input.readOnly &&
    ["text", "email"].includes(input.type) &&
    (input.maxLength < 0 || value.length <= input.maxLength) &&
    (input.value === "" || input.value === value);
  if (!writable()) return false;
  setter.call(input, value);
  return (
    commitGreetingEmailInput(input, writable) &&
    input.isConnected &&
    input.value === value
  );
}
export const greetingWriteAdapter: CompanyWriteAdapter = {
  tryWrite(handle, item) {
    if (
      /^languagesCertificationsAndOtherActivity\.certifiedLanguageTests\.\d+\.score\.score$/.test(
        handle.candidate.domName ?? "",
      ) &&
      (!/^\d+(?:\.\d+)?$/.test(item.profileValue ?? "") ||
        !Number.isFinite(Number(item.profileValue)))
    )
      return { handled: true, written: false };
    if (
      /^workHistory\.workExperiences\.\d+\.employmentStatus$/.test(
        handle.candidate.domName ?? "",
      )
    )
      return { handled: true, written: greetingEmploymentWrite(handle, item) };
    if (handle.candidate.domName === "basicInformation.email")
      return { handled: true, written: greetingEmailWrite(handle, item) };
    if (
      handle.candidate.domName ===
        "militaryServicePreferentialEmploymentStatus.veteranStatus.veteransRegistrationNumber" &&
      !/^\d{2}-?\d{6}$/.test(item.profileValue ?? "")
    )
      return { handled: true, written: false };
    if (!greetingGpaSafe(handle, item))
      return { handled: true, written: false };
    if (
      handle.candidate.control === "radio" &&
      [...handle.optionElements.values()].some((element) =>
        element.matches('button[role="radio"]'),
      )
    )
      return { handled: true, written: greetingRadioWrite(handle, item) };
    // Search, calendar and custom selects must use the asynchronous state driver.
    if (
      handle.candidate.control === "button" ||
      item.analysis?.writePlan?.command === "SEARCH_SELECTION"
    )
      return { handled: true, written: false };
    return { handled: false };
  },
};
