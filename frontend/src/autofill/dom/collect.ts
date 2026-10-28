import { withStructuralCollection } from "../debug/structural-diagnostics";
import { iconGlyphLabel } from "./icon-glyph";
import {
  collectNativeFields,
  collectNativePreparation,
} from "../policy/native-form-collection";
import { runtimeRules, componentName } from "../policy/runtime-rules";
import { componentPolicy } from "../policy/component-policy";
import { componentSelector } from "../policy/component-dom";
import { cachedDomRead, displayState, withDomReadPass } from "./read-pass";
import { startLocalTiming } from "../debug/local-timing";
import {
  nativePolicyRequired,
  executionPolicy,
} from "../workflow/execution-policy";
import { targetOnlyRadio } from "../policy/radio-validation";
import {
  dialogDateButtonValue,
  isDialogDateButton,
} from "../interaction/dialog-date-picker";
import { resolveDocumentCompany } from "../adapters/company";
import {
  collectHplaceFields,
  collectHplacePreparation,
} from "../adapters/hplace/collection";
import type { CompanyId } from "../adapters/company";
import type {
  ActionCandidate,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsItem,
  FieldsSection,
  OptionCandidate,
  PreparationAnalyzeRequest,
  PreparationSection,
} from "../api/types";
import {
  componentCollectionAdapter,
  componentFieldElements,
  componentFieldLabel,
  componentMajorRowsForAction,
  componentSectionContainer,
  componentSyntheticDomName,
} from "../policy/components/collection";
import {
  collectionAdapterForHost,
  type CollectionAdapter,
  type CollectionPhase,
  type CollectionSource,
} from "../adapters/collection";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "./candidate-registry";
import type { CandidateBlockReason, FieldCandidateHandle } from "./types";
import {
  collectSemanticContext,
  semanticText,
  collectActionSemanticContext,
} from "./semantic-context";
import {
  metadata,
  labelOf,
  sectionName,
  structuralLabelOf,
  unnamedRadioGroupOf,
} from "./metadata";
import { collectButtonDropdowns, type ButtonDropdown } from "./button-dropdown";
import { collectReadonlyInputDropdowns } from "./readonly-input-dropdown";
import { isSafeStructuralClick } from "../generic/click-policy";
import { acquireDocumentRun } from "../interaction/document-run";
import {
  genericFormGroupFor,
  genericFormGroups,
  hiddenFromPage,
} from "./generic-form-groups";
import { genericRowFor, genericRows } from "./repeatable-rows";
import {
  documentImplicitRepeatGroups,
  implicitRepeatGroupFor,
} from "./implicit-repeat-rows";
import {
  detectMixedSectionGroup,
  type MixedSectionGroup,
} from "./mixed-section-rows";
import {
  assignRepeatGroups,
  formsSingleRepeatGroup,
  sameRepeatGroupKey,
} from "./repeat-groups";

const EXPLICIT_ROW_SELECTOR = "[data-repeatable-group], [data-repeater-item]";

const SECTION_SELECTOR = "fieldset, section, [role='group']";
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
  repeatableGroupState(
    actionCandidateId: string,
  ): readonly string[] | undefined;
  repeatableGroupLimit(
    actionCandidateId: string,
  ): number | "ambiguous" | undefined;
  mixedSectionGroup?(actionCandidateId: string): MixedSectionGroup | undefined;
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

/**
 * An open modal makes the page behind it inert or aria-hidden. A generic row
 * there is still a row; only its own hiding (display, hidden) removes it.
 */
function hasPageFormControl(row: Element): boolean {
  if (hasVisibleFormControl(row)) return true;
  return Array.from(
    row.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea"),
  ).some(
    (control) => !hiddenFromPage(control) && !hiddenUncached(control, true),
  );
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

/** A grouped candidate remains visible while any owned native control is visible. */
export function isFieldCandidateHidden(handle: FieldCandidateHandle): boolean {
  const elements =
    handle.elements.length > 0
      ? handle.elements
      : (handle.customElements ?? []);
  return elements.every(isHidden);
}

function isHidden(element: HTMLElement): boolean {
  return cachedDomRead(element, "collect-hidden", () =>
    hiddenUncached(element),
  );
}

function hiddenUncached(
  element: HTMLElement,
  ignoreAriaHidden = false,
): boolean {
  if (
    element.hidden ||
    element.closest(
      ignoreAriaHidden ? "[hidden]" : "[hidden], [aria-hidden='true']",
    ) ||
    element.closest("[style*='display: none'], [style*='display:none']")
  ) {
    return true;
  }

  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  let current: Element | null = element;
  while (current) {
    const style = displayState(current);
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

function handleBlockReason(
  elements: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  first: HTMLElement,
): CandidateBlockReason | undefined {
  if (elements.length === 0) return blockReason(first);
  const reasons = elements.map(blockReason);
  if (reasons.some((reason) => reason === undefined)) return undefined;
  return (
    reasons.find((reason) => reason !== "hidden") ??
    reasons.find((reason) => reason !== undefined)
  );
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
  const implicitContainers = generic
    ? documentImplicitRepeatGroups(elements[0]?.ownerDocument ?? document).map(
        ({ container }) => container,
      )
    : [];
  for (const element of elements) {
    const group = generic ? genericFormGroupFor(element) : undefined;
    const row = generic
      ? genericRowFor(element)
      : element.closest(EXPLICIT_ROW_SELECTOR);
    const section =
      explicitSection?.(element) ??
      group?.area ??
      row?.parentElement?.closest(selector) ??
      element.closest(selector) ??
      // A proven implicit repeat group (C13) is its own section when no
      // section element wraps it.
      implicitContainers.find((container) => container.contains(element)) ??
      null;
    groups.set(section, [...(groups.get(section) ?? []), element]);
  }
  if (groups.size === 0) groups.set(null, []);
  return groups;
}

function sectionSelector(
  adapter: CollectionAdapter,
  document: Document,
): string {
  return [
    runtimeRules(document)?.sectionSelector ?? SECTION_SELECTOR,
    ...adapter.sectionSelectors,
  ].join(", ");
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
  generic = false,
) {
  const control =
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement;
  return {
    candidateId,
    visibility: visibility(element),
    ...(labelOf(element, generic)
      ? { displayName: labelOf(element, generic) }
      : {}),
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
  companyId?: CompanyId,
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
  if (companyId === "components")
    return [...native, ...componentFieldElements(document)];
  if (companyId !== "generic") return native;
  const dateButtons = Array.from(
    document.querySelectorAll("button[aria-haspopup='dialog']"),
  ).filter(
    (button): button is HTMLButtonElement =>
      isDialogDateButton(button) && !isTemplateLike(button),
  );
  return dateButtons.length === 0
    ? native
    : [...native, ...dateButtons].sort((left, right) =>
        left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
}

function collectFieldsSnapshotInternal(
  document: Document,
  dropdowns: ReadonlyMap<HTMLElement, ButtonDropdown> = new Map(),
  options: {
    recoverBrokenLabels?: boolean;
    /** Opt in to title-only name cues on the generic path. */
    titleNameCues?: boolean;
    /** Opt out of mixed section detection; omitted keeps it on. */
    mixedSectionDetection?: boolean;
    /** Readonly inputs whose own click opened one search dialog. */
    searchDialogs?: ReadonlySet<HTMLElement>;
  } = {},
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const finishTiming = startLocalTiming("collect", { version: 2 });
  try {
    return withDomReadPass(() => {
      const companyId = resolveDocumentCompany(document);
      if (nativePolicyRequired(document))
        return collectNativeFields(
          document,
          createSnapshotId("fields"),
          siteOf(document),
          collectHplaceFields(
            document,
            createSnapshotId("fields"),
            siteOf(document),
          ),
        );
      if (companyId === "hplace")
        return collectHplaceFields(
          document,
          createSnapshotId("fields"),
          siteOf(document),
        );
      const generic = companyId === "generic";
      const adapter = collectionAdapterForHost(document);
      const registry = new CandidateRegistry();
      let candidateIndex = 0;
      const sections: FieldsSection[] = [];
      const groups = groupBySection(
        [
          ...collectFieldElements(document, adapter, companyId),
          ...dropdowns.keys(),
        ],
        sectionSelector(adapter, document),
        adapter === collectionAdapterForHost(""),
        companyId === "components" ? componentSectionContainer : undefined,
      );

      Array.from(groups.entries()).forEach(
        ([container, elements], sectionIndex) => {
          const sectionId = container
            ? createOpaqueId("section", sectionIndex)
            : "section-root";
          const fields: FieldCandidate[] = [];
          const explicitGroupId = (row: Element) =>
            adapter.itemGroupId?.(row) ?? repeatableItemGroupId(row);
          // One shared group assignment feeds itemIndex, the semantic repeat
          // context, registry counts and the pre-execution revalidation below.
          const currentAssignments = (
            revalidate = false,
          ): ReturnType<typeof assignRepeatGroups> =>
            cachedDomRead(currentAssignments, String(revalidate), () =>
              container
                ? assignRepeatGroups(
                    container,
                    revalidate &&
                      runtimeRules(document)?.components?.collection
                        .revalidateAdapterRows
                      ? (
                          adapter.repeatableItemCandidates(container) ?? []
                        ).filter((row) => !isTemplateLike(row))
                      : repeatableItemElements(container, adapter, "fields"),
                    explicitGroupId,
                    sectionId,
                  )
                : [],
            );
          const repeatableItems = currentAssignments().map(
            (assignment, itemPosition) => ({
              ...assignment,
              element: assignment.row,
              itemId: createOpaqueId(`${sectionId}-item`, itemPosition),
              fields: [] as FieldCandidate[],
            }),
          );
          // Mixed-section groups (C5) are detected from the same assignment.
          const mixedRowOf = new Map<
            Element,
            { groupKey: string; rowIndex: number; group: MixedSectionGroup }
          >();
          if (
            container &&
            adapter === collectionAdapterForHost("") &&
            options.mixedSectionDetection !== false
          ) {
            const byGroup = new Map<number, Element[]>();
            for (const item of repeatableItems)
              if (!item.ambiguous)
                byGroup.set(item.groupOrdinal, [
                  ...(byGroup.get(item.groupOrdinal) ?? []),
                  item.element,
                ]);
            for (const [ordinal, rows] of byGroup) {
              const group = detectMixedSectionGroup(
                container,
                rows,
                explicitGroupId,
              );
              if (!group) continue;
              rows.forEach((row, rowIndex) =>
                mixedRowOf.set(row, {
                  groupKey: `${sectionId}-group-${ordinal}`,
                  rowIndex,
                  group,
                }),
              );
            }
          }
          const consumed = new Set<Element>();

          for (const element of elements) {
            if (consumed.has(element)) continue;
            const customRadio =
              companyId === "components" &&
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
                      repeatableItems.find(({ element: row }) =>
                        row.contains(peer),
                      )?.element ===
                        repeatableItems.find(({ element: row }) =>
                          row.contains(element),
                        )?.element,
                  )
                : generic &&
                    element instanceof HTMLInputElement &&
                    element.type === "radio" &&
                    !element.name
                  ? unnamedRadioGroupOf(element).filter(
                      (peer) =>
                        elements.includes(peer) &&
                        !consumed.has(peer) &&
                        repeatableItems.find(({ element: row }) =>
                          row.contains(peer),
                        )?.element ===
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
            const item =
              matchingItems.length === 1 ? matchingItems[0] : undefined;
            let candidate: FieldCandidate;
            const optionElements = new Map<string, HTMLElement>();
            const buttonDropdown = dropdowns.get(first);
            if (buttonDropdown) {
              const options = buttonDropdown.options.map((option, index) => {
                const optionId = createOpaqueId(`${candidateId}-option`, index);
                optionElements.set(optionId, option.element);
                return { optionId, displayName: option.text };
              });
              // A readonly input that opens its own list is a select, not a
              // blocked text box; readonly only forbids typing into it.
              const base = baseCandidate(
                first,
                candidateId,
                undefined,
                generic,
              );
              if (buttonDropdown.surface === "input") delete base.readonly;
              candidate = {
                ...base,
                element: "custom",
                control: "select",
                options,
              };
            } else if (isChoice) {
              const optionPeers = customRadio
                ? Array.from(
                    element.querySelectorAll<HTMLElement>(
                      componentSelector(element, "collectedRadioOption"),
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
                  displayName:
                    labelOf(peer, generic) ?? `선택 ${optionIndex + 1}`,
                };
              });
              candidate = {
                ...baseCandidate(
                  first,
                  candidateId,
                  companyId === "components"
                    ? componentSyntheticDomName(first)
                    : undefined,
                  generic,
                ),
                element: "input",
                control: customRadio
                  ? "radio"
                  : ((first as HTMLInputElement).type as "radio" | "checkbox"),
                options,
              };
              const question =
                generic && !customRadio && grouped.length > 1
                  ? structuralLabelOf(grouped)?.label
                  : undefined;
              if (question) candidate.displayName = question;
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
                  // An empty-value option is the select's guidance entry, not a
                  // meaning. Only the flag is sent, never the option value.
                  return generic && option.value === ""
                    ? { optionId, displayName, placeholder: true as const }
                    : { optionId, displayName };
                })
                .filter(
                  (option): option is OptionCandidate => Boolean(option),
                );
              candidate = {
                ...baseCandidate(
                  first,
                  candidateId,
                  companyId === "components"
                    ? componentSyntheticDomName(first)
                    : undefined,
                  generic,
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
                  companyId === "components"
                    ? componentSyntheticDomName(first)
                    : undefined,
                  generic,
                ),
                element:
                  first instanceof HTMLTextAreaElement
                    ? "textarea"
                    : generic && isDialogDateButton(first)
                      ? "custom"
                      : "input",
                control:
                  first instanceof HTMLTextAreaElement
                    ? "textarea"
                    : isButton
                      ? "button"
                      : "text",
              };
              // A dialog date button shows its own placeholder until a date is
              // chosen; only that digit-free text may name it.
              const placeholder =
                generic && isDialogDateButton(first)
                  ? metadata(first.textContent)
                  : undefined;
              if (
                placeholder &&
                !candidate.displayName &&
                !dialogDateButtonValue(first as HTMLButtonElement)
              )
                candidate.displayName = placeholder;
            }

            // Component forms search suggestions can echo the user's typed answer.
            // Its local workflow resolves options without sending them to analysis.
            if (
              runtimeRules(document)?.components?.collection
                .includeSearchOptions !== false &&
              !buttonDropdown &&
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
                    const optionId = createOpaqueId(
                      `${candidateId}-option`,
                      index,
                    );
                    optionElements.set(optionId, option);
                    return {
                      optionId,
                      displayName: metadata(option.textContent) ?? "선택지",
                    };
                  });
                }
              }
            }
            const semanticContext = collectSemanticContext(first, container, {
              generic,
              recoverBrokenLabels: generic && options.recoverBrokenLabels,
              titleNameCues: generic && options.titleNameCues,
              ...(generic && isChoice && !customRadio && grouped.length > 1
                ? { group: grouped }
                : {}),
            });
            if (
              runtimeRules(document)?.components?.collection.ownedLabelsOnly
            ) {
              const label = metadata(componentFieldLabel(first));
              delete candidate.displayName;
              if (label) candidate.displayName = label;
              delete semanticContext.labels;
              const text = semanticText(label);
              if (text) semanticContext.labels = [{ source: "label", text }];
            }
            if (
              item &&
              item.itemIndex !== undefined &&
              item.rowCount !== undefined &&
              item.rowCount <= 128
            ) {
              semanticContext.repeat = {
                groupId:
                  companyId === "components" && item.itemGroupId
                    ? item.itemGroupId
                    : `${sectionId}-group-${item.groupOrdinal}`,
                rowIndex: item.itemIndex,
                rowCount: item.rowCount,
              };
            }
            if (buttonDropdown?.surface === "input") {
              // The input shows its current choice; that text never names it.
              const shown = new Set(
                [
                  buttonDropdown.initialText,
                  ...buttonDropdown.options.map((option) => option.text),
                ].map((text) => text.replace(/\s+/g, " ").trim()),
              );
              const own = (text?: string) =>
                !text || !shown.has(text.replace(/\s+/g, " ").trim());
              if (!own(candidate.displayName)) delete candidate.displayName;
              if (semanticContext.labels) {
                semanticContext.labels = semanticContext.labels.filter((item) =>
                  own(item.text),
                );
                if (!semanticContext.labels.length)
                  delete semanticContext.labels;
              }
            }
            candidate = { ...candidate, semanticContext };
            if (candidate.control === "radio" && targetOnlyRadio(grouped)) {
              delete candidate.disabled;
            }
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
            const mixed = item ? mixedRowOf.get(item.element) : undefined;
            const kindSelect = mixed?.group.kindSelects[mixed.rowIndex];
            const selectedKind = kindSelect?.selectedOptions[0]?.value
              ? metadata(kindSelect.selectedOptions[0].textContent)
              : undefined;
            const blockReason = handleBlockReason(
              elementsForHandle,
              first as HTMLElement,
            );
            registry.registerField(
              {
                kind: "field",
                ...(buttonDropdown ? { buttonDropdown } : {}),
                ...(options.searchDialogs?.has(first)
                  ? { selfOpensSearchDialog: true as const }
                  : {}),
                ...(mixed
                  ? {
                      mixedSectionRow: {
                        groupKey: mixed.groupKey,
                        rowIndex: mixed.rowIndex,
                        rowCount: mixed.group.rows.length,
                        ...(selectedKind ? { selectedKind } : {}),
                        isKindSelect: kindSelect === first,
                        group: mixed.group,
                      },
                    }
                  : {}),
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
                        if (
                          !grouped.every((field) =>
                            item.element.contains(field),
                          )
                        )
                          return false;
                        const current = currentAssignments(true).find(
                          ({ row }) => row === item.element,
                        );
                        if (!current) return false;
                        // An ambiguous row never becomes indexed later; it only
                        // has to remain the same unindexed row.
                        if (item.ambiguous) return current.ambiguous;
                        return (
                          !current.ambiguous &&
                          sameRepeatGroupKey(current.key, item.key) &&
                          current.rowCount === item.rowCount &&
                          current.itemIndex === item.itemIndex
                        );
                      },
                      ...(item.itemIndex !== undefined
                        ? { itemIndex: item.itemIndex }
                        : {}),
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
              blockReason === "readonly" && buttonDropdown?.surface === "input"
                ? undefined
                : blockReason,
            );
          }
          // Ambiguous rows carry no group id and no count; review keeps them
          // unavailable because they have no itemIndex.
          const itemGroups = new Set(
            repeatableItems
              .filter(({ ambiguous }) => !ambiguous)
              .map(({ itemGroupId }) => itemGroupId),
          );
          for (const itemGroupId of itemGroups) {
            const groupItems = repeatableItems.filter(
              (item) => !item.ambiguous && item.itemGroupId === itemGroupId,
            );
            registry.setFieldItemCount(
              sectionId,
              groupItems.length,
              itemGroupId,
            );
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
    });
  } finally {
    finishTiming();
  }
}

export async function collectFieldsSnapshotWithDropdowns(
  document: Document,
  signal?: AbortSignal,
  options: { mixedSectionDetection?: boolean } = {},
): Promise<CollectedSnapshot<FieldsAnalyzeRequest>> {
  if (resolveDocumentCompany(document) !== "generic")
    return collectFieldsSnapshot(document);
  const release = acquireDocumentRun(document);
  if (!release)
    return collectFieldsSnapshot(document, new Map(), {
      recoverBrokenLabels: true,
      titleNameCues: true,
      ...options,
    });
  try {
    const dropdowns = await collectButtonDropdowns(
      document,
      signal,
      (trigger) =>
        isSafeStructuralClick(trigger, trigger.closest("form") ?? document.body)
          .allowed,
    );
    const readonlyInputs = await collectReadonlyInputDropdowns(
      document,
      signal,
      (input) =>
        isSafeStructuralClick(input, input.closest("form") ?? document.body)
          .allowed,
    );
    return collectFieldsSnapshot(
      document,
      new Map([...dropdowns, ...readonlyInputs.dropdowns]),
      {
        searchDialogs: readonlyInputs.searchDialogs,
        recoverBrokenLabels: true,
        titleNameCues: true,
        ...options,
      },
    );
  } finally {
    release();
  }
}

function collectActionElements(document: Document) {
  return Array.from(
    document.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement
    >("button, input[type='button'], input[type='radio'], select"),
  ).filter((element) => {
    // A typeless button outside any form submits nothing; only its drawn
    // plus or minus names it.
    const glyph =
      element instanceof HTMLButtonElement &&
      !element.hasAttribute("type") &&
      !element.form
        ? iconGlyphLabel(element)
        : undefined;
    if (
      element instanceof HTMLButtonElement &&
      element.type !== "button" &&
      !glyph
    )
      return false;
    const label = labelOf(element) || glyph;
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
      (row) => !isTemplateLike(row) && hasPageFormControl(row),
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
          hasVisibleFormControl(item) ||
          (adapter.itemGroupId !== undefined &&
            componentFieldElements(item.ownerDocument).some(
              (control) => item.contains(control) && !isHidden(control),
            ))),
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

function repeatableRowState(row: Element): string {
  return JSON.stringify(
    Array.from(
      row.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input:not([type='hidden']):not([type='button']), select, textarea"),
    ).map((control) =>
      control instanceof HTMLSelectElement
        ? [control.tagName, control.name, control.value, control.selectedIndex]
        : [control.tagName, control.name, control.value],
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

/**
 * Rows counted for an add action. Without an action-specific row name the
 * action's section rows are used only when they form one provable repeated
 * group; rows of several groups (or an ambiguous boundary) cannot be counted
 * for a single action, so the count is unknown.
 */
function repeatableItemElementsForAction(
  container: Element | null,
  action: Element | undefined,
  adapter: CollectionAdapter,
): Element[] | undefined {
  const allItems = repeatableItemElements(container, adapter, "preparation");
  const componentAction =
    action instanceof HTMLElement ? adapter.actionDomId(action) : undefined;
  const component =
    action && executionPolicy(action.ownerDocument)?.componentPolicy;
  const section =
    component &&
    Object.entries(component.sections).find(
      ([kind]) => componentAction === component.actionPrefix + kind,
    )?.[1];
  if (section) {
    const adapterItems = container
      ? (adapter.repeatableItemCandidates?.(container) ?? [])
      : [];
    const candidates = adapterItems.length > 0 ? adapterItems : allItems;
    return candidates.filter(
      (item) =>
        !isTemplateLike(item) &&
        adapter.itemGroupId?.(item) === section.group &&
        (hasVisibleFormControl(item) ||
          (adapter.itemGroupId !== undefined &&
            componentFieldElements(item.ownerDocument).some(
              (control) => item.contains(control) && !isHidden(control),
            ))),
    );
  }
  // An identifier-less repeat group (C13) owns exactly the rows it proved.
  const implicitGroup =
    adapter === collectionAdapterForHost("") && action
      ? implicitRepeatGroupFor(action)
      : undefined;
  if (implicitGroup && implicitGroup.action === action) {
    const rows = allItems.filter((item) => implicitGroup.rows.includes(item));
    return !container ||
      formsSingleRepeatGroup(
        container,
        rows,
        (row) => adapter.itemGroupId?.(row) ?? repeatableItemGroupId(row),
      )
      ? rows
      : undefined;
  }
  const singleGroupItems = () =>
    !container ||
    formsSingleRepeatGroup(
      container,
      allItems,
      (row) => adapter.itemGroupId?.(row) ?? repeatableItemGroupId(row),
    )
      ? allItems
      : undefined;
  const groupKey = actionGroupKey(action);
  if (!groupKey) return singleGroupItems();
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
  return hasTypedItems ? [] : singleGroupItems();
}

function collectPreparationSnapshotInternal(
  document: Document,
  options: {
    /** Opt out of mixed section detection; omitted keeps it on. */
    mixedSectionDetection?: boolean;
  } = {},
): PreparationCollectedSnapshot {
  const companyId = resolveDocumentCompany(document);
  if (nativePolicyRequired(document))
    return collectNativePreparation(
      document,
      createSnapshotId("preparation"),
      siteOf(document),
      collectHplacePreparation(
        document,
        createSnapshotId("preparation"),
        siteOf(document),
      ),
    );
  if (companyId === "hplace")
    return collectHplacePreparation(
      document,
      createSnapshotId("preparation"),
      siteOf(document),
    );
  const adapter = collectionAdapterForHost(document);
  const registry = new CandidateRegistry();
  let candidateIndex = 0;
  const sections: PreparationSection[] = [];
  const generic = adapter === collectionAdapterForHost("");
  const actions = [
    ...collectActionElements(document).filter((element) =>
      companyId === "components"
        ? Boolean(adapter.actionDomId(element))
        : !generic ||
          ((element instanceof HTMLButtonElement ||
            (element instanceof HTMLInputElement &&
              element.type === "button")) &&
            isGenericPreparationAction(element)),
    ),
    ...(adapter.additionalActionElements?.(document) ?? []),
  ];
  const selector = sectionSelector(adapter, document);
  const actionsBySection = groupBySection(
    actions,
    selector,
    adapter === collectionAdapterForHost(""),
    companyId === "components" ? componentSectionContainer : undefined,
  );
  const containers: Array<Element | null> = Array.from(
    new Set([
      ...document.querySelectorAll(selector),
      ...actionsBySection.keys(),
    ]),
  );
  if (generic) {
    for (const group of genericFormGroups(document)) {
      if (!containers.includes(group.area)) containers.push(group.area);
    }
  }
  if (
    (actionsBySection.has(null) || containers.length === 0) &&
    !containers.includes(null)
  ) {
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
        semanticContext: collectActionSemanticContext(element, container, {
          generic: companyId === "generic",
        }),
        ...((labelOf(element) || iconGlyphLabel(element))
          ? { displayName: labelOf(element) || iconGlyphLabel(element) }
          : {}),
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
    mixedSectionGroup(actionCandidateId) {
      if (!generic || options.mixedSectionDetection === false) return undefined;
      const sectionId = actionSectionIds.get(actionCandidateId);
      if (!sectionId) return undefined;
      const action = actionElements.get(actionCandidateId);
      const root =
        (companyId === "components" && action
          ? componentSectionContainer(action)
          : undefined) ?? sectionRoots.get(sectionId);
      if (!root || !root.isConnected) return undefined;
      const rows = repeatableItemElementsForAction(root, action, adapter);
      if (!rows?.length) return undefined;
      const container = action
        ? implicitRepeatGroupFor(action)?.container
        : undefined;
      return detectMixedSectionGroup(
        container ?? root,
        rows,
        (row) => adapter.itemGroupId?.(row) ?? repeatableItemGroupId(row),
      );
    },
    countRepeatableGroups(actionCandidateId) {
      const sectionId = actionSectionIds.get(actionCandidateId);
      if (!sectionId) return undefined;
      const action = actionElements.get(actionCandidateId);
      const root =
        (companyId === "components" && action
          ? componentSectionContainer(action)
          : undefined) ?? sectionRoots.get(sectionId);
      if (root === undefined || (root && !root.isConnected)) return undefined;
      const nested =
        action instanceof HTMLElement
          ? adapter.nestedGroupState?.(action)
          : undefined;
      if (nested !== undefined) return nested?.length;
      return repeatableItemElementsForAction(
        root,
        actionElements.get(actionCandidateId),
        adapter,
      )?.length;
    },
    repeatableGroupState(actionCandidateId) {
      const sectionId = actionSectionIds.get(actionCandidateId);
      if (!sectionId) return undefined;
      const action = actionElements.get(actionCandidateId);
      const root =
        (companyId === "components" && action
          ? componentSectionContainer(action)
          : undefined) ?? sectionRoots.get(sectionId);
      if (root === undefined || (root && !root.isConnected)) return undefined;
      const nested =
        action instanceof HTMLElement
          ? adapter.nestedGroupState?.(action)
          : undefined;
      if (nested !== undefined) return nested ?? undefined;
      return repeatableItemElementsForAction(
        root,
        actionElements.get(actionCandidateId),
        adapter,
      )?.map(repeatableRowState);
    },
    repeatableGroupLimit(actionCandidateId) {
      const action = actionElements.get(actionCandidateId);
      return action ? genericFormGroupFor(action)?.maximumRows : undefined;
    },
  };
}

export function collectPreparationSnapshot(
  document: Document,
  options: Parameters<typeof collectPreparationSnapshotInternal>[1] = {},
): PreparationCollectedSnapshot {
  return withStructuralCollection("preparation", () =>
    collectPreparationSnapshotInternal(document, options),
  );
}

export function collectFieldsSnapshot(
  document: Document,
  dropdowns: ReadonlyMap<HTMLElement, ButtonDropdown> = new Map(),
  options: Parameters<typeof collectFieldsSnapshotInternal>[2] = {},
): CollectedSnapshot<FieldsAnalyzeRequest> {
  return withStructuralCollection("fields", () =>
    collectFieldsSnapshotInternal(document, dropdowns, options),
  );
}
