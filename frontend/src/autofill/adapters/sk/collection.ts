import type { CollectionAdapter } from "../collection";

export const skCollectionAdapter: CollectionAdapter = {
  sectionSelectors: [],
  collectsInputButtonFields: false,
  actionDomId: () => undefined,
  repeatableItemCandidates: () => undefined,
  requiresVisibleControl: (phase) => phase === "fields",
};
