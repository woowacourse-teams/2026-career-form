import { runSyncPlan } from "../sync-plan";
import { componentWriteRecipe, recipeBindingMatches } from "./write-recipe";
import { componentCapability } from "../component-policy";
import { componentCompletion } from "./completion";
import { componentRules } from "../runtime-rules";
import { componentSelector } from "../component-dom";
import {
  componentPolicy,
  componentPattern,
} from "../../policy/component-policy";
import { executionPolicy } from "../../workflow/execution-policy";
import { executeComponentCommit } from "../../interaction/component-email-close-bridge";
import { componentGpaSafe } from "./gpa";
import { componentSyntheticDomName, componentRowIdentity } from "./collection";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { CompanyWriteAdapter } from "../../adapters/write";

export const componentText = (element: Element) =>
  element.textContent?.replace(/\s+/g, " ").trim() ?? "";
export function componentUsable(element: Element): boolean {
  if (
    !element.isConnected ||
    element.matches(':disabled, [aria-disabled="true"]') ||
    element.closest('[hidden], [inert], [aria-hidden="true"]')
  )
    return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display !== "none" && style?.visibility !== "hidden";
}
export function componentApproved(
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
    componentGpaSafe(handle, item) &&
    handle.isCurrentContext?.() !== false
  );
}
export function componentRadioWrite(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  onClick?: () => void,
): boolean {
  if (
    !componentApproved(handle, item) ||
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
        !node.matches(
          componentRules(node.ownerDocument).radio.optionSelector,
        ) ||
        !componentUsable(node) ||
        !["true", "false"].includes(node.getAttribute("aria-checked") ?? "") ||
        componentText(node) !== entries[index].displayName,
    )
  )
    return false;
  const radios = nodes as HTMLElement[];
  const group = radios[0]?.closest(componentSelector(radios[0], "radioGroup"));
  if (
    !group ||
    componentSyntheticDomName(group) !== handle.candidate.domName ||
    radios.some((node) => node.closest('[role="radiogroup"]') !== group) ||
    group.querySelectorAll('[role="radio"]').length !== radios.length
  )
    return false;
  const target = handle.optionElements.get(matching[0].optionId)!;
  const checked = radios.filter(
    (node) => node.getAttribute("aria-checked") === "true",
  );
  if (
    checked.length > 0 &&
    (!componentRules(target.ownerDocument).radio.overwrite ||
      checked[0] === target)
  )
    return checked.length === 1 && checked[0] === target;
  onClick?.();
  target.click();
  return (
    target.getAttribute("aria-checked") === "true" &&
    radios.filter((node) => node.getAttribute("aria-checked") === "true")
      .length === 1
  );
}
/** The unchecked native control represents retired, not an empty profile choice. */
export function componentEmploymentStatusValue(
  handle: FieldCandidateHandle,
): string | undefined {
  const input = handle.elements[0];
  const options = handle.candidate.options ?? [];
  if (
    !(input instanceof HTMLInputElement) ||
    !executionPolicy(input.ownerDocument)?.componentPolicy ||
    !componentCapability(input.ownerDocument, "employment") ||
    input.type !== "checkbox" ||
    handle.elements.length !== 1 ||
    !componentUsable(input) ||
    handle.isCurrentContext?.() === false ||
    !componentPattern(input.ownerDocument, "employment").test(input.name) ||
    componentRowIdentity(
      input.closest(componentSelector(input, "row")) ?? input,
    )?.itemGroupId !== componentPolicy(input.ownerDocument).groups.employment ||
    input.ownerDocument.querySelectorAll(`[name="${input.name}"]`).length !==
      1 ||
    input.name !== handle.candidate.domName ||
    options.length !== 1 ||
    !componentPolicy(input.ownerDocument).labels.employmentOptions.includes(
      options[0].displayName,
    ) ||
    handle.optionElements.size !== 1 ||
    handle.optionElements.get(options[0].optionId) !== input
  )
    return undefined;
  const meaning = componentRules(input.ownerDocument).employment;
  return input.checked ? meaning.checkedValue : meaning.uncheckedValue;
}
export function componentEmploymentWrite(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  if (
    !componentApproved(handle, item) ||
    item.analysis?.writePlan?.command !== "CHECK_CHECKBOX"
  )
    return false;
  if (
    !handle.elements[0] ||
    !componentCapability(handle.elements[0].ownerDocument, "employment")
  )
    return false;
  const meaning = componentRules(handle.elements[0].ownerDocument).employment;
  const current = componentEmploymentStatusValue(handle);
  if (
    !current ||
    ![meaning.checkedValue, meaning.uncheckedValue].includes(
      item.profileValue ?? "",
    )
  )
    return false;
  if (current === item.profileValue) return true;
  if (current === meaning.checkedValue && !meaning.allowUncheck) return false;
  const input = handle.elements[0] as HTMLInputElement;
  input.click();
  return (
    input.isConnected &&
    input.checked === (item.profileValue === meaning.checkedValue)
  );
}
function writeConfiguredRecipe(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  recipe: NonNullable<ReturnType<typeof componentWriteRecipe>>,
): boolean {
  const input = handle.elements[0],
    value = item.profileValue;
  if (!(input instanceof HTMLInputElement) || !value) return false;
  const writable = () =>
    componentApproved(handle, item) &&
    recipeBindingMatches(handle, item, recipe) &&
    componentSyntheticDomName(input) === recipe.name &&
    componentUsable(input) &&
    !input.readOnly &&
    (input.maxLength < 0 || value.length <= input.maxLength);
  return (
    writable() &&
    runSyncPlan(recipe.plan, {
      targets: { input },
      values: { value },
      current: writable,
      bridges: { mainCommit: () => executeComponentCommit(input, writable) },
    })
  );
}
export const componentWriteAdapter: CompanyWriteAdapter = {
  completion: componentCompletion,
  tryWrite(handle, item) {
    const document = (handle.elements[0] ?? handle.customElements?.[0])
      ?.ownerDocument;
    if (!document || !executionPolicy(document)?.componentPolicy)
      return { handled: true, written: false };
    if (
      componentPattern(document, "numericScore").test(
        handle.candidate.domName ?? "",
      ) &&
      (!/^\d+(?:\.\d+)?$/.test(item.profileValue ?? "") ||
        !Number.isFinite(Number(item.profileValue)))
    )
      return { handled: true, written: false };
    if (
      componentPattern(document, "employmentWrite").test(
        handle.candidate.domName ?? "",
      )
    )
      return { handled: true, written: componentEmploymentWrite(handle, item) };
    const recipe = componentWriteRecipe(handle, item);
    if (recipe)
      return {
        handled: true,
        written: writeConfiguredRecipe(handle, item, recipe),
      };
    const format = componentPolicy(document).displayFormats.find(
      (rule) =>
        rule.control === handle.candidate.control &&
        new RegExp(rule.pattern).test(handle.candidate.domName ?? ""),
    );
    if (
      format &&
      !new RegExp(format.valuePattern).test(item.profileValue ?? "")
    )
      return { handled: true, written: false };
    if (!componentGpaSafe(handle, item))
      return { handled: true, written: false };
    if (
      handle.candidate.control === "radio" &&
      [...handle.optionElements.values()].some((element) =>
        element.matches('button[role="radio"]'),
      )
    )
      return { handled: true, written: componentRadioWrite(handle, item) };
    // Search, calendar and custom selects must use the asynchronous state driver.
    if (
      handle.candidate.control === "button" ||
      item.analysis?.writePlan?.command === "SEARCH_SELECTION"
    )
      return { handled: true, written: false };
    return { handled: false };
  },
};
