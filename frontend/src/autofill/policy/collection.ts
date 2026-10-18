import type { CollectionAdapter } from "../adapters/collection";
import { executionPolicy } from "../workflow/execution-policy";
import { text } from "./primitives";
export function policyCollectionAdapter(document: Document): CollectionAdapter {
  const policy = executionPolicy(document)?.browserPolicy?.collection;
  return {
    sectionSelectors: policy?.sectionSelectors ?? [],
    collectsInputButtonFields: policy?.collectsInputButtonFields ?? false,
    requiresVisibleControl: (phase) =>
      policy?.visiblePhases.includes(phase) ?? false,
    repeatableItemCandidates: () => undefined,
    actionDomId(element) {
      if (!(element instanceof HTMLButtonElement)) return;
      const matches =
        policy?.actions.filter((rule) => {
          if (
            text(element.textContent) !== rule.label ||
            !element.matches(rule.selector)
          )
            return false;
          if (
            rule.parentSelector &&
            !element.parentElement?.matches(rule.parentSelector)
          )
            return false;
          if (
            rule.grandparentSelector &&
            !element.parentElement?.parentElement?.matches(
              rule.grandparentSelector,
            )
          )
            return false;
          if (!rule.rowSelector) return true;
          const row = element.closest(rule.rowSelector);
          const root = rule.rootSelector && row?.closest(rule.rootSelector);
          const asset =
            rule.assetSelector && element.closest(rule.assetSelector);
          return (
            !!row &&
            !!root &&
            root.contains(row) &&
            !!asset &&
            row.contains(asset) &&
            asset.closest(rule.rowSelector) === row &&
            (!rule.requiredSelector ||
              row.querySelectorAll(rule.requiredSelector).length === 1)
          );
        }) ?? [];
      return matches.length === 1 ? matches[0].id : undefined;
    },
  };
}
