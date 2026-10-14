import { runDomPlan, evaluatePlanConditions } from "../action-plan";
import { hiddenCodeRules } from "../runtime-rules";
// Common executor for forms with hidden codes and DOM-backed option controls.
import {
  contractValue,
  contractText,
  contractPattern,
  type HiddenCodeContract,
} from "./contract";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { normalizeDisplayName } from "../../write/display-name";
import { matchStandardOption } from "../../profile/standard-option-match";
import { catalogApprovalForItem } from "../../profile/catalog-identity";
import {
  matchesApprovedCatalog,
  type ApprovedCatalogMatch,
} from "../../profile/catalog-match";
import {
  rememberCatalogSelection,
  retainedCatalogSelection,
} from "../../profile/catalog-receipt";
import type { CompanyWriteAdapter } from "../../adapters/write";
import { createConditionalControlsModule } from "./conditional-controls";
export function createWriteModule(
  document: Document,
  contract: HiddenCodeContract,
) {
  const { dependentDriverSettled, exactConditionalArticle } =
    createConditionalControlsModule(document, contract);

  interface ExactButtonSpec {
    codegb: string;
    profileFieldKey: string;
    transitionByCode?: ReadonlyMap<
      string,
      { enabled: string; disabled: string; valid?: string }
    >;
  }

  interface AcademicSelectionSpec {
    idBase: string;
    hiddenName: string;
    codegb: string;
    profileSuffix: string;
    allowedGroups: string[];
    options: ReadonlyMap<string, string>;
    controlType: "button" | "text";
    codeAttribute: string;
    classes: string[];
    attributes: Record<string, string>;
    gates: { selector: string; value: string }[];
  }

  const ACADEMIC_SELECTION_SPECS: readonly AcademicSelectionSpec[] =
    contractValue<readonly AcademicSelectionSpec[]>(
      contract.definitions.repeatedOptions,
    );

  function academicSelectionSpec(
    id: string | undefined,
  ): AcademicSelectionSpec | undefined {
    if (!id) return undefined;
    return ACADEMIC_SELECTION_SPECS.find((spec) =>
      new RegExp(
        contractText(contract.templates.indexedControl, [spec.idBase]),
      ).test(id),
    );
  }

  function selectAcademicSelection(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
    trigger: HTMLInputElement,
    spec: AcademicSelectionSpec,
  ): boolean {
    const binding = item.analysis?.valueBinding;
    const id = handle.candidate.domId;
    const display = item.profileValue;
    const code = display
      ? binding?.type === "BUTTON_OPTION"
        ? binding.optionCodeMap[display]
        : undefined
      : undefined;
    const article = trigger.closest<HTMLElement>(
      contract.targets.repeatSection,
    );
    const row = trigger.closest<HTMLElement>(contract.targets.row);
    const wrap = trigger.closest<HTMLElement>(contract.targets.optionContainer);
    const expectedKey = contractText(contract.templates.profilePath, [
      contract.behavior.groupSections[handle.itemGroupId ?? ""],
      spec.profileSuffix,
    ]);
    const hidden = Array.from(
      wrap?.querySelectorAll<HTMLInputElement>(
        contractText(contract.templates.directBoundHidden, [spec.hiddenName]),
      ) ?? [],
    );
    if (
      !id ||
      !display ||
      !code ||
      spec.options.get(display) !== code ||
      handle.elements.length !== 1 ||
      item.candidateId !== handle.candidateId ||
      item.analysis?.candidateId !== item.candidateId ||
      item.analysis?.mappingStatus !== "ADAPTER_VERIFIED" ||
      item.analysis.interactionStatus !== "READY" ||
      item.analysis.writePlan?.command !== "SELECT_BUTTON_OPTION" ||
      binding?.type !== "BUTTON_OPTION" ||
      binding.profileFieldKey !== expectedKey ||
      !spec.allowedGroups.includes(handle.itemGroupId ?? "") ||
      handle.candidate.domName !== undefined ||
      handle.candidate.domId !== id ||
      handle.candidate.element !== "input" ||
      handle.candidate.control !== spec.controlType ||
      !article ||
      !row ||
      (hiddenCodeRules(document).rowRelation === "DIRECT_CHILD"
        ? row.parentElement !== article
        : !article.contains(row)) ||
      !wrap ||
      trigger.id !== id ||
      trigger.type !== spec.controlType ||
      !trigger.isConnected ||
      !trigger.classList.contains(contract.tokens.triggerClass) ||
      trigger.getAttribute(spec.codeAttribute) !== spec.codegb ||
      article.querySelectorAll(
        contractText(contract.templates.idSelector, [id]),
      ).length !== 1 ||
      hidden.length !== 1
    )
      return false;
    if (
      !spec.classes.every((name) => trigger.classList.contains(name)) ||
      !Object.entries(spec.attributes).every(
        ([name, value]) => trigger.getAttribute(name) === value,
      ) ||
      !spec.gates.every((gate) => {
        const controls = row.querySelectorAll<HTMLInputElement>(gate.selector);
        return controls.length === 1 && controls[0].value === gate.value;
      })
    )
      return false;
    const hiddenValue = hidden[0]!;
    const current = normalizeDisplayName(item.currentValue);
    const actual = normalizeDisplayName(trigger.value);
    if (
      !hiddenCodeRules(document).overwriteSelections &&
      (current || actual || hiddenValue.value.trim())
    ) {
      return (
        current === normalizeDisplayName(display) &&
        actual === normalizeDisplayName(display) &&
        hiddenValue.value === code
      );
    }
    trigger.click();
    const choices = Array.from(
      wrap.querySelectorAll<HTMLButtonElement>(
        contract.targets.optionDescendants,
      ),
    ).filter(
      (choice) =>
        choice.offsetParent !== null &&
        normalizeDisplayName(choice.textContent ?? "") ===
          normalizeDisplayName(display),
    );
    if (
      choices.length !== 1 ||
      choices[0]!.dataset[contract.behavior.datasetKeys.code] !== code
    )
      return false;
    choices[0]!.click();
    return evaluatePlanConditions(
      contract.behavior.confirmations.option,
      { display: trigger, hidden: hiddenValue },
      { query: display!, code: code! },
    );
  }
  const EXACT_BUTTONS = contractValue<Map<string, ExactButtonSpec>>(
    contract.definitions.conditionalOptions,
  );

  function exactTextContract(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
    id: string,
  ): boolean {
    const input = handle.elements[0];
    const binding = item.analysis?.valueBinding;
    const article = input ? exactConditionalArticle(input) : undefined;
    const rules = contract.behavior.textControls.filter(
      (rule) => rule.id === id,
    );
    if (rules.length !== 1) return false;
    const rule = rules[0];
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
      article.querySelectorAll(
        contractText(contract.templates.textByIdAndName, [id, id]),
      ).length !== 1 ||
      !dependentDriverSettled(input.ownerDocument, id)
    ) {
      return false;
    }
    return (
      binding?.type === rule.binding &&
      binding.profileFieldKey === rule.key &&
      (!rule.recipe ||
        (binding.type === "DERIVED" && binding.recipe === rule.recipe)) &&
      input.maxLength === rule.maxLength &&
      Object.entries(rule.attributes).every(
        ([name, value]) => input.getAttribute(name) === value,
      ) &&
      contractPattern(rule.pattern).test(item.profileValue ?? "") &&
      input.closest(rule.ancestor) !== null
    );
  }

  function exactCodedHidden(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
    trigger: HTMLInputElement,
    displayName: string,
    code: string,
    spec: HiddenCodeContract["behavior"]["codedButtons"][number],
  ): HTMLInputElement | undefined {
    const rowMatch = new RegExp(spec.idPattern).exec(trigger.id);
    const binding = item.analysis?.valueBinding;
    if (
      item.candidateId !== handle.candidateId ||
      item.analysis?.candidateId !== item.candidateId ||
      binding?.type !== "BUTTON_OPTION" ||
      binding.profileFieldKey !== spec.key ||
      handle.itemGroupId !== spec.group ||
      !rowMatch ||
      handle.candidate.domId !== trigger.id ||
      trigger.name !== "" ||
      !Object.entries(spec.attributes).every(
        ([name, value]) => trigger.getAttribute(name) === value,
      ) ||
      spec.codes[displayName] !== code
    ) {
      return undefined;
    }
    const selectWrap = trigger.closest(contract.targets.optionContainer);
    const matches = Array.from(
      selectWrap?.querySelectorAll<HTMLInputElement>(spec.hiddenSelector) ?? [],
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

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

  function visibleCatalogButton(button: HTMLButtonElement): boolean {
    if (
      !button.isConnected ||
      button.offsetParent === null ||
      button.disabled ||
      button.matches(":disabled")
    )
      return false;
    const view = button.ownerDocument.defaultView;
    if (!view) return false;
    for (
      let node: HTMLElement | null = button;
      node;
      node = node.parentElement
    ) {
      const style = view.getComputedStyle(node);
      if (
        node.matches(contract.targets.inaccessibleAncestors) ||
        style.display === "none" ||
        style.visibility === "hidden"
      )
        return false;
    }
    return true;
  }

  function selectCatalogButton(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
    match: ApprovedCatalogMatch,
  ): boolean {
    const trigger = handle.elements[0];
    const binding = item.analysis?.valueBinding;
    const specs = contract.behavior.catalogButtons.filter(
      (rule) =>
        rule.key === binding?.profileFieldKey && rule.kind === match.kind,
    );
    if (specs.length !== 1) return false;
    const spec = specs[0];
    if (
      !(trigger instanceof HTMLInputElement) ||
      binding?.type !== "BUTTON_OPTION" ||
      match.kind !== spec.kind ||
      binding.profileFieldKey !== spec.key ||
      binding.optionMap[match.query] !== item.profileValue ||
      handle.elements.length !== 1 ||
      handle.candidate.control !== "button" ||
      !new RegExp(spec.idPattern).test(handle.candidate.domId ?? "") ||
      trigger.id !== handle.candidate.domId ||
      trigger.type !== "button" ||
      !trigger.isConnected ||
      trigger.disabled ||
      handle.isCurrentContext?.() === false ||
      item.candidateId !== handle.candidateId ||
      item.analysis?.candidateId !== item.candidateId ||
      item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
      item.analysis.interactionStatus !== "READY" ||
      !item.selected ||
      item.disabled
    )
      return false;
    const wrap = trigger.closest<HTMLElement>(contract.targets.optionContainer);
    const row = trigger.closest(contract.targets.row);
    const hidden = wrap?.querySelectorAll<HTMLInputElement>(
      spec.hiddenSelector,
    );
    if (
      !wrap ||
      !row ||
      hidden?.length !== 1 ||
      wrap.querySelectorAll(contract.targets.buttonInput).length !== 1
    )
      return false;
    const codeField = hidden[0]!;
    const rowOwner = row.parentElement;
    const triggerId = trigger.id;
    if (retainedCatalogSelection(item, trigger) !== undefined) return true;
    if (
      !hiddenCodeRules(document).overwriteSelections &&
      (normalizeDisplayName(item.currentValue) ||
        normalizeDisplayName(trigger.value) ||
        codeField.value.trim())
    )
      return false;
    const originalDisplay = trigger.value;
    const originalCode = codeField.value;
    trigger.click();
    const choices = Array.from(
      wrap.querySelectorAll<HTMLButtonElement>(
        contract.targets.optionDescendants,
      ),
    ).filter(
      (choice) =>
        choice.closest(contract.targets.optionContainer) === wrap &&
        visibleCatalogButton(choice) &&
        matchesApprovedCatalog(match, { label: choice.textContent ?? "" }),
    );
    if (
      choices.length !== 1 ||
      !choices[0]!.dataset[contract.behavior.datasetKeys.code]?.trim() ||
      trigger.value !== originalDisplay ||
      codeField.value !== originalCode ||
      handle.isCurrentContext?.() === false
    )
      return false;
    const choice = choices[0]!;
    const code = choice.dataset[contract.behavior.datasetKeys.code]!;
    const label = choice.textContent ?? "";
    choice.click();
    return rememberCatalogSelection(item, {
      element: trigger,
      evidence: { label },
      verify: () =>
        trigger.isConnected &&
        codeField.isConnected &&
        wrap.isConnected &&
        row.isConnected &&
        trigger.id === triggerId &&
        !trigger.disabled &&
        row.parentElement === rowOwner &&
        trigger.closest(contract.targets.optionContainer) === wrap &&
        trigger.closest(contract.targets.row) === row &&
        wrap.querySelectorAll(contract.targets.buttonInput).length === 1 &&
        wrap.querySelector(contract.targets.buttonInput) === trigger &&
        wrap.querySelectorAll(spec.hiddenSelector).length === 1 &&
        wrap.querySelector(spec.hiddenSelector) === codeField &&
        codeField.closest(contract.targets.optionContainer) === wrap &&
        handle.isCurrentContext?.() !== false &&
        evaluatePlanConditions(
          contract.behavior.confirmations.catalogOption,
          { display: trigger, hidden: codeField },
          { query: label, code },
        ),
    });
  }

  function selectButtonOption(
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
  ): boolean {
    const binding = item.analysis?.valueBinding;
    const displayName = item.profileValue;
    const approval = catalogApprovalForItem(item);
    if (approval.status === "invalid") return false;
    if (approval.status === "selected")
      return selectCatalogButton(handle, item, approval.match);
    if (binding?.type !== "BUTTON_OPTION" || !displayName) return false;
    const trigger = handle.elements[0];
    if (!(trigger instanceof HTMLInputElement)) return false;
    const academicSpec = academicSelectionSpec(handle.candidate.domId);
    if (academicSpec)
      return selectAcademicSelection(handle, item, trigger, academicSpec);
    if (handle.candidate.control !== "button" || trigger.type !== "button")
      return false;
    const code = binding.optionCodeMap[displayName];
    const exactSpec = handle.candidate.domId
      ? EXACT_BUTTONS.get(handle.candidate.domId)
      : undefined;
    if (exactSpec) {
      if (!code) return false;
      const id = handle.candidate.domId!;
      const article = exactConditionalArticle(trigger);
      const exactTriggers = article?.querySelectorAll<HTMLInputElement>(
        contractText(contract.templates.buttonById, [id]),
      );
      const exactWrap = trigger.closest(contract.targets.optionContainer);
      const exactHidden = exactWrap?.querySelectorAll<HTMLInputElement>(
        contractText(contract.templates.directHiddenByName, [id]),
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
        trigger.dataset[contract.behavior.datasetKeys.codegb] !==
          exactSpec.codegb ||
        binding.profileFieldKey !== exactSpec.profileFieldKey ||
        exactTriggers?.length !== 1 ||
        exactHidden?.length !== 1 ||
        !exactHidden[0]!.classList.contains(contract.tokens.boundClass) ||
        !dependentDriverSettled(trigger.ownerDocument, id)
      ) {
        return false;
      }
      const transition = exactSpec.transitionByCode?.get(code);
      const exactChoices = Array.from(
        exactWrap.querySelectorAll<HTMLButtonElement>(
          contract.targets.directOptions,
        ),
      ).filter(
        (choice) =>
          choice.dataset[contract.behavior.datasetKeys.code] === code &&
          normalizeDisplayName(choice.textContent ?? "") ===
            normalizeDisplayName(displayName) &&
          (!transition ||
            ((choice.dataset[contract.behavior.datasetKeys.enabled] ?? "") ===
              transition.enabled &&
              (choice.dataset[contract.behavior.datasetKeys.disabled] ?? "") ===
                transition.disabled &&
              (transition.valid === undefined ||
                (choice.dataset[contract.behavior.datasetKeys.valid] ?? "") ===
                  transition.valid))),
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
      if (originalValue && !hiddenCodeRules(document).overwriteSelections) {
        return (
          originalValue === normalizeDisplayName(displayName) &&
          actualValue === normalizeDisplayName(displayName) &&
          hidden.value === code
        );
      }
      if (
        !hiddenCodeRules(document).overwriteSelections &&
        (actualValue || hidden.value.trim())
      ) {
        return (
          actualValue === normalizeDisplayName(displayName) &&
          hidden.value === code
        );
      }
    }
    const selectWrap = trigger.closest(contract.targets.optionContainer);
    if (!selectWrap) return false;
    const codedMatches = contract.behavior.codedButtons.filter(
      (rule) => rule.key === binding.profileFieldKey,
    );
    if (codedMatches.length > 1) return false;
    const codedSpec = codedMatches[0];
    let hiddenValue: HTMLInputElement | undefined;
    if (codedSpec) {
      if (!code) return false;
      hiddenValue = exactCodedHidden(
        handle,
        item,
        trigger,
        displayName,
        code,
        codedSpec,
      );
      if (!hiddenValue) return false;
      const currentValue = normalizeDisplayName(item.currentValue);
      const triggerValue = normalizeDisplayName(trigger.value);
      if (currentValue && !hiddenCodeRules(document).overwriteSelections) {
        return (
          currentValue === normalizeDisplayName(displayName) &&
          triggerValue === normalizeDisplayName(displayName) &&
          hiddenValue.value === code
        );
      }
      if (
        !hiddenCodeRules(document).overwriteSelections &&
        (triggerValue || hiddenValue.value.trim())
      ) {
        return (
          triggerValue === normalizeDisplayName(displayName) &&
          hiddenValue.value === code
        );
      }
    }
    trigger.click();
    const choices = Array.from(
      selectWrap.querySelectorAll<HTMLButtonElement>(
        contract.targets.optionDescendants,
      ),
    ).filter((choice) => choice.offsetParent !== null);
    const exactChoices = choices.filter(
      (choice) =>
        choice.dataset[contract.behavior.datasetKeys.code] === code &&
        normalizeDisplayName(choice.textContent ?? "") ===
          normalizeDisplayName(displayName),
    );
    const choice =
      exactSpec || codedSpec
        ? exactChoices.length === 1
          ? exactChoices[0]
          : undefined
        : matchingLiveButtonOption(displayName, choices);
    if (!choice || !choice.dataset[contract.behavior.datasetKeys.code])
      return false;
    choice.click();
    hiddenValue ??=
      selectWrap.querySelector<HTMLInputElement>(
        contract.targets.hiddenValue,
      ) ?? undefined;
    return (
      normalizeDisplayName(trigger.value) ===
        normalizeDisplayName(choice.textContent ?? "") &&
      hiddenValue?.value === choice.dataset[contract.behavior.datasetKeys.code]
    );
  }

  const writeAdapter: CompanyWriteAdapter = {
    verifyRetained(handle, item) {
      if (item.analysis?.writePlan?.command !== "SELECT_BUTTON_OPTION")
        return undefined;
      const trigger = handle.elements[0];
      const binding = item.analysis.valueBinding;
      const display = item.profileValue;
      if (
        !(trigger instanceof HTMLInputElement) ||
        !display ||
        binding?.type !== "BUTTON_OPTION"
      )
        return false;
      const code = binding.optionCodeMap[display];
      const codedRules = contract.behavior.codedButtons.filter(
        (rule) => rule.key === binding.profileFieldKey,
      );
      if (codedRules.length > 1) return false;
      const codedRule = codedRules[0];
      if (
        codedRule &&
        (!code ||
          !exactCodedHidden(handle, item, trigger, display, code, codedRule))
      )
        return false;
      const hidden = trigger
        .closest(contract.targets.optionContainer)
        ?.querySelectorAll<HTMLInputElement>(
          codedRule?.hiddenSelector ?? contract.targets.hiddenValue,
        );
      return (
        !!code &&
        hidden?.length === 1 &&
        evaluatePlanConditions(
          contract.behavior.confirmations.option,
          { display: trigger, hidden: hidden[0] },
          { query: display, code },
        )
      );
    },
    tryWrite(handle, item) {
      const catalogRules = contract.behavior.catalogTexts.filter(
        (rule) => rule.name === handle.candidate.domName,
      );
      if (catalogRules.length > 1) return { handled: true, written: false };
      const catalogRule = catalogRules[0];
      if (catalogRule && item.searchIdentity?.status === "selected") {
        const approval = catalogApprovalForItem(item);
        const input = handle.elements[0];
        const binding = item.analysis?.valueBinding;
        if (
          approval.status !== "selected" ||
          approval.match.kind !== catalogRule.kind ||
          binding?.type !== "DIRECT" ||
          binding.profileFieldKey !== catalogRule.key ||
          item.analysis?.writePlan?.command !== "SET_TEXT" ||
          !(input instanceof HTMLInputElement) ||
          input.type !== "text" ||
          input.name !== catalogRule.name ||
          input.getAttribute(catalogRule.forbiddenDataAttribute) ||
          input.closest(catalogRule.forbiddenAncestor) ||
          !matchesApprovedCatalog(approval.match, {
            label: item.profileValue ?? "",
          }) ||
          (hiddenCodeRules(document).protectCatalogText &&
            input.value.trim() !== "" &&
            input.value !== item.profileValue)
        )
          return { handled: true, written: false };
      }
      if (
        contract.behavior.delegatedFields.includes(
          handle.candidate.domName ?? "",
        )
      )
        return { handled: true, written: false };
      const exactTextId = contract.behavior.textControls.find(
        (rule) =>
          handle.candidate.domId === rule.id ||
          handle.candidate.domName === rule.id,
      )?.id;
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
        const container = element.closest<HTMLElement>(contract.targets.field);
        if (container)
          runDomPlan(
            contract.behavior.actionPlans.afterTextWrite,
            { container },
            {},
            () => element.isConnected,
          );
      }
    },
  };

  return { writeAdapter };
}
