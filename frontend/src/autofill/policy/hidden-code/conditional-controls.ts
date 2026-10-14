// Common executor for forms with hidden codes and DOM-backed option controls.
import {
  contractValue,
  contractText,
  contractPattern,
  type HiddenCodeContract,
} from "./contract";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

export function createConditionalControlsModule(
  document: Document,
  contract: HiddenCodeContract,
) {
  const CONDITIONAL_DRIVERS = contractValue<
    Map<string, { codegb: string; profileFieldKey: string }>
  >(contract.definitions.conditionalDrivers);

  type ConditionalDriver = string;

  function exactConditionalArticle(element: Element): HTMLElement | undefined {
    const article = element.closest<HTMLElement>(
      contract.targets.conditionalSection,
    );
    return article && element.closest(contract.targets.section) === article
      ? article
      : undefined;
  }

  function exactDriverTrigger(
    document: Document,
    id: ConditionalDriver,
  ): HTMLInputElement | undefined {
    const article = document.querySelector<HTMLElement>(
      contract.targets.conditionalSection,
    );
    if (!article) return undefined;
    const triggers = article.querySelectorAll<HTMLInputElement>(
      contractText(contract.templates.buttonById, [id]),
    );
    if (triggers.length !== 1) return undefined;
    const trigger = triggers[0]!;
    const spec = CONDITIONAL_DRIVERS.get(id);
    if (!spec) return undefined;
    const wrap = trigger.closest(contract.targets.optionContainer);
    const hidden = wrap?.querySelectorAll<HTMLInputElement>(
      contractText(contract.templates.directHiddenByName, [id]),
    );
    return trigger.name === "" &&
      trigger.dataset[contract.behavior.datasetKeys.codegb] === spec.codegb &&
      trigger.classList.contains(contract.tokens.triggerClass) &&
      trigger.isConnected &&
      exactConditionalArticle(trigger) === article &&
      trigger.closest(contract.targets.field) &&
      hidden?.length === 1 &&
      hidden[0]!.classList.contains(contract.tokens.boundClass)
      ? trigger
      : undefined;
  }

  function exactConditionalDriver(
    handle: FieldCandidateHandle,
    item?: ReviewPlanItem,
  ): ConditionalDriver | undefined {
    const id = handle.candidate.domId;
    const spec = id ? CONDITIONAL_DRIVERS.get(id) : undefined;
    const trigger = handle.elements[0];
    if (
      !spec ||
      !id ||
      handle.elements.length !== 1 ||
      !(trigger instanceof HTMLInputElement) ||
      trigger !== exactDriverTrigger(trigger.ownerDocument, id) ||
      handle.candidate.domName !== undefined ||
      handle.candidate.element !== "input" ||
      handle.candidate.control !== "button"
    ) {
      return undefined;
    }
    if (
      item &&
      (item.candidateId !== handle.candidateId ||
        item.analysis?.candidateId !== item.candidateId ||
        item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
        item.analysis.interactionStatus !== "READY" ||
        item.analysis.writePlan?.command !== "SELECT_BUTTON_OPTION" ||
        item.analysis.valueBinding?.type !== "BUTTON_OPTION" ||
        item.analysis.valueBinding.profileFieldKey !== spec.profileFieldKey)
    ) {
      return undefined;
    }
    return id;
  }

  function driverValue(
    trigger: HTMLInputElement,
    id: ConditionalDriver,
  ): { display: string; code: string } | undefined {
    const hidden = trigger
      .closest(contract.targets.optionContainer)!
      .querySelector<HTMLInputElement>(
        contractText(contract.templates.directHiddenByName, [id]),
      )!;
    return trigger.value && hidden.value
      ? { display: trigger.value, code: hidden.value }
      : undefined;
  }

  function driverStateSettled(
    document: Document,
    id: ConditionalDriver,
  ): boolean {
    const trigger = exactDriverTrigger(document, id);
    if (!trigger) return false;
    const value = driverValue(trigger, id);
    if (!value) return false;
    const matches = contract.behavior.conditionalStates.filter(
      (r) =>
        r.driver === id && r.code === value.code && r.label === value.display,
    );
    if (matches.length !== 1) return false;
    return matches[0].controls.every((rule) => {
      const article = document.querySelector(
        contract.targets.conditionalSection,
      );
      const controls = article?.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement
      >(contractText(contract.templates.visibleValueById, [rule.id]));
      if (!controls) return false;
      if (!controls.length) return rule.allowAbsent;
      return (
        controls.length === 1 &&
        controls[0].disabled === rule.disabled &&
        (rule.required === undefined || controls[0].required === rule.required)
      );
    });
  }

  function driverMatches(
    document: Document,
    id: ConditionalDriver,
    display: string,
    code: string,
  ): boolean {
    const trigger = exactDriverTrigger(document, id);
    const value = trigger ? driverValue(trigger, id) : undefined;
    return (
      value?.display === display &&
      value.code === code &&
      driverStateSettled(document, id)
    );
  }

  function conditionalDriverSettled(
    document: Document,
    handle: FieldCandidateHandle,
  ): boolean {
    const id = exactConditionalDriver(handle);
    return id ? driverStateSettled(document, id) : false;
  }

  function dependentDriverSettled(
    document: Document,
    fieldId: string,
  ): boolean {
    const rules = contract.behavior.dependencies.filter((r) =>
      r.fields.includes(fieldId),
    );
    return rules.every((rule) =>
      driverMatches(document, rule.driver, rule.label, rule.code),
    );
  }

  return {
    CONDITIONAL_DRIVERS,
    exactConditionalArticle,
    exactConditionalDriver,
    conditionalDriverSettled,
    dependentDriverSettled,
  };
}
