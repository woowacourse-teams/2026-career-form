import { normalized } from "./readonly-search";
import type { SearchSurface } from "./search-surface";
import { elements, shown } from "./search-surface-dom";

/**
 * Quiet time after the last list mutation before a role-less layer's result
 * list is judged. `SearchSession.wait` polls every 100ms, so at least two
 * consecutive polls must pass without a new mutation.
 */
export const LOCAL_RESULT_STABLE_MS = 300;

const LIST_SELECTOR = "ul, ol, table, [role='list']";

/** The list element a mutation or an item belongs to (tbody folds into table). */
export function listOf(node: Node): Element | undefined {
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return element?.closest(LIST_SELECTOR) ?? undefined;
}

/** Direct result items of a result root. */
export function listItems(root: Element): Element[] {
  if (root.tagName === "TABLE")
    return Array.from((root as HTMLTableElement).tBodies).flatMap((body) =>
      Array.from(body.rows),
    );
  return Array.from(root.children);
}

/** Current-generation list mutations, recorded by the result observer. */
export class LocalMutationRecord {
  private readonly added = new Map<Element, Set<Element>>();
  private readonly lastAt = new Map<Element, number>();

  record(record: MutationRecord, now: number): void {
    if (record.type !== "childList") return;
    const list = listOf(record.target);
    if (!list) return;
    this.lastAt.set(list, now);
    const direct =
      record.target === list ||
      (list.tagName === "TABLE" &&
        (record.target as Element).tagName === "TBODY" &&
        record.target.parentNode === list);
    if (!direct) return;
    for (const node of Array.from(record.addedNodes)) {
      if (node.nodeType !== 1) continue;
      const items = this.added.get(list) ?? new Set<Element>();
      items.add(node as Element);
      this.added.set(list, items);
    }
  }

  addedItems(root: Element): ReadonlySet<Element> {
    return this.added.get(root) ?? new Set();
  }

  lastMutationAt(root: Element): number | undefined {
    return this.lastAt.get(root);
  }
}

/**
 * True when the result area carries any explicit readiness or completeness
 * signal; the existing decision then applies unchanged.
 */
export function hasExplicitResultSignal(
  surface: SearchSurface,
  root: Element,
  actions: readonly Element[],
  busySeen: boolean,
): boolean {
  if (busySeen) return true;
  for (
    let element: Element | null = root;
    element && surface.root.contains(element);
    element = element.parentElement
  )
    if (element.hasAttribute("aria-busy")) return true;
  if (
    [
      "data-search-query",
      "data-search-complete",
      "data-result-count",
      "aria-setsize",
    ].some((name) => root.hasAttribute(name))
  )
    return true;
  return actions.some(
    (action) =>
      action.hasAttribute("aria-setsize") ||
      action.hasAttribute("aria-posinset"),
  );
}

export type LocalReadiness = "pending" | "ready";

export function localReadiness(
  root: Element,
  baselineEntry: { readonly items: readonly Element[] } | undefined,
  record: LocalMutationRecord,
  now: number,
): LocalReadiness {
  // A root that did not exist before the search cannot be told apart from stale markup.
  if (!baselineEntry) return "pending";
  const added = record.addedItems(root);
  if (!added.size) return "pending";
  const current = listItems(root);
  if (baselineEntry.items.some((item) => current.includes(item)))
    return "pending";
  if (current.some((item) => !added.has(item))) return "pending";
  const last = record.lastMutationAt(root);
  if (last === undefined || now - last < LOCAL_RESULT_STABLE_MS)
    return "pending";
  return "ready";
}

const ZERO_NOTICE = [
  /^(조회된|검색된)?\s*(검색\s*)?결과가\s*없습니다\.?$/,
  /^no (search )?results( found)?\.?$/i,
];

/** Leaf zero-result notices inside the surface but outside the result root. */
export function zeroNotices(surface: SearchSurface, root: Element): Element[] {
  return elements<Element>(surface.root, "*").filter(
    (element) =>
      !root.contains(element) &&
      !element.contains(root) &&
      element.childElementCount === 0 &&
      ZERO_NOTICE.some((pattern) =>
        pattern.test(normalized(element.textContent ?? "")),
      ),
  );
}

/**
 * Zero-result notice consistency: "incomplete" for a contradiction, "pending"
 * when an empty list has no notice to confirm it, otherwise "consistent".
 */
export function zeroNoticeConsistency(
  surface: SearchSurface,
  root: Element,
  actions: readonly Element[],
): "consistent" | "pending" | "incomplete" {
  const notices = zeroNotices(surface, root);
  if (actions.length > 0)
    return notices.some(shown) ? "incomplete" : "consistent";
  if (!notices.length) return "pending";
  return notices.some(shown) ? "consistent" : "incomplete";
}
