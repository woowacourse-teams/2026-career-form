import type { CollectionAdapter } from "../collection";

export const hyundaiCollectionAdapter: CollectionAdapter = {
  sectionSelectors: ["article.field-form-apply"],
  collectsInputButtonFields: true,
  actionDomId(element) {
    if (
      !(element instanceof HTMLButtonElement) ||
      !element.classList.contains("btn-group-add")
    ) {
      return undefined;
    }
    const scope = element.closest<HTMLElement>("article.field-form-apply");
    return scope?.id ? `hyundai:add:${scope.id}` : undefined;
  },
  repeatableItemCandidates(container) {
    if (!container.matches("article.field-form-apply")) return undefined;
    return Array.from(container.children).filter((child) =>
      child.classList.contains("field-content"),
    );
  },
  requiresVisibleControl: (_phase, source) => source === "adapter",
};
