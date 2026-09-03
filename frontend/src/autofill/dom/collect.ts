import type {
  ActionCandidate,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsItem,
  FieldsSection,
  PreparationAnalyzeRequest,
  PreparationSection,
} from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "./candidate-registry";
import type { CandidateBlockReason } from "./types";

const SECTION_SELECTOR = "fieldset, section, [role='group'], .apply-form-box";
const FORBIDDEN_ACTION =
  /저장|제출|지원|완료|다음|이전|이동|미리보기|삭제|업로드|계산기|submit|save|next|previous|preview|delete|upload|remove|calculator/i;
// The analysis API rejects candidate labels longer than 120 characters.
const MAX_METADATA_LENGTH = 120;

export interface CollectedSnapshot<TRequest> {
  request: TRequest;
  registry: CandidateRegistry;
}

export interface PreparationCollectedSnapshot extends CollectedSnapshot<PreparationAnalyzeRequest> {
  isSectionVisible(sectionId: string): boolean;
  countRepeatableGroups(actionCandidateId: string): number | undefined;
}

function createOpaqueId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function createSnapshotId(prefix: "preparation" | "fields"): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${random}`;
}

function metadata(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_METADATA_LENGTH);
}

function labelOf(element: HTMLElement): string | undefined {
  const ariaLabelledBy = metadata(element.getAttribute("aria-labelledby"));
  if (ariaLabelledBy) {
    const text = ariaLabelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    const labelledText = metadata(text);
    if (labelledText) return labelledText;
  }
  const ariaLabel = metadata(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labelText = metadata(element.labels?.[0]?.textContent);
    if (labelText) return labelText;
    const placeholder = metadata(element.getAttribute("placeholder"));
    if (placeholder) return placeholder;
  }
  return metadata(element.textContent);
}

function sectionName(container: Element | null): string | undefined {
  if (!container) return undefined;
  return (
    metadata(container.getAttribute("aria-label")) ??
    metadata(
      container.querySelector(
        ":scope > legend, :scope > h1, :scope > h2, :scope > h3",
      )?.textContent,
    )
  );
}

function isTemplateLike(element: Element): boolean {
  return Boolean(
    element.closest(
      "template, [data-template], [id*='template' i], [id*='templete' i], [class*='template' i], [class*='templete' i]",
    ),
  );
}

function repeatableItemGroupId(element: Element): string | undefined {
  const identifiers = [
    element.id,
    ...(typeof element.className === "string"
      ? element.className.split(/\s+/)
      : []),
  ].filter(
    (identifier) =>
      identifier &&
      /(?:^|[-_])item$/i.test(identifier) &&
      !/^form-item(?:-group)?$/i.test(identifier),
  );
  const identifier = identifiers.sort(
    (left, right) => right.length - left.length,
  )[0];
  return identifier
    ?.replace(/[-_]?item$/i, "")
    .replace(/[^a-z0-9가-힣]/gi, "")
    .toLowerCase();
}

function isHidden(element: HTMLElement): boolean {
  if (
    element.hidden ||
    element.closest("[hidden], [aria-hidden='true']") ||
    element.closest("[style*='display: none'], [style*='display:none']")
  ) {
    return true;
  }

  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  let current: Element | null = element;
  while (current) {
    const style = view.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function isInert(element: HTMLElement): boolean {
  return Boolean(element.closest("[inert]"));
}

function blockReason(element: HTMLElement): CandidateBlockReason | undefined {
  if (isHidden(element)) return "hidden";
  if (isInert(element)) return "inert";
  if (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLButtonElement) &&
    element.disabled
  ) {
    return "disabled";
  }
  if (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement) &&
    element.readOnly
  ) {
    return "readonly";
  }
  return undefined;
}

function visibility(element: HTMLElement): "visible" | "hidden" {
  return isHidden(element) ? "hidden" : "visible";
}

function siteOf(document: Document): { host: string; pathPattern: string } {
  const location = document.location;
  const pathPattern = (location?.pathname ?? "/")
    .split("/")
    .map((segment) =>
      /^\d+$/.test(segment) ||
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
      segment.length > 32
        ? "*"
        : segment,
    )
    .join("/");
  return {
    host: location?.host ?? "",
    pathPattern: pathPattern || "/",
  };
}

function groupBySection<T extends Element>(
  elements: T[],
): Map<Element | null, T[]> {
  const groups = new Map<Element | null, T[]>();
  for (const element of elements) {
    const section = element.closest(SECTION_SELECTOR);
    groups.set(section, [...(groups.get(section) ?? []), element]);
  }
  if (groups.size === 0) groups.set(null, []);
  return groups;
}

function baseCandidate(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  candidateId: string,
) {
  return {
    candidateId,
    visibility: visibility(element),
    ...(labelOf(element) ? { displayName: labelOf(element) } : {}),
    ...(metadata(element.id) ? { domId: metadata(element.id) } : {}),
    ...(metadata(element.name) ? { domName: metadata(element.name) } : {}),
    ...(metadata(element.getAttribute("placeholder"))
      ? { placeholder: metadata(element.getAttribute("placeholder")) }
      : {}),
    ...(element.disabled ? { disabled: true as const } : {}),
    ...("readOnly" in element && element.readOnly
      ? { readonly: true as const }
      : {}),
    ...(isInert(element) ? { inert: true as const } : {}),
  };
}

function collectFieldElements(document: Document) {
  return Array.from(
    document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea"),
  ).filter((element) => {
    if (isTemplateLike(element)) return false;
    if (!(element instanceof HTMLInputElement)) return true;
    return ![
      "hidden",
      "password",
      "file",
      "submit",
      "button",
      "reset",
      "image",
    ].includes(element.type);
  });
}

export function collectFieldsSnapshot(
  document: Document,
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const registry = new CandidateRegistry();
  let candidateIndex = 0;
  const sections: FieldsSection[] = [];
  const groups = groupBySection(collectFieldElements(document));

  Array.from(groups.entries()).forEach(
    ([container, elements], sectionIndex) => {
      const sectionId = container
        ? createOpaqueId("section", sectionIndex)
        : "section-root";
      const fields: FieldCandidate[] = [];
      const itemGroupIndexes = new Map<string, number>();
      const repeatableItems = repeatableItemElements(container).map(
        (element, itemPosition) => {
          const itemGroupId = repeatableItemGroupId(element);
          const itemGroupKey = itemGroupId ?? "";
          const itemIndex = itemGroupIndexes.get(itemGroupKey) ?? 0;
          itemGroupIndexes.set(itemGroupKey, itemIndex + 1);
          return {
            element,
            itemId: createOpaqueId(`${sectionId}-item`, itemPosition),
            itemIndex,
            itemGroupId,
            fields: [] as FieldCandidate[],
          };
        },
      );
      const consumed = new Set<Element>();

      for (const element of elements) {
        if (consumed.has(element)) continue;
        const isChoice =
          element instanceof HTMLInputElement &&
          (element.type === "radio" || element.type === "checkbox");
        const grouped =
          isChoice && element.name
            ? elements.filter(
                (peer) =>
                  peer instanceof HTMLInputElement &&
                  peer.type === element.type &&
                  peer.name === element.name,
              )
            : [element];
        grouped.forEach((peer) => consumed.add(peer));

        const candidateId = createOpaqueId("field", candidateIndex++);
        const first = grouped[0]!;
        const matchingItems = repeatableItems.filter(({ element: item }) =>
          grouped.every((field) => item.contains(field)),
        );
        const item = matchingItems.length === 1 ? matchingItems[0] : undefined;
        let candidate: FieldCandidate;
        const optionElements = new Map<
          string,
          HTMLOptionElement | HTMLInputElement
        >();
        if (isChoice) {
          const options = grouped.map((peer, optionIndex) => {
            const optionId = createOpaqueId(
              `${candidateId}-option`,
              optionIndex,
            );
            optionElements.set(optionId, peer as HTMLInputElement);
            return {
              optionId,
              displayName:
                labelOf(peer as HTMLElement) ?? `선택 ${optionIndex + 1}`,
            };
          });
          candidate = {
            ...baseCandidate(first, candidateId),
            element: "input",
            control: (first as HTMLInputElement).type as "radio" | "checkbox",
            options,
          };
        } else if (first instanceof HTMLSelectElement) {
          const options = Array.from(first.options)
            .map((option, optionIndex) => {
              const displayName = metadata(option.textContent);
              if (!displayName) return undefined;
              const optionId = createOpaqueId(
                `${candidateId}-option`,
                optionIndex,
              );
              optionElements.set(optionId, option);
              return { optionId, displayName };
            })
            .filter(
              (option): option is { optionId: string; displayName: string } =>
                Boolean(option),
            );
          candidate = {
            ...baseCandidate(first, candidateId),
            element: "select",
            control: "select",
            ...(options.length > 0 ? { options } : {}),
          };
        } else {
          candidate = {
            ...baseCandidate(first, candidateId),
            element:
              first instanceof HTMLTextAreaElement ? "textarea" : "input",
            control: first instanceof HTMLTextAreaElement ? "textarea" : "text",
          };
        }

        if (item) item.fields.push(candidate);
        else fields.push(candidate);
        const elementsForHandle = grouped as Array<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >;
        registry.registerField(
          {
            kind: "field",
            candidateId,
            candidate,
            elements: elementsForHandle,
            optionElements,
            sectionId,
            ...(item
              ? {
                  itemId: item.itemId,
                  itemIndex: item.itemIndex,
                  ...(item.itemGroupId
                    ? { itemGroupId: item.itemGroupId }
                    : {}),
                }
              : {}),
            signature: createStructuralSignature(elementsForHandle),
          },
          blockReason(first),
        );
      }
      const itemGroups = new Set(
        repeatableItems.map(({ itemGroupId }) => itemGroupId),
      );
      for (const itemGroupId of itemGroups) {
        const groupItems = repeatableItems.filter(
          (item) => item.itemGroupId === itemGroupId,
        );
        registry.setFieldItemCount(sectionId, groupItems.length, itemGroupId);
        registry.setFieldItemElements(
          sectionId,
          groupItems.map(({ element }) => element),
          itemGroupId,
        );
      }
      const itemFields: FieldsItem[] = repeatableItems
        .filter(({ fields: itemFields }) => itemFields.length > 0)
        .map(({ itemId, fields: itemFields }) => ({
          itemId,
          fields: itemFields,
        }));
      sections.push({
        sectionId,
        ...(sectionName(container)
          ? { displayName: sectionName(container) }
          : {}),
        fields,
        ...(itemFields.length > 0 ? { items: itemFields } : {}),
      });
    },
  );

  return {
    request: {
      schemaVersion: 2,
      snapshotId: createSnapshotId("fields"),
      site: siteOf(document),
      sections,
    },
    registry,
  };
}

function collectActionElements(document: Document) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
      "button, input[type='button'], input[type='radio'], select",
    ),
  ).filter((element) => {
    const label = labelOf(element);
    if (element instanceof HTMLSelectElement) {
      return !isHidden(element) && Boolean(element.id || element.name);
    }
    return Boolean(
      label && !FORBIDDEN_ACTION.test(label) && !isHidden(element),
    );
  });
}

function repeatableItemElements(container: Element | null): Element[] {
  if (!container) return [];

  const isDirectRepeatableItem = (element: Element): boolean => {
    if (isTemplateLike(element)) return false;
    if (
      element.matches(
        "[data-repeatable-group], [data-repeater-item], fieldset, [role='group']",
      )
    ) {
      return true;
    }
    return (
      Array.from(element.classList).some((className) =>
        /(?:^|[-_])item$/i.test(className),
      ) || /(?:^|[-_])item$/i.test(element.id)
    );
  };

  const directItems = Array.from(container.children).filter(
    isDirectRepeatableItem,
  );
  if (directItems.length > 0) return directItems;

  // Some forms (including SK Careers) nest repeated rows inside a form-body
  // wrapper instead of making them direct children of the section root.
  // Search those descendants, but keep only the outermost markers so inner
  // controls such as `.form-item` are not mistaken for repeated rows.
  const nestedCandidates = Array.from(
    container.querySelectorAll(
      "[data-repeatable-group], [data-repeater-item], fieldset, [role='group'], [class], [id]",
    ),
  ).filter((element) => {
    if (isTemplateLike(element)) return false;
    if (
      element.matches(
        "[data-repeatable-group], [data-repeater-item], fieldset, [role='group']",
      )
    ) {
      return true;
    }
    return (
      Array.from(element.classList).some(
        (className) =>
          /(?:^|[-_])item$/i.test(className) && !/^form-item$/i.test(className),
      ) ||
      (/(?:^|[-_])item$/i.test(element.id) && !/^form-item$/i.test(element.id))
    );
  });

  return nestedCandidates.filter(
    (candidate) =>
      !nestedCandidates.some(
        (ancestor) => ancestor !== candidate && ancestor.contains(candidate),
      ),
  );
}

function actionGroupKey(action: Element | undefined): string | undefined {
  if (!action) return undefined;
  const identifiers = [
    action.id,
    ...(typeof action.className === "string"
      ? action.className.split(/\s+/)
      : []),
  ];
  return identifiers
    .filter((identifier) => /add/i.test(identifier))
    .map((identifier) =>
      identifier
        .replace(/^btnAdd/i, "")
        .replace(/^add/i, "")
        .replace(/[^a-z0-9가-힣]/gi, "")
        .toLowerCase(),
    )
    .filter((identifier) => identifier.length >= 3)
    .sort((left, right) => right.length - left.length)[0];
}

function repeatableItemElementsForAction(
  container: Element | null,
  action: Element | undefined,
): Element[] {
  const allItems = repeatableItemElements(container);
  const groupKey = actionGroupKey(action);
  if (!groupKey) return allItems;
  const matchingItems = allItems.filter((item) => {
    const identifiers = [
      item.id,
      ...(typeof item.className === "string"
        ? item.className.split(/\s+/)
        : []),
    ]
      .join(" ")
      .replace(/[^a-z0-9가-힣]/gi, "")
      .toLowerCase();
    return identifiers.includes(groupKey);
  });
  if (matchingItems.length > 0) return matchingItems;

  // If the section contains typed repeatable rows for another action, an
  // empty match means this action currently has zero rows. Falling back to
  // all rows here would make a high-school row satisfy the university plan.
  const hasTypedItems = allItems.some((item) => {
    const identifiers = [
      item.id,
      ...(typeof item.className === "string"
        ? item.className.split(/\s+/)
        : []),
    ];
    return identifiers.some(
      (identifier) =>
        /(?:^|[-_])[a-z0-9가-힣]+(?:[-_]?item)$/i.test(identifier) &&
        !/^form-item(?:-group)?$/i.test(identifier),
    );
  });
  return hasTypedItems ? [] : allItems;
}

export function collectPreparationSnapshot(
  document: Document,
): PreparationCollectedSnapshot {
  const registry = new CandidateRegistry();
  let candidateIndex = 0;
  const sections: PreparationSection[] = [];
  const actions = collectActionElements(document);
  const actionsBySection = groupBySection(actions);
  const containers: Array<Element | null> = Array.from(
    document.querySelectorAll(SECTION_SELECTOR),
  );
  if (actionsBySection.has(null) || containers.length === 0) {
    containers.push(null);
  }
  const sectionRoots = new Map<string, Element | null>();
  const actionSectionIds = new Map<string, string>();
  const actionElements = new Map<string, Element>();

  containers.forEach((container, sectionIndex) => {
    const elements = actionsBySection.get(container) ?? [];
    const sectionId = container
      ? createOpaqueId("section", sectionIndex)
      : "section-root";
    const actionCandidates: ActionCandidate[] = elements.map((element) => {
      const candidateId = createOpaqueId("action", candidateIndex++);
      const candidate: ActionCandidate = {
        candidateId,
        element: element instanceof HTMLButtonElement
          ? "button"
          : element instanceof HTMLSelectElement ? "select" : "input",
        control: element instanceof HTMLSelectElement ? "select" : element instanceof HTMLInputElement && element.type === "radio" ? "radio" : "button",
        visibility: visibility(element),
        ...(labelOf(element) ? { displayName: labelOf(element) } : {}),
        ...(metadata(element.id) ? { domId: metadata(element.id) } : {}),
        ...(metadata(element.name) ? { domName: metadata(element.name) } : {}),
        ...(element.disabled ? { disabled: true } : {}),
        ...(isInert(element) ? { inert: true } : {}),
        ...(element instanceof HTMLSelectElement
          ? { options: Array.from(element.options)
              .map((option, index) => ({
                optionId: createOpaqueId(`${candidateId}-option`, index),
                displayName: metadata(option.textContent?.trim() ?? "") ?? "",
              }))
              .filter((option) => option.displayName.length > 0)
              .slice(0, 128) }
          : {}),
      };
      registry.registerAction(
        {
          kind: "action",
          candidateId,
          candidate,
          element,
          sectionId,
          signature: createStructuralSignature([element]),
        },
        blockReason(element),
      );
      actionSectionIds.set(candidateId, sectionId);
      actionElements.set(candidateId, element);
      return candidate;
    });
    // The API only accepts nested items when they contain at least one
    // action candidate. Repeated rows are used locally for count verification
    // today, so do not serialize empty item shells into the request.
    const items = repeatableItemElements(container)
      .map((_, itemIndex) => ({
        itemId: createOpaqueId(`${sectionId}-item`, itemIndex),
        actionCandidates: [],
      }))
      .filter(({ actionCandidates }) => actionCandidates.length > 0);
    sections.push({
      sectionId,
      ...(sectionName(container)
        ? { displayName: sectionName(container) }
        : {}),
      actionCandidates,
      ...(items.length > 0 ? { items } : {}),
    });
    sectionRoots.set(sectionId, container);
  });

  return {
    request: {
      schemaVersion: 2,
      snapshotId: createSnapshotId("preparation"),
      site: siteOf(document),
      sections,
    },
    registry,
    isSectionVisible(sectionId) {
      const root = sectionRoots.get(sectionId);
      return (
        root !== undefined &&
        (!root || (root.isConnected && !isHidden(root as HTMLElement)))
      );
    },
    countRepeatableGroups(actionCandidateId) {
      const sectionId = actionSectionIds.get(actionCandidateId);
      if (!sectionId) return undefined;
      const root = sectionRoots.get(sectionId);
      if (root === undefined || (root && !root.isConnected)) return undefined;
      return repeatableItemElementsForAction(
        root,
        actionElements.get(actionCandidateId),
      ).length;
    },
  };
}
