import { runDomPlan } from "../action-plan";
import {
  contractValue,
  contractPattern,
  type HiddenCodeContract,
} from "./contract";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { FailureReporter, WriteFailureCode } from "../../write/failure";
import type { WorkflowAdapter } from "../../adapters/workflow";
import { createCodedSearchModule } from "./coded-search";
import { createAddressModule } from "./address";
import { createFixedCodeSearchModule } from "./fixed-code-search";
import { createRepeatPreparationModule } from "./repeat-preparation";
import { createConditionalControlsModule } from "./conditional-controls";
import { evaluateDomCondition } from "./dom-condition";
import { visible } from "../primitives";

export function createWorkflowModule(
  document: Document,
  contract: HiddenCodeContract,
) {
  const rules = contract.behavior;
  const { runCodedSearch } = createCodedSearchModule(document, contract);
  const { runFixedCodeSearch } = createFixedCodeSearchModule(
    document,
    contract,
  );
  const { runAddress, addressFieldNames } = createAddressModule(
    document,
    contract,
  );
  const { prepareEducation } = createRepeatPreparationModule(
    document,
    contract,
  );
  const { conditionalDriverSettled, exactConditionalDriver } =
    createConditionalControlsModule(document, contract);
  const timeout = contractValue<number>(
    contract.definitions.settlementTimeoutMs,
  );
  function base(handle: FieldCandidateHandle) {
    return (handle.candidate.domName ?? handle.candidate.domId)?.replace(
      contractPattern(contract.patterns.indexSuffix),
      "",
    );
  }
  type Match = { field: string; key: string; command: string; group?: string };
  function matches(
    rule: Match,
    handle: FieldCandidateHandle,
    item: ReviewPlanItem,
  ) {
    return (
      base(handle) === rule.field &&
      (!rule.group || rule.group === handle.itemGroupId) &&
      item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
      item.analysis.interactionStatus === "READY" &&
      item.analysis.writePlan?.command === rule.command &&
      (item.analysis.valueBinding?.profileFieldKey ?? item.profileFieldKey) ===
        rule.key
    );
  }
  function driver(handle: FieldCandidateHandle, item?: ReviewPlanItem) {
    const found = rules.drivers.filter((rule) =>
      item
        ? matches(rule, handle, item)
        : base(handle) === rule.field &&
          (!rule.group || rule.group === handle.itemGroupId),
    );
    return found.length === 1 ? found[0] : undefined;
  }
  function waitFor(doc: Document, condition: () => boolean): Promise<boolean> {
    if (condition()) return Promise.resolve(true);
    const view = doc.defaultView;
    if (!view) return Promise.resolve(false);
    return new Promise((resolve) => {
      const finish = () => {
        observer.disconnect();
        view.clearTimeout(timer);
        resolve(condition());
      };
      const observer = new view.MutationObserver(() => {
        if (condition()) finish();
      });
      const timer = view.setTimeout(finish, timeout);
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    });
  }
  async function settle(
    doc: Document,
    handle: FieldCandidateHandle,
    failure?: FailureReporter,
  ) {
    const rule = driver(handle);
    if (rule?.conditional)
      return waitFor(doc, () => conditionalDriverSettled(doc, handle));
    const candidates = rules.settlements.filter(
      (rule) => rule.field === base(handle),
    );
    if (!candidates.length) return true;
    if (candidates.length !== 1) return false;
    const spec = candidates[0];
    const trigger = handle.elements[0];
    const group = trigger?.closest(spec.scope);
    if (!group) return false;
    const code = spec.selectedCodeSelector
      ? group.querySelector<HTMLInputElement>(spec.selectedCodeSelector)
      : undefined;
    const selectedCode = code?.value;
    const label =
      trigger instanceof HTMLInputElement ? trigger.value : undefined;
    const current = () =>
      group.isConnected &&
      trigger.isConnected &&
      trigger.closest(spec.scope) === group &&
      handle.isCurrentContext?.() !== false;
    const report = () => {
      if (
        spec.failureCode &&
        spec.failureCondition &&
        current() &&
        label?.trim() &&
        trigger instanceof HTMLInputElement &&
        trigger.value === label &&
        code?.isConnected &&
        code.value === selectedCode &&
        selectedCode?.trim() &&
        !evaluateDomCondition(group, spec.failureCondition)
      )
        failure?.(spec.failureCode as WriteFailureCode);
    };
    const ready = () =>
      current() && evaluateDomCondition(group, spec.condition);
    const actions = () =>
      spec.fallbackSelector
        ? Array.from(
            group.querySelectorAll<HTMLButtonElement>(spec.fallbackSelector),
          ).filter((el) => visible(el))
        : [];
    if (actions().length > 1) return false;
    const settled = await waitFor(
      doc,
      () => ready() || (current() && actions().length === 1),
    );
    if (!settled) report();
    if (!settled || ready()) return settled;
    const available = actions();
    if (!current() || available.length !== 1) return false;
    if (
      !spec.fallbackPlan ||
      !runDomPlan(spec.fallbackPlan, { control: available[0] }, {}, current)
    )
      return false;
    const done = await waitFor(doc, ready);
    if (!done) report();
    return done;
  }
  const workflowAdapter: WorkflowAdapter = {
    runAddress,
    addressFieldNames,
    prepareEducation,
    educationPreparationActionId: rules.prepareActionId,
    executeStateDriver: async (doc, handle, item, signal, failure) => {
      switch (driver(handle, item)?.handler) {
        case "CODED_SEARCH":
          return runCodedSearch(doc, handle, item, signal, failure);
        case "FIXED_CODE_SEARCH":
          return runFixedCodeSearch(doc, handle, item, signal);
        default:
          return undefined;
      }
    },
    repeatedProfileSectionHint: (id) =>
      id ? rules.repeatHints[id] : undefined,
    hasFreshRows: () => false,
    isFreshRowDefault: () => false,
    isStateDriver: () => false,
    stateDriverStage: (item, handle) => {
      if (!item.selected || item.disabled) return;
      const rule = driver(handle, item);
      if (!rule || (rule.conditional && !exactConditionalDriver(handle, item)))
        return;
      return rule.stage + (handle.itemIndex ?? 0) * rule.stride;
    },
    waitForStateDriverReady: (doc, handle) =>
      driver(handle)?.waitForOptions
        ? waitFor(
            doc,
            () =>
              !!handle.elements[0] &&
              evaluateDomCondition(handle.elements[0], rules.ownOptions),
          )
        : Promise.resolve(true),
    settleStateDriver: settle,
    stateDriverFailureGroup: (item, handle) => {
      const trigger = handle.elements[0];
      if (!trigger?.isConnected || handle.elements.length !== 1) return;
      const candidates = rules.failureScopes.filter((rule) =>
        matches(rule, handle, item),
      );
      if (candidates.length !== 1) return;
      const rule = candidates[0];
      if (rule.conditional && !exactConditionalDriver(handle, item)) return;
      if (
        rule.inputType &&
        (!(trigger instanceof HTMLInputElement) ||
          trigger.type !== rule.inputType)
      )
        return;
      if (rule.idPattern && !new RegExp(rule.idPattern).test(trigger.id))
        return;
      if (
        rule.attributes &&
        !Object.entries(rule.attributes).every(
          ([key, value]) => trigger.getAttribute(key) === value,
        )
      )
        return;
      const scope = trigger.closest<HTMLElement>(rule.scope);
      if (!scope) return;
      const ancestor = rule.ancestor
        ? trigger.closest(rule.ancestor)
        : undefined;
      if (rule.ancestor && (!ancestor || !ancestor.contains(scope))) return;
      return !rule.condition || evaluateDomCondition(scope, rule.condition)
        ? scope
        : undefined;
    },
    revealSelections: [],
    selectReveal: () => ({ code: "TARGET_MISSING", count: 0 }),
    revealedBindings: () => new Map(),
    revealedProfileFieldKey: () => undefined,
  };
  return { workflowAdapter };
}
