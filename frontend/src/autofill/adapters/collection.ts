import { resolveCompany } from "./company";
import { hyundaiCollectionAdapter } from "./hyundai/collection";
import { skCollectionAdapter } from "./sk/collection";

export type CollectionPhase = "fields" | "preparation";
export type CollectionSource = "adapter" | "generic";

export interface CollectionAdapter {
  readonly sectionSelectors: readonly string[];
  readonly collectsInputButtonFields: boolean;
  additionalActionElements?(document: Document): HTMLInputElement[];
  itemGroupId?(element: Element): string | undefined;
  actionDomId(element: HTMLElement): string | undefined;
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

export function collectionAdapterForHost(host: string): CollectionAdapter {
  switch (resolveCompany(host)) {
    case "hyundai":
      return hyundaiCollectionAdapter;
    case "sk":
      return skCollectionAdapter;
    case "generic":
      return genericCollectionAdapter;
  }
}
