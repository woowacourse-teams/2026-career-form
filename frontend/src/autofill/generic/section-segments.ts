import { genericRowFor } from "../dom/repeatable-rows";

/**
 * Generic-flow sections: runs of fields that are contiguous in document order.
 * Only for documents where `resolveDocumentCompany(document) === "generic"`;
 * the caller owns that gate. Collection keeps its own `sectionId` grouping.
 *
 * Boundary priority:
 * 1. repeated rows (existing generic row detection): one section per row, and
 *    nothing inside a row splits it;
 * 2. the nearest fieldset/section/[role=group]/table holding two or more fields;
 * 3. heading-like elements between fields, in document order even when they
 *    sit outside the fields' containers;
 * 4. a field leaving its heading's scope (the common ancestor of the heading
 *    and the first field after it).
 * Without any of these the whole form is one section.
 */
export interface SegmentField {
  element: Element;
  label?: string;
  control: string;
}

export interface SegmentStyle {
  fontWeight: string;
  fontSize: string;
}

export type StyleOf = (element: Element) => SegmentStyle;

export type SectionBoundary =
  "start" | "repeat-row" | "container" | "heading" | "divergence";

export interface GenericSection<T extends SegmentField = SegmentField> {
  title?: string;
  /** Active tab or step name, the top-level parent of every section. */
  parentTitle?: string;
  /** Highest-priority reason this section starts. */
  boundary: SectionBoundary;
  fields: T[];
  /** Hash of the ordered label and control kinds; equal rows share it. */
  fingerprint: string;
}

const CONTROL_SELECTOR = "input, select, textarea";
const CONTAINER_SELECTOR = "fieldset, section, [role='group'], table";
const TAG_HEADING_SELECTOR =
  "h1, h2, h3, h4, h5, h6, legend, caption, [role='heading']";
const NON_HEADING_CONTEXT =
  "label, button, a, option, select, textarea, script, style, template, [role='tab'], [role='tablist']";
const ACTIVE_STEP_SELECTOR =
  "[role='tab'][aria-selected='true'], [aria-current='step']";
const MAX_HEADING_LENGTH = 30;
const HEADING_WEIGHT = 600;
// Node.DOCUMENT_POSITION_FOLLOWING without depending on this realm's Node.
const DOCUMENT_POSITION_FOLLOWING = 4;

const computedStyleOf: StyleOf = (element) => {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return {
    fontWeight: style?.fontWeight ?? "",
    fontSize: style?.fontSize ?? "",
  };
};

function normalizedText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function precedes(left: Node, right: Node): boolean {
  return Boolean(
    left.compareDocumentPosition(right) & DOCUMENT_POSITION_FOLLOWING,
  );
}

function fontWeight(value: string): number {
  return value === "bold" || value === "bolder"
    ? 700
    : Number.parseFloat(value);
}

function hasDirectText(element: Element): boolean {
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === 3 && node.textContent?.trim(),
  );
}

function isFullRowHeader(element: Element): boolean {
  const row = element.parentElement;
  return (
    element.tagName === "TH" &&
    row?.tagName === "TR" &&
    (row as HTMLTableRowElement).cells.length === 1 &&
    (element as HTMLTableCellElement).colSpan > 1
  );
}

function labelElementOf(element: Element): Element {
  return (element as HTMLInputElement).labels?.[0] ?? element;
}

/** Heading-like elements followed by at least one field, in document order. */
function headingsBetweenFields(
  document: Document,
  fields: readonly SegmentField[],
  styleOf: StyleOf,
): Element[] {
  const labels = new Set(
    fields.map((field) => field.label?.replace(/\s+/g, " ").trim()),
  );
  const labelledBy = new Set(
    fields.flatMap((field) =>
      (field.element.getAttribute("aria-labelledby") ?? "").split(/\s+/),
    ),
  );
  const headings: Element[] = [];
  let next = 0;
  for (const element of Array.from(document.querySelectorAll("body *"))) {
    while (next < fields.length && !precedes(element, fields[next]!.element))
      next += 1;
    const following = fields[next];
    if (!following) break;
    if (headings.at(-1)?.contains(element)) continue;
    // Containers of fields are never headings; checking that first keeps the
    // text read off large ancestors.
    if (
      element.closest(NON_HEADING_CONTEXT) ||
      element.querySelector(CONTROL_SELECTOR)
    )
      continue;
    const text = normalizedText(element);
    if (
      !text ||
      text.length > MAX_HEADING_LENGTH ||
      !/[\p{L}\p{N}]/u.test(text) ||
      labels.has(text) ||
      (element.id && labelledBy.has(element.id))
    )
      continue;
    if (element.matches(TAG_HEADING_SELECTOR) || isFullRowHeader(element)) {
      headings.push(element);
      continue;
    }
    if (!hasDirectText(element)) continue;
    const style = styleOf(element);
    if (
      fontWeight(style.fontWeight) >= HEADING_WEIGHT ||
      Number.parseFloat(style.fontSize) >
        Number.parseFloat(styleOf(labelElementOf(following.element)).fontSize)
    )
      headings.push(element);
  }
  return headings;
}

function commonAncestor(left: Element, right: Element): Element {
  for (let node = left.parentElement; node; node = node.parentElement)
    if (node.contains(right)) return node;
  return left.ownerDocument.documentElement;
}

function fingerprintOf(fields: readonly SegmentField[]): string {
  const source = fields
    .map(
      (field) =>
        `${(field.label ?? "").replace(/\s+/g, " ").trim().replace(/\d+/g, "#")}\u001f${field.control}`,
    )
    .join("\u001e");
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function segmentGenericSections<T extends SegmentField>(
  document: Document,
  fields: readonly T[],
  { styleOf = computedStyleOf }: { styleOf?: StyleOf } = {},
): GenericSection<T>[] {
  const ordered = [...fields].sort((left, right) =>
    left.element === right.element
      ? 0
      : precedes(left.element, right.element)
        ? -1
        : 1,
  );
  const headings = headingsBetweenFields(document, ordered, styleOf);
  const fieldCounts = new Map<Element, number>();
  for (const field of ordered)
    for (
      let node = field.element.parentElement;
      node;
      node = node.parentElement
    )
      if (node.matches(CONTAINER_SELECTOR))
        fieldCounts.set(node, (fieldCounts.get(node) ?? 0) + 1);
  const containerOf = (start: Element): Element | undefined => {
    for (let node = start.parentElement; node; node = node.parentElement)
      if ((fieldCounts.get(node) ?? 0) >= 2) return node;
    return undefined;
  };
  const active = document.querySelector(ACTIVE_STEP_SELECTOR);
  const parentTitle = active ? normalizedText(active) || undefined : undefined;

  const sections: Array<Omit<GenericSection<T>, "fingerprint">> = [];
  let headingIndex = 0;
  let context: { title: string; scope: Element } | undefined;
  let previousRow: Element | undefined;
  let previousContainer: Element | undefined;
  for (const field of ordered) {
    const row = genericRowFor(field.element);
    const sameRow =
      sections.length > 0 && row !== undefined && row === previousRow;
    let headingPassed = false;
    let rowTitle: string | undefined;
    while (
      headingIndex < headings.length &&
      precedes(headings[headingIndex]!, field.element)
    ) {
      const heading = headings[headingIndex++]!;
      if (sameRow) continue;
      if (row?.contains(heading)) {
        rowTitle = normalizedText(heading);
        continue;
      }
      context = {
        title: normalizedText(heading),
        scope: commonAncestor(heading, field.element),
      };
      headingPassed = true;
    }
    const container = containerOf(row ?? field.element);
    const reasons: SectionBoundary[] = [];
    if (!sameRow) {
      const diverged =
        !headingPassed &&
        context !== undefined &&
        !context.scope.contains(field.element);
      if (diverged) context = undefined;
      if (row && row !== previousRow) reasons.push("repeat-row");
      if (container !== previousContainer) reasons.push("container");
      if (headingPassed) reasons.push("heading");
      if (diverged) reasons.push("divergence");
      if (!row && previousRow) reasons.push("repeat-row");
    }
    if (sections.length === 0 || reasons.length > 0) {
      const title =
        rowTitle ??
        context?.title ??
        (container?.getAttribute("aria-label")?.trim() || undefined);
      sections.push({
        ...(title ? { title } : {}),
        ...(parentTitle ? { parentTitle } : {}),
        boundary: reasons[0] ?? "start",
        fields: [],
      });
    }
    sections.at(-1)!.fields.push(field);
    previousRow = row;
    previousContainer = container;
  }
  return sections.map((section) => ({
    ...section,
    fingerprint: fingerprintOf(section.fields),
  }));
}
