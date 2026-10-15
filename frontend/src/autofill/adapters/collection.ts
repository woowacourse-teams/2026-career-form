import { hiddenCodeAdapters } from "../policy/hidden-code";
import { createComponentCollectionAdapter } from "../policy/components/collection";
import { resolveCompany, resolveDocumentCompany } from "./company";
import { policyCollectionAdapter } from "../policy/collection";
import { executionPolicy } from "../workflow/execution-policy";

export type CollectionPhase = "fields" | "preparation";
export type CollectionSource = "adapter" | "generic";

export interface CollectionAdapter {
  readonly sectionSelectors: readonly string[];
  readonly collectsInputButtonFields: boolean;
  additionalActionElements?(document: Document): HTMLInputElement[];
  itemGroupId?(element: Element): string | undefined;
  actionDomId(element: HTMLElement): string | undefined;
  nestedGroupState?(action: HTMLElement): string[] | null | undefined;
  repeatableItemCandidates(container: Element): Element[] | undefined;
  requiresVisibleControl(
    phase: CollectionPhase,
    source: CollectionSource,
  ): boolean;
}

const genericCollectionAdapter: CollectionAdapter = {
  sectionSelectors: [],
  collectsInputButtonFields: false,
  actionDomId: () => undefined,
  repeatableItemCandidates: () => undefined,
  requiresVisibleControl: () => false,
};

export function collectionAdapterForHost(
  source: string | Document,
): CollectionAdapter {
  if (typeof source !== "string") {
    const configured = hiddenCodeAdapters(source);
    if (configured) return configured.collection;
  }
  if (typeof source !== "string" && executionPolicy(source)?.browserPolicy)
    return policyCollectionAdapter(source);
  switch (
    typeof source === "string"
      ? resolveCompany(source)
      : resolveDocumentCompany(source)
  ) {
    case "components":
      return typeof source === "string"
        ? genericCollectionAdapter
        : createComponentCollectionAdapter(source);
    case "policy":
    case "generic":
      return genericCollectionAdapter;
  }
}
