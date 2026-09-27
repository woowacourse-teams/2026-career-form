/**
 * Shared repeated-row group ownership.
 *
 * Collection, the semantic repeat context, registry counts and the
 * pre-execution revalidation must all agree on which rows form one repeated
 * group. A group is identified, in priority order, by:
 *
 * 1. an explicit identifier (company adapter `itemGroupId`, then `*-item` names);
 * 2. DOM ownership: the highest ancestor that owns only this row (its "own
 *    region"), compared by parent, structural path and the region's own
 *    headings. Headings can only separate regions; equal headings never merge
 *    regions whose structure differs.
 *
 * When a heading sits between two rows of one ownership group without
 * belonging to either row's own region, the boundary cannot be proven and the
 * whole group is marked ambiguous so callers keep those rows unavailable.
 */

const HEADING_SELECTOR = "legend, h1, h2, h3, h4, h5, h6";

export type RepeatGroupKey =
  | { kind: "explicit"; id: string }
  | { kind: "owned"; parent: Element | null; signature: string };

export interface RepeatRowAssignment {
  row: Element;
  key: RepeatGroupKey;
  /** 1-based position of the row's group among the section's groups. */
  groupOrdinal: number;
  /** True when the group boundary cannot be proven. */
  ambiguous: boolean;
  /** Public group identifier; opaque for ownership groups. */
  itemGroupId?: string;
  itemIndex?: number;
  rowCount?: number;
}

function normalizedTitle(element: Element): string {
  return (element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\d+/g, "#");
}

function structuralToken(element: Element, isRow: boolean): string {
  const tag = element.tagName.toLowerCase();
  if (isRow) return tag;
  const classes = Array.from(element.classList)
    .map((name) => name.replace(/\d+/g, "#"))
    .sort();
  return [tag, ...classes].join(".");
}

function ownRegion(row: Element, rows: readonly Element[], container: Element) {
  let region = row;
  let ancestor = row.parentElement;
  // Rows come from inside `container`, so walking up reaches it.
  while (ancestor && ancestor !== container) {
    if (rows.some((other) => other !== row && ancestor!.contains(other))) break;
    region = ancestor;
    ancestor = ancestor.parentElement;
  }
  return region;
}

const TITLE_TAG = /^H[1-6]$/;

/**
 * An element's own titles: a direct legend or heading, or a heading one level
 * below, outside the next element on the path to the row. Walks children
 * instead of running a `:scope` selector because this runs on every
 * revalidation.
 */
function ownTitles(element: Element, next: Element | undefined): string[] {
  const titles: string[] = [];
  for (const child of Array.from(element.children)) {
    if (child === next) continue;
    if (child.tagName === "LEGEND" || TITLE_TAG.test(child.tagName)) {
      titles.push(normalizedTitle(child));
      continue;
    }
    for (const grandchild of Array.from(child.children))
      if (TITLE_TAG.test(grandchild.tagName) && !next?.contains(grandchild))
        titles.push(normalizedTitle(grandchild));
  }
  return titles.filter(Boolean);
}

function ownedSignature(row: Element, region: Element): string {
  const path: Element[] = [];
  for (
    let current: Element | null = row;
    current;
    current = current.parentElement
  ) {
    path.unshift(current);
    if (current === region) break;
  }
  return JSON.stringify(
    path.map((element, index) => [
      structuralToken(element, element === row),
      ownTitles(element, path[index + 1]),
    ]),
  );
}

export function sameRepeatGroupKey(
  left: RepeatGroupKey,
  right: RepeatGroupKey,
): boolean {
  if (left.kind === "explicit" || right.kind === "explicit") {
    return (
      left.kind === "explicit" &&
      right.kind === "explicit" &&
      left.id === right.id
    );
  }
  return left.parent === right.parent && left.signature === right.signature;
}

// Node.DOCUMENT_POSITION_FOLLOWING, spelled out so rows from another realm
// (e.g. a same-origin frame document) do not depend on this realm's `Node`.
const DOCUMENT_POSITION_FOLLOWING = 4;

function precedes(left: Node, right: Node): boolean {
  return Boolean(
    left.compareDocumentPosition(right) & DOCUMENT_POSITION_FOLLOWING,
  );
}

/**
 * A heading between two rows that belongs to neither row's own region. Rows of
 * one ownership group share the parent of their own regions, so anything in
 * document order between two such regions lies in the siblings between them.
 */
function hasForeignHeadingBetween(
  rows: readonly Element[],
  regions: ReadonlyMap<Element, Element>,
): boolean {
  if (rows.length < 2) return false;
  const ordered = rows
    .map((row) => regions.get(row)!)
    .sort((left, right) => (precedes(left, right) ? -1 : 1));
  for (let index = 1; index < ordered.length; index += 1) {
    const after = ordered[index]!;
    for (
      let sibling = ordered[index - 1]!.nextElementSibling;
      sibling && sibling !== after;
      sibling = sibling.nextElementSibling
    ) {
      if (
        sibling.matches(HEADING_SELECTOR) ||
        sibling.querySelector(HEADING_SELECTOR)
      )
        return true;
    }
  }
  return false;
}

/**
 * Assign every row of one section to a repeated group. Row order is kept, so
 * `itemIndex` counts rows of the same group in the order they were given.
 */
export function assignRepeatGroups(
  container: Element,
  rows: readonly Element[],
  explicitGroupId: (row: Element) => string | undefined,
  sectionId: string,
): RepeatRowAssignment[] {
  const regions = new Map<Element, Element>();
  const keys = rows.map((row): RepeatGroupKey => {
    const id = explicitGroupId(row);
    if (id) return { kind: "explicit", id };
    const region = ownRegion(row, rows, container);
    regions.set(row, region);
    return {
      kind: "owned",
      parent: region.parentElement,
      signature: ownedSignature(row, region),
    };
  });

  const groups: Array<{ key: RepeatGroupKey; rows: Element[] }> = [];
  rows.forEach((row, index) => {
    const key = keys[index]!;
    const group = groups.find((entry) => sameRepeatGroupKey(entry.key, key));
    if (group) group.rows.push(row);
    else groups.push({ key, rows: [row] });
  });

  let ownedOrdinal = 0;
  const described = groups.map((group, index) => {
    const ambiguous =
      group.key.kind === "owned" &&
      hasForeignHeadingBetween(group.rows, regions);
    const itemGroupId =
      group.key.kind === "explicit"
        ? group.key.id
        : ambiguous
          ? undefined
          : `${sectionId}-rows-${++ownedOrdinal}`;
    return { ...group, ordinal: index + 1, ambiguous, itemGroupId };
  });

  return rows.map((row, index) => {
    const group = described.find((entry) =>
      sameRepeatGroupKey(entry.key, keys[index]!),
    )!;
    return {
      row,
      key: group.key,
      groupOrdinal: group.ordinal,
      ambiguous: group.ambiguous,
      ...(group.ambiguous
        ? {}
        : {
            itemIndex: group.rows.indexOf(row),
            rowCount: group.rows.length,
          }),
      ...(group.itemGroupId ? { itemGroupId: group.itemGroupId } : {}),
    };
  });
}

/** Whether the given rows form exactly one provable repeated group. */
export function formsSingleRepeatGroup(
  container: Element,
  rows: readonly Element[],
  explicitGroupId: (row: Element) => string | undefined,
): boolean {
  const assignments = assignRepeatGroups(container, rows, explicitGroupId, "");
  return (
    assignments.every(({ ambiguous }) => !ambiguous) &&
    new Set(assignments.map(({ groupOrdinal }) => groupOrdinal)).size <= 1
  );
}
