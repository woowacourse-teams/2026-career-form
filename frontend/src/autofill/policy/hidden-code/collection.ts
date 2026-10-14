import { hiddenCodeRules } from "../runtime-rules";
import { evaluateDomCondition } from "./dom-condition";
// Common executor for forms with hidden codes and DOM-backed option controls.
import {
  contractValue,
  contractText,
  contractPattern,
  type HiddenCodeContract,
} from "./contract";
import type { CollectionAdapter } from "../../adapters/collection";
import { createAddressModule } from "./address";
export function createCollectionModule(
  document: Document,
  contract: HiddenCodeContract,
) {
  const { addressTrigger } = createAddressModule(document, contract);

  function directFieldContents(scope: HTMLElement): HTMLElement[] {
    return Array.from(
      scope.querySelectorAll(hiddenCodeRules(document).rowSelector),
    ).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child.classList.contains(contract.tokens.rowClass),
    );
  }

  type RowControlSpec = {
    element: "input" | "textarea";
    idBase: string;
    name: string;
    type?: string;
  };

  function fieldIndex(control: Element, idBase: string): number | undefined {
    const match = new RegExp(
      contractText(contract.templates.indexedAction, [idBase]),
    ).exec(control.id);
    return match ? Number(match[1]) : undefined;
  }

  function controlsInRow(
    scope: HTMLElement,
    row: HTMLElement,
  ): (HTMLInputElement | HTMLTextAreaElement)[] {
    return Array.from(
      row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input, textarea",
      ),
    ).filter(
      (control) =>
        control.closest(contract.targets.section) === scope &&
        control.closest(contract.targets.row) === row,
    );
  }

  function hasVerifiedRow(
    scope: HTMLElement,
    fields: readonly RowControlSpec[],
  ): boolean {
    return directFieldContents(scope).some((row) => {
      const controls = controlsInRow(scope, row);
      let expectedIndex: number | undefined;
      for (const field of fields) {
        const control = controls.find(
          (candidate) =>
            candidate.tagName.toLowerCase() === field.element &&
            candidate.name === field.name &&
            (field.type === undefined ||
              (candidate instanceof HTMLInputElement &&
                candidate.type === field.type)),
        );
        if (!control) return false;
        const index = fieldIndex(control, field.idBase);
        if (
          index === undefined ||
          (expectedIndex !== undefined && index !== expectedIndex)
        ) {
          return false;
        }
        expectedIndex = index;
      }
      return expectedIndex !== undefined;
    });
  }

  const collectionAdapter: CollectionAdapter = {
    sectionSelectors: [contract.targets.section],
    collectsInputButtonFields: true,
    additionalActionElements(document) {
      const trigger = addressTrigger(document);
      return trigger ? [trigger] : [];
    },
    itemGroupId(element) {
      const identity = contract.behavior.groupIdentity;
      if (!element.matches(identity.rootSelector)) return undefined;
      const matches = identity.rules.filter((rule) =>
        evaluateDomCondition(element, rule.condition),
      );
      return matches.length === 1 ? matches[0].group : undefined;
    },
    actionDomId(element) {
      if (element === addressTrigger(element.ownerDocument))
        return contract.tokens.addressAction;
      if (
        !(element instanceof HTMLButtonElement) ||
        !element.classList.contains(contract.tokens.addClass)
      ) {
        return undefined;
      }
      const scope = element.closest<HTMLElement>(contract.targets.section);
      if (!scope) return undefined;
      if (scope.id)
        return contractText(contract.templates.addAction, [scope.id]);
      const matches = contract.behavior.rowActions.filter((rule) =>
        hasVerifiedRow(scope, rule.fields),
      );
      return matches.length === 1 ? matches[0].id : undefined;
    },
    repeatableItemCandidates(container) {
      if (!container.matches(contract.targets.section)) return undefined;
      return Array.from(
        container.querySelectorAll(hiddenCodeRules(document).rowSelector),
      ).filter((child) => child.classList.contains(contract.tokens.rowClass));
    },
    requiresVisibleControl: (_phase, source) => source === "adapter",
  };

  return { collectionAdapter };
}
