import type {
  ActionCandidate,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsItem,
  FieldsSection,
  PreparationAnalyzeRequest,
  PreparationSection,
  ExecutionAdapterId,
} from "../api/types";
import {
  greetingFieldElements,
  greetingFieldLabel,
  greetingMajorRowsForAction,
  greetingSectionContainer,
  greetingSyntheticDomName,
} from "../adapters/greeting/collection";
import {
  collectionAdapterForHost,
  type CollectionAdapter,
  type CollectionPhase,
  type CollectionSource,
} from "../adapters/collection";
export { isHyundaiTalentHost, isSkCareersHost } from "../adapters/company";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "./candidate-registry";
import type { CandidateBlockReason } from "./types";
import {
  collectSemanticContext,
  semanticText,
  collectActionSemanticContext,
} from "./semantic-context";
import { metadata, labelOf, sectionName } from "./metadata";
import { genericRowFor, genericRows } from "./repeatable-rows";

const EXPLICIT_ROW_SELECTOR = "[data-repeatable-group], [data-repeater-item]";

const SECTION_SELECTOR = "fieldset, section, [role='group'], .apply-form-box";
const FORBIDDEN_ACTION =
  /저장|제출|지원|완료|다음|이전|이동|미리보기|삭제|업로드|계산기|submit|save|next|previous|preview|delete|upload|remove|calculator/i;
const GENERIC_PREPARATION_FORBIDDEN_ACTION =
  /초기화|재설정|reset|clear|검색|조회|찾기|search|find|lookup/i;

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

export function hasVisibleFormControl(item: Element): boolean {
  return Array.from(
    item.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea"),
  ).some((control) => !isHidden(control));
}

function isTemplateLike(element: Element): boolean {
  if (
    element.closest(
      "template, [data-template], [id*='template' i], [id*='templete' i]",
    )
  )
    return true;
  for (
    let ancestor: Element | null = element;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (
      [...ancestor.classList].some(
        (token) =>
          /(?:^|[-_])(?:template|templete)(?:$|[-_])/i.test(token) ||
          /(?:^|[-_])(?:template|templete)[A-Z]/.test(token),
      )
    )
      return true;
  }
  return false;
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

function documentHost(document: Document): string {
  return document.location?.host ?? "";
}

function groupBySection<T extends Element>(
  elements: T[],
  selector: string,
  generic = false,
  explicitSection?: (element: T) => Element | undefined,
): Map<Element | null, T[]> {
  const groups = new Map<Element | null, T[]>();
  for (const element of elements) {
    const row = generic
      ? genericRowFor(element)
      : element.closest(EXPLICIT_ROW_SELECTOR);
    const section =
      explicitSection?.(element) ??
      row?.parentElement?.closest(selector) ??
      element.closest(selector);
    groups.set(section, [...(groups.get(section) ?? []), element]);
  }
  if (groups.size === 0) groups.set(null, []);
  return groups;
}

function sectionSelector(adapter: CollectionAdapter): string {
  return [SECTION_SELECTOR, ...adapter.sectionSelectors].join(", ");
}

function actionDomId(
  element: HTMLElement,
  adapter: CollectionAdapter,
): string | undefined {
  const adapterId = adapter.actionDomId(element);
  if (adapterId) return adapterId;
  const nativeId = metadata(element.id);
  if (nativeId) return nativeId;
  return adapter.actionDomId(element);
}

function baseCandidate(
  element: HTMLElement,
  candidateId: string,
  syntheticDomName?: string,
) {
  const control =
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement;
  return {
    candidateId,
    visibility: visibility(element),
    ...(labelOf(element) ? { displayName: labelOf(element) } : {}),
    ...(metadata(element.id) ? { domId: metadata(element.id) } : {}),
    ...((metadata(element.getAttribute("name")) ?? syntheticDomName)
      ? { domName: metadata(element.getAttribute("name")) ?? syntheticDomName }
      : {}),
    ...(metadata(element.getAttribute("placeholder"))
      ? { placeholder: metadata(element.getAttribute("placeholder")) }
      : {}),
    ...((control || element instanceof HTMLButtonElement) && element.disabled
      ? { disabled: true as const }
      : {}),
    ...("readOnly" in element && element.readOnly
      ? { readonly: true as const }
      : {}),
    ...(isInert(element) ? { inert: true as const } : {}),
  };
}

function collectFieldElements(
  document: Document,
  adapter: CollectionAdapter,
  executionAdapterId?: ExecutionAdapterId,
): HTMLElement[] {
  const native = Array.from(
    document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea"),
  ).filter((element) => {
    if (isTemplateLike(element)) return false;
    if (!(element instanceof HTMLInputElement)) return true;
    if (element.type === "button") {
      return adapter.collectsInputButtonFields;
    }
    return !["hidden", "password", "file", "submit", "reset", "image"].includes(
      element.type,
    );
  });
  return executionAdapterId === "greeting-v1"
    ? [...native, ...greetingFieldElements(document)]
    : native;
}

export function collectFieldsSnapshot(
  document: Document,
  options: { executionAdapterId?: ExecutionAdapterId } = {},
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const { executionAdapterId } = options;
  const adapter = collectionAdapterForHost(
    documentHost(document),
    executionAdapterId,
  );
  const registry = new CandidateRegistry();
  let candidateIndex = 0;
  const sections: FieldsSection[] = [];
  const groups = groupBySection(
    collectFieldElements(document, adapter, executionAdapterId),
    sectionSelector(adapter),
    adapter === collectionAdapterForHost(""),
    executionAdapterId === "greeting-v1" ? greetingSectionContainer : undefined,
  );

  Array.from(groups.entries()).forEach(
    ([container, elements], sectionIndex) => {
      const sectionId = container
        ? createOpaqueId("section", sectionIndex)
        : "section-root";
      const fields: FieldCandidate[] = [];
      const itemGroupIndexes = new Map<string, number>();
      const repeatableItems = repeatableItemElements(
        container,
        adapter,
        "fields",
      ).map((element, itemPosition) => {
        const itemGroupId =
          adapter.itemGroupId?.(element) ?? repeatableItemGroupId(element);
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
      });
      const consumed = new Set<Element>();

      for (const element of elements) {
        if (consumed.has(element)) continue;
        const customRadio =
          executionAdapterId === "greeting-v1" &&
          element.getAttribute("role") === "radiogroup";
        const isChoice =
          customRadio ||
          (element instanceof HTMLInputElement &&
            (element.type === "radio" || element.type === "checkbox"));
        const grouped =
          element instanceof HTMLInputElement && isChoice && element.name
            ? elements.filter(
                (peer) =>
                  peer instanceof HTMLInputElement &&
                  peer.type === element.type &&
                  peer.name === element.name &&
                  repeatableItems.find(({ element: row }) => row.contains(peer))
                    ?.element ===
                    repeatableItems.find(({ element: row }) =>
                      row.contains(element),
                    )?.element,
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
        const optionElements = new Map<string, HTMLElement>();
        if (isChoice) {
          const optionPeers = customRadio
            ? Array.from(
                element.querySelectorAll<HTMLElement>(
                  'button[role="radio"][data-scope="toggle-group"][data-part="item"]',
                ),
              )
            : grouped;
          const options = optionPeers.map((peer, optionIndex) => {
            const optionId = createOpaqueId(
              `${candidateId}-option`,
              optionIndex,
            );
            optionElements.set(optionId, peer);
            return {
              optionId,
              displayName: labelOf(peer) ?? `선택 ${optionIndex + 1}`,
            };
          });
          candidate = {
            ...baseCandidate(
              first,
              candidateId,
              executionAdapterId === "greeting-v1"
                ? greetingSyntheticDomName(first)
                : undefined,
            ),
            element: "input",
            control: customRadio
              ? "radio"
              : ((first as HTMLInputElement).type as "radio" | "checkbox"),
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
            ...baseCandidate(
              first,
              candidateId,
              executionAdapterId === "greeting-v1"
                ? greetingSyntheticDomName(first)
                : undefined,
            ),
            element: "select",
            control: "select",
            ...(options.length > 0 ? { options } : {}),
          };
        } else {
          const isButton =
            first instanceof HTMLButtonElement ||
            (first instanceof HTMLInputElement && first.type === "button");
          candidate = {
            ...baseCandidate(
              first,
              candidateId,
              executionAdapterId === "greeting-v1"
                ? greetingSyntheticDomName(first)
                : undefined,
            ),
            element:
              first instanceof HTMLTextAreaElement ? "textarea" : "input",
            control:
              first instanceof HTMLTextAreaElement
                ? "textarea"
                : isButton
                  ? "button"
                  : "text",
          };
        }

        // Greeting search suggestions can echo the user's typed answer.
        // Its local workflow resolves options without sending them to analysis.
        if (
          executionAdapterId !== "greeting-v1" &&
          first.getAttribute("role") === "combobox"
        ) {
          const ids =
            first.getAttribute("aria-controls")?.trim().split(/\s+/) ?? [];
          const menu =
            ids.length === 1 ? document.getElementById(ids[0]) : null;
          if (menu?.getAttribute("role") === "listbox") {
            const options = Array.from(
              menu.querySelectorAll<HTMLElement>("[role='option']"),
            );
            if (options.length <= 128) {
              candidate.options = options.map((option, index) => {
                const optionId = createOpaqueId(`${candidateId}-option`, index);
                optionElements.set(optionId, option);
                return {
                  optionId,
                  displayName: metadata(option.textContent) ?? "선택지",
                };
              });
            }
          }
        }
        const semanticContext = collectSemanticContext(first, container);
        if (executionAdapterId === "greeting-v1") {
          const label = metadata(greetingFieldLabel(first));
          delete candidate.displayName;
          if (label) candidate.displayName = label;
          delete semanticContext.labels;
          const text = semanticText(label);
          if (text) semanticContext.labels = [{ source: "label", text }];
        }
        if (item) {
          const rowCount = repeatableItems.filter(
            (row) => row.itemGroupId === item.itemGroupId,
          ).length;
          if (rowCount <= 128) {
            semanticContext.repeat = {
              groupId:
                executionAdapterId === "greeting-v1" && item.itemGroupId
                  ? item.itemGroupId
                  : `${sectionId}-group-${Array.from(itemGroupIndexes.keys()).indexOf(item.itemGroupId ?? "") + 1}`,
              rowIndex: item.itemIndex,
              rowCount,
            };
          }
        }
        candidate = { ...candidate, semanticContext };
        if (item) item.fields.push(candidate);
        else fields.push(candidate);
        const elementsForHandle = grouped.filter(
          (
            peer,
          ): peer is
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
            peer instanceof HTMLInputElement ||
            peer instanceof HTMLSelectElement ||
            peer instanceof HTMLTextAreaElement,
        );
        const customElements = grouped.filter(
          (peer) =>
            !(peer instanceof HTMLInputElement) &&
            !(peer instanceof HTMLSelectElement) &&
            !(peer instanceof HTMLTextAreaElement),
        );
        registry.registerField(
          {
            kind: "field",
            candidateId,
            candidate,
            elements: elementsForHandle,
            ...(customElements.length > 0 ? { customElements } : {}),
            optionElements,
            sectionId,
            ...(item
              ? {
                  itemId: item.itemId,
                  isCurrentContext: () => {
                    const liveRows =
                      executionAdapterId === "greeting-v1" && container
                        ? (
                            adapter.repeatableItemCandidates(container) ?? []
                          ).filter((row) => !isTemplateLike(row))
                        : repeatableItemElements(container, adapter, "fields");
                    const currentRows = liveRows.filter(
                      (row) =>
                        (adapter.itemGroupId?.(row) ??
                          repeatableItemGroupId(row)) === item.itemGroupId,
                    );
                    return (
                      currentRows.length ===
                        itemGroupIndexes.get(item.itemGroupId ?? "") &&
                      currentRows[item.itemIndex] === item.element &&
                      grouped.every((field) => item.element.contains(field))
                    );
                  },
                  itemIndex: item.itemIndex,
                  ...(item.itemGroupId
                    ? { itemGroupId: item.itemGroupId }
                    : {}),
                }
              : {}),
            signature: createStructuralSignature([
              ...elementsForHandle,
              ...customElements,
            ]),
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
        .map(({ itemId, itemGroupId, fields: itemFields }) => ({
          itemId,
          ...(itemGroupId ? { itemGroupId } : {}),
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
      supportedWriteCommands: ["SELECT_DATE"],
      snapshotId: createSnapshotId("fields"),
      site: siteOf(document),
      sections,
    },
    registry,
  };
}

function collectActionElements(document: Document) {
  return Array.from(
    document.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement
    >("button, input[type='button'], input[type='radio'], select"),
  ).filter((element) => {
    if (element instanceof HTMLButtonElement && element.type !== "button")
      return false;
    const label = labelOf(element);
    if (element instanceof HTMLSelectElement) {
      return !isHidden(element) && Boolean(element.id || element.name);
    }
    return Boolean(
      label && !FORBIDDEN_ACTION.test(label) && !isHidden(element),
    );
  });
}

function isGenericPreparationAction(element: HTMLElement): boolean {
  const label = [
    labelOf(element),
    element.getAttribute("title"),
    element.getAttribute("aria-label"),
  ]
    .filter(Boolean)
    .join(" ");
  return !GENERIC_PREPARATION_FORBIDDEN_ACTION.test(label);
}

function repeatableItemElements(
  container: Element | null,
  adapter: CollectionAdapter,
  phase: CollectionPhase,
): Element[] {
  if (!container) return [];
  if (adapter === collectionAdapterForHost("")) {
    return genericRows(container).filter(
      (row) => !isTemplateLike(row) && hasVisibleFormControl(row),
    );
  }

  const filterForAdapter = (
    items: Element[],
    source: CollectionSource,
  ): Element[] =>
    items.filter(
      (item) =>
        !isTemplateLike(item) &&
        (!adapter.requiresVisibleControl(phase, source) ||
          hasVisibleFormControl(item)),
    );

  const adapterItems = adapter.repeatableItemCandidates(container);
  if (adapterItems) {
    return filterForAdapter(adapterItems, "adapter");
  }

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
  if (directItems.length > 0) {
    return filterForAdapter(directItems, "generic");
  }

  // Some forms nest repeated rows inside a form-body wrapper instead of
  // making them direct children of the section root.
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

  return filterForAdapter(
    nestedCandidates.filter(
      (candidate) =>
        !nestedCandidates.some(
          (ancestor) => ancestor !== candidate && ancestor.contains(candidate),
        ),
    ),
    "generic",
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
  adapter: CollectionAdapter,
): Element[] {
  const allItems = repeatableItemElements(container, adapter, "preparation");
  const greetingAction =
    action instanceof HTMLElement ? adapter.actionDomId(action) : undefined;
  if (greetingAction === "greeting:add:universities")
    return allItems.filter(
      (item) => adapter.itemGroupId?.(item) === "educationuniversity",
    );
  if (greetingAction === "greeting:add:graduateSchools")
    return allItems.filter(
      (item) => adapter.itemGroupId?.(item) === "educationgraduateschool",
    );
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
  options: { executionAdapterId?: ExecutionAdapterId } = {},
): PreparationCollectedSnapshot {
  const { executionAdapterId } = options;
  const adapter = collectionAdapterForHost(
    documentHost(document),
    executionAdapterId,
  );
  const registry = new CandidateRegistry();
  let candidateIndex = 0;
  const sections: PreparationSection[] = [];
  const generic = adapter === collectionAdapterForHost("");
  const actions = [
    ...collectActionElements(document).filter((element) =>
      executionAdapterId === "greeting-v1"
        ? Boolean(adapter.actionDomId(element))
        : !generic ||
          ((element instanceof HTMLButtonElement ||
            (element instanceof HTMLInputElement &&
              element.type === "button")) &&
            isGenericPreparationAction(element)),
    ),
    ...(adapter.additionalActionElements?.(document) ?? []),
  ];
  const selector = sectionSelector(adapter);
  const actionsBySection = groupBySection(
    actions,
    selector,
    adapter === collectionAdapterForHost(""),
    executionAdapterId === "greeting-v1" ? greetingSectionContainer : undefined,
  );
  const containers: Array<Element | null> = Array.from(
    new Set([
      ...document.querySelectorAll(selector),
      ...actionsBySection.keys(),
    ]),
  );
  if (
    (actionsBySection.has(null) || containers.length === 0) &&
    !containers.includes(null)
  ) {
    containers.push(null);
  }
  const sectionRoots = new Map<string, Element | null>();
  const actionSectionIds = new Map<string, string>();
  const actionElements = new Map<string, Element>();
  const majorActionIds = new Map<string, string>();

  containers.forEach((container, sectionIndex) => {
    const elements = actionsBySection.get(container) ?? [];
    const sectionId = container
      ? createOpaqueId("section", sectionIndex)
      : "section-root";
    const actionCandidates: ActionCandidate[] = elements.map((element) => {
      const candidateId = createOpaqueId("action", candidateIndex++);
      const domId = actionDomId(element, adapter);
      const candidate: ActionCandidate = {
        candidateId,
        element:
          element instanceof HTMLButtonElement
            ? "button"
            : element instanceof HTMLSelectElement
              ? "select"
              : "input",
        control:
          element instanceof HTMLSelectElement
            ? "select"
            : element instanceof HTMLInputElement && element.type === "radio"
              ? "radio"
              : "button",
        visibility: visibility(element),
        semanticContext: collectActionSemanticContext(element, container),
        ...(labelOf(element) ? { displayName: labelOf(element) } : {}),
        ...(domId ? { domId } : {}),
        ...(metadata(element.name) ? { domName: metadata(element.name) } : {}),
        ...(element.disabled ? { disabled: true } : {}),
        ...(isInert(element) ? { inert: true } : {}),
        ...(element instanceof HTMLSelectElement
          ? {
              options: Array.from(element.options)
                .map((option, index) => ({
                  optionId: createOpaqueId(`${candidateId}-option`, index),
                  displayName: metadata(option.textContent?.trim() ?? "") ?? "",
                }))
                .filter((option) => option.displayName.length > 0)
                .slice(0, 128),
            }
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
      if (
        /^greeting:add:graduateSchools:(0|[1-9]\d*):majors$/.test(domId ?? "")
      )
        majorActionIds.set(candidateId, domId!);
      return candidate;
    });
    // The API only accepts nested items when they contain at least one
    // action candidate. Repeated rows are used locally for count verification
    // today, so do not serialize empty item shells into the request.
    const items = repeatableItemElements(container, adapter, "preparation")
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
      if (majorActionIds.has(actionCandidateId)) {
        const action = actionElements.get(actionCandidateId);
        return action instanceof HTMLElement &&
          adapter.actionDomId(action) === majorActionIds.get(actionCandidateId)
          ? greetingMajorRowsForAction(action)?.length
          : undefined;
      }
      return repeatableItemElementsForAction(
        root,
        actionElements.get(actionCandidateId),
        adapter,
      ).length;
    },
  };
}
