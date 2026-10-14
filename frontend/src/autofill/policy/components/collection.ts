import { componentCapability } from "../component-policy";
import { componentRules, componentName } from "../runtime-rules";
import { componentSelector } from "../component-dom";
import { componentPolicy } from "../../policy/component-policy";
import {
  componentSections,
  componentSectionPrefix,
  type ComponentSectionKind,
} from "./sections";
import type { CollectionAdapter } from "../../adapters/collection";
import { componentAddressTrigger } from "./address";

export interface ComponentRowIdentity {
  itemGroupId: string;
  index: number;
  prefix: string;
}

/** Named descendants establish identity; generated accordion IDs are not stable. */
export function componentRowIdentity(
  element: Element,
): ComponentRowIdentity | undefined {
  if (!element.matches(componentSelector(element, "row"))) return undefined;
  const controls = [...element.querySelectorAll("[name]")].filter(
    (control) => control.closest(componentSelector(control, "row")) === element,
  );
  const names = controls.map((control) => control.getAttribute("name")!);
  if (new Set(names).size !== names.length) return undefined;
  for (const section of Object.values(
    componentSections(element.ownerDocument),
  )) {
    const naming = componentRules(element.ownerDocument).row;
    const base = section.prefix + naming.separator;
    if (!names.length || names.some((name) => !name.startsWith(base))) continue;
    const suffixes = names.map((name) => name.slice(base.length));
    const parts = suffixes.map((suffix) =>
      section.singleton
        ? [String(naming.singletonIndex), suffix]
        : new RegExp(naming.indexPattern).exec(suffix)?.slice(1),
    );
    if (parts.some((part) => !part)) return undefined;
    const index = Number(parts[0]![0]);
    if (
      !Number.isSafeInteger(index) ||
      index > componentRules(element.ownerDocument).row.maxIndex ||
      parts.some((part) => Number(part![0]) !== index)
    )
      return undefined;
    if (parts.filter((part) => part![1] === section.anchor).length !== 1)
      return undefined;
    return {
      itemGroupId: section.group,
      index,
      prefix: section.singleton
        ? section.prefix
        : componentName(element.ownerDocument, section.prefix, index),
    };
  }
  return undefined;
}

function ownedLabel(field: Element): string | undefined {
  const labels = [
    ...field.querySelectorAll(componentSelector(field, "fieldLabel")),
  ].filter(
    (label) => label.closest(componentSelector(label, "field")) === field,
  );
  return labels.length === 1
    ? labels[0]!.textContent?.replace(/[\s*]/g, "")
    : undefined;
}

function labeledField(element: Element): Element | undefined {
  let field = element.closest(componentSelector(element, "field"));
  while (
    field &&
    field.closest(componentSelector(field, "row")) ===
      element.closest(componentSelector(element, "row"))
  ) {
    if (ownedLabel(field)) return field;
    field =
      field.parentElement?.closest(
        componentSelector(field.parentElement, "field"),
      ) ?? null;
  }
  return undefined;
}

/** Picker trigger text and accessible names may contain the current answer. */
export function componentFieldLabel(element: HTMLElement): string | undefined {
  const field = labeledField(element);
  if (field) return ownedLabel(field);
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const label = element.labels?.[0];
    if (!label) return undefined;
    const clone = label.cloneNode(true) as Element;
    clone
      .querySelectorAll("input, select, textarea, button, [contenteditable]")
      .forEach((control) => control.remove());
    return clone.textContent?.replace(/[\s*]/g, "") || undefined;
  }
  return undefined;
}

function radioGroupName(element: Element): string | undefined {
  if (!element.matches(componentSelector(element, "radioGroup")))
    return undefined;
  const field = labeledField(element);
  if (
    !field ||
    field.querySelectorAll(componentSelector(field, "radioGroup")).length !== 1
  )
    return undefined;
  const label = ownedLabel(field);
  const specifications = componentPolicy(element.ownerDocument).radioGroups;
  const spec = label && specifications[label];
  if (!spec) return undefined;
  const options = [
    ...element.querySelectorAll(componentSelector(element, "radioOption")),
  ].map((option) => option.textContent?.trim());
  if (
    options.length !== spec.options.length ||
    spec.options.some(
      (option) =>
        options.filter((candidate) => candidate === option).length !== 1,
    )
  )
    return undefined;
  const row = element.closest(componentSelector(element, "row"));
  if (spec.scope === "DOCUMENT")
    return row || !spec.prefix
      ? undefined
      : componentName(element.ownerDocument, spec.prefix, spec.suffix);
  const identity = row && componentRowIdentity(row);
  if (!identity || !spec.allowedGroups.includes(identity.itemGroupId))
    return undefined;
  return componentName(element.ownerDocument, identity.prefix, spec.suffix);
}

export function componentRadioGroupDomName(
  element: Element,
): string | undefined {
  const name = radioGroupName(element);
  if (!name) return undefined;
  const matches = [
    ...element.ownerDocument.querySelectorAll(
      componentSelector(element.ownerDocument, "radioGroup"),
    ),
  ].filter((candidate) => radioGroupName(candidate) === name);
  return matches.length === 1 ? name : undefined;
}

export function componentSyntheticDomName(
  element: Element,
): string | undefined {
  if (element.matches(componentSelector(element, "radioGroup")))
    return componentRadioGroupDomName(element);
  const rules = componentPolicy(element.ownerDocument).syntheticFields.filter(
    (rule) => element.matches(rule.selector),
  );
  if (rules.length !== 1) return undefined;
  const rule = rules[0];
  const matches = [
    ...element.ownerDocument.querySelectorAll(rule.selector),
  ].filter((candidate) => {
    const field = labeledField(candidate);
    return (
      (!rule.excludeRows ||
        !candidate.closest(componentSelector(candidate, "row"))) &&
      field &&
      rule.labels.includes(ownedLabel(field) ?? "")
    );
  });
  return matches.length === rule.count && matches.includes(element)
    ? rule.name
    : undefined;
}

/** Extra custom fields only; native inputs remain the common collector's job. */
export function componentFieldElements(document: Document): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      componentSelector(document, "extraFields"),
    ),
  ].filter((element) => {
    if (element.matches(componentSelector(element, "radioGroup")))
      return componentRadioGroupDomName(element) !== undefined;
    const name = element.getAttribute("name")!;
    const topLevelLabels = componentPolicy(document).topLevelLabels;
    const topLevelLabel = topLevelLabels[name];
    if (topLevelLabel) {
      const field = labeledField(element);
      return Boolean(
        field &&
        !element.closest(componentSelector(element, "row")) &&
        ownedLabel(field) === topLevelLabel &&
        document.querySelectorAll(`[name="${name}"]`).length === 1,
      );
    }
    const row = element.closest(componentSelector(element, "row"));
    const identity = row && componentRowIdentity(row);
    if (
      !identity ||
      !name.startsWith(
        identity.prefix + componentRules(element.ownerDocument).row.separator,
      )
    )
      return false;
    const suffix = name.slice(
      identity.prefix.length +
        componentRules(element.ownerDocument).row.separator.length,
    );
    const pattern =
      componentPolicy(document).buttonFieldsByGroup[identity.itemGroupId];
    const supported = !!pattern && new RegExp(pattern).test(suffix);
    if (!supported) return false;
    return Boolean(
      identity &&
      name.startsWith(
        identity.prefix + componentRules(element.ownerDocument).row.separator,
      ) &&
      row!.querySelectorAll(`[name="${name}"]`).length === 1,
    );
  });
}

function componentSectionKind(
  field: Element,
): ComponentSectionKind | undefined {
  if (!field.matches(componentSelector(field, "field"))) return undefined;
  const labels = [
    ...field.querySelectorAll(componentSelector(field, "fieldLabel")),
  ].filter(
    (label) => label.closest(componentSelector(label, "field")) === field,
  );
  if (labels.length !== 1) return undefined;
  const label = labels[0]!.textContent?.replace(/[\s*]/g, "");
  return (
    Object.keys(
      componentSections(field.ownerDocument),
    ) as ComponentSectionKind[]
  ).find(
    (kind) => componentSections(field.ownerDocument)[kind].label === label,
  );
}

export function componentSectionContainer(
  element: Element,
): Element | undefined {
  let field = element.closest(componentSelector(element, "field"));
  while (field) {
    const kind = componentSectionKind(field);
    if (kind) {
      const matches = [
        ...element.ownerDocument.querySelectorAll(
          componentSelector(element.ownerDocument, "field"),
        ),
      ].filter((candidate) => componentSectionKind(candidate) === kind);
      return matches.length === 1 ? field : undefined;
    }
    field =
      field.parentElement?.closest(
        componentSelector(field.parentElement, "field"),
      ) ?? null;
  }
  return undefined;
}

function ownsSectionAction(field: Element, element: Element): boolean {
  return componentPolicy(element.ownerDocument).structure.sectionAddRelation ===
    "DIRECT_CHILD"
    ? element.parentElement === field
    : field.contains(element);
}
function sectionAddAction(element: HTMLElement): string | undefined {
  if (
    !element.matches(componentSelector(element, "addTrigger")) ||
    element.textContent?.trim() !==
      componentPolicy(element.ownerDocument).labels.add
  )
    return undefined;
  const field = componentSectionContainer(element);
  if (!field || !ownsSectionAction(field, element)) return undefined;
  const kind = componentSectionKind(field)!;
  if (componentSections(element.ownerDocument)[kind].singleton)
    return undefined;
  const addButtons = [
    ...field.querySelectorAll(componentSelector(field, "addTrigger")),
  ].filter(
    (button) =>
      ownsSectionAction(field, button) &&
      button.textContent?.trim() ===
        componentPolicy(element.ownerDocument).labels.add,
  );
  if (addButtons.length !== 1) return undefined;
  const rows = [...field.querySelectorAll(componentSelector(field, "row"))];
  if (
    rows.some(
      (row) =>
        !componentRowIdentity(row)?.prefix.startsWith(
          componentSectionPrefix(kind, element.ownerDocument),
        ),
    )
  )
    return undefined;
  const indices = rows
    .map((row) => componentRowIdentity(row)!.index)
    .sort((a, b) => a - b);
  if (
    componentRules(element.ownerDocument).row.requireContiguous &&
    indices.some((index, position) => index !== position)
  )
    return undefined;
  return `${componentPolicy(element.ownerDocument).actionPrefix}${kind}`;
}

/** A major row is counted only when all three named controls share its index. */
export function componentMajorRowsForAction(
  element: Element,
): HTMLInputElement[] | undefined {
  if (!componentCapability(element.ownerDocument, "nestedRepeat"))
    return undefined;
  if (
    !element.isConnected ||
    !element.matches(componentSelector(element, "addTrigger")) ||
    element.textContent?.trim() !==
      componentPolicy(element.ownerDocument).labels.majorAdd
  )
    return undefined;
  const row = element.closest(componentSelector(element, "row"));
  const identity = row && componentRowIdentity(row);
  if (
    !identity ||
    !componentPolicy(element.ownerDocument).groups.education.includes(
      identity.itemGroupId,
    ) ||
    identity.index > componentRules(element.ownerDocument).row.maxIndex
  )
    return undefined;
  const field = labeledField(element);
  if (
    !field ||
    field.closest(componentSelector(field, "row")) !== row ||
    ownedLabel(field) !== componentPolicy(element.ownerDocument).labels.major
  )
    return undefined;
  const adds = [
    ...field.querySelectorAll(componentSelector(field, "addTrigger")),
  ].filter(
    (button) =>
      button.textContent?.trim() ===
      componentPolicy(element.ownerDocument).labels.majorAdd,
  );
  if (adds.length !== 1 || adds[0] !== element) return undefined;
  const prefix =
    componentName(
      element.ownerDocument,
      identity.prefix,
      componentPolicy(element.ownerDocument).major.rowSuffix,
    ) + componentRules(element.ownerDocument).row.separator;
  const named = [...field.querySelectorAll<HTMLElement>("[name]")].filter(
    (candidate) => candidate.getAttribute("name")?.startsWith(prefix),
  );
  const indices = new Set<number>();
  for (const candidate of named) {
    const suffix = candidate.getAttribute("name")!.slice(prefix.length);
    const major = componentPolicy(element.ownerDocument).major;
    const [indexText, ...tail] = suffix.split(
      componentRules(element.ownerDocument).row.separator,
    );
    const match = /^\d+$/.test(indexText)
      ? [
          suffix,
          indexText,
          tail.join(componentRules(element.ownerDocument).row.separator),
        ]
      : null;
    if (
      match &&
      (Number(match[1]) -
        componentRules(element.ownerDocument).major.startIndex >=
        major.maxRows ||
        (match[2] &&
          ![major.classificationSuffix, major.fieldSuffix].includes(match[2])))
    )
      return undefined;
    if (!match) return undefined;
    indices.add(Number(match[1]));
  }
  if (
    indices.size < 1 ||
    indices.size > componentPolicy(element.ownerDocument).major.maxRows
  )
    return undefined;
  const rows: HTMLInputElement[] = [];
  const rowRules = componentRules(element.ownerDocument).major;
  const orderedIndices = [...indices].sort((a, b) => a - b);
  for (const [position, index] of orderedIndices.entries()) {
    if (
      index < rowRules.startIndex ||
      (rowRules.requireContiguous && index !== rowRules.startIndex + position)
    )
      return undefined;
    const base = `${prefix}${index}`;
    const name = named.filter(
      (candidate) => candidate.getAttribute("name") === base,
    );
    const parts = componentPolicy(element.ownerDocument).major.parts;
    if (name.length !== 1 || !(name[0] instanceof HTMLInputElement))
      return undefined;
    for (const part of parts) {
      const partName = part.suffix
        ? componentName(element.ownerDocument, base, part.suffix)
        : base;
      const nodes = named.filter(
        (node) => node.getAttribute("name") === partName,
      );
      if (
        nodes.length === 0
          ? part.required
          : nodes.length !== 1 || !nodes[0].matches(part.selector)
      )
        return undefined;
    }
    rows.push(name[0]);
  }
  return rows;
}

function majorAddAction(element: HTMLElement): string | undefined {
  if (!componentMajorRowsForAction(element)) return undefined;
  const row = element.closest(componentSelector(element, "row"))!;
  const identity = componentRowIdentity(row)!;
  const section = Object.entries(
    componentPolicy(element.ownerDocument).sections,
  ).find(([, section]) => section.group === identity.itemGroupId)?.[0];
  if (!section) return undefined;
  return componentRules(element.ownerDocument)
    .major.actionTemplate.replaceAll(
      "{prefix}",
      componentPolicy(element.ownerDocument).actionPrefix,
    )
    .replaceAll("{section}", section)
    .replaceAll("{index}", String(identity.index));
}

export function createComponentCollectionAdapter(
  document: Document,
): CollectionAdapter {
  return {
    sectionSelectors: [componentSelector(document, "section")],
    collectsInputButtonFields: false,
    itemGroupId: (element) => componentRowIdentity(element)?.itemGroupId,
    actionDomId: (element) =>
      (element === componentAddressTrigger(element.ownerDocument)
        ? componentPolicy(element.ownerDocument).addressAction
        : undefined) ??
      majorAddAction(element) ??
      sectionAddAction(element),
    nestedGroupState(action) {
      if (!componentCapability(document, "nestedRepeat")) return undefined;
      const field = action.closest(componentSelector(action, "field"));
      const isNestedAction =
        action.textContent?.trim() ===
          componentPolicy(document).labels.majorAdd && !!field;
      if (!isNestedAction) return undefined;
      return (
        componentMajorRowsForAction(action)?.map((input) => {
          const field = input.closest(componentSelector(input, "field"))!;
          const parts = componentPolicy(document).major.parts.map((part) => {
            const name = part.suffix
              ? componentName(document, input.name, part.suffix)
              : input.name;
            const node = [
              ...field.querySelectorAll<HTMLElement>("[name]"),
            ].find((node) => node.getAttribute("name") === name);
            return [
              name,
              part.read === "VALUE"
                ? ((node as HTMLInputElement | undefined)?.value ?? "")
                : (node?.textContent?.trim() ?? ""),
            ];
          });
          return JSON.stringify(parts);
        }) ?? null
      );
    },
    repeatableItemCandidates(container) {
      const isAccordion = container.matches(
        componentSelector(container, "section"),
      );
      const sectionKind = componentSectionKind(container);
      if (
        !isAccordion &&
        (!sectionKind || componentSectionContainer(container) !== container)
      )
        return undefined;
      const rows = [
        ...container.querySelectorAll(componentSelector(container, "row")),
      ].filter((row) =>
        isAccordion
          ? row.closest(componentSelector(row, "section")) === container
          : componentSectionContainer(row) === container,
      );
      const identities = rows.map(componentRowIdentity);
      if (
        identities.some(
          (identity) =>
            !identity ||
            (sectionKind &&
              !identity.prefix.startsWith(
                componentSectionPrefix(sectionKind, container.ownerDocument),
              )),
        )
      )
        return [];
      const keys = identities.map((identity) => identity!.prefix);
      if (new Set(keys).size !== keys.length) return [];
      const ordered = rows.sort(
        (left, right) =>
          componentRowIdentity(left)!.index -
          componentRowIdentity(right)!.index,
      );
      const counts = new Map<string, number>();
      for (const row of ordered) {
        const identity = componentRowIdentity(row)!;
        const expected = counts.get(identity.itemGroupId) ?? 0;
        if (
          componentRules(document).row.requireContiguous &&
          identity.index !== expected
        )
          return [];
        counts.set(identity.itemGroupId, expected + 1);
      }
      return ordered;
    },
    requiresVisibleControl: () => true,
  };
}

// Lazy test compatibility: production always supplies the active document.
export const componentCollectionAdapter: CollectionAdapter = {
  get sectionSelectors() {
    return createComponentCollectionAdapter(document).sectionSelectors;
  },
  collectsInputButtonFields: false,
  itemGroupId: (element) =>
    createComponentCollectionAdapter(element.ownerDocument).itemGroupId?.(
      element,
    ),
  actionDomId: (element) =>
    createComponentCollectionAdapter(element.ownerDocument).actionDomId(
      element,
    ),
  repeatableItemCandidates: (element) =>
    createComponentCollectionAdapter(
      element.ownerDocument,
    ).repeatableItemCandidates(element),
  requiresVisibleControl: () => true,
};
