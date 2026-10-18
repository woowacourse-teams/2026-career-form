import type { NativeSection } from "./native-form-contract";
import {
  nativeControlValue,
  nativeRowControls,
  nativeRowBlank,
} from "./native-form-row-state";

/** Children are prospective profile slots only in a parent assigned by this run.
 * A checked role is never interpreted as permission to adopt an existing row. */
export function nativeNestedRows(
  parent: Element,
  section: NativeSection,
  index: number,
): Element[] | undefined {
  const n = section.nested;
  if (!n || !section.rows) return;
  const wrappers = parent.querySelectorAll(n.wrapperSelector);
  if (wrappers.length !== 1) return;
  const rows = Array.from(wrappers[0].querySelectorAll(n.rowSelector));
  if (
    !rows.length ||
    rows.length > n.maxCount ||
    parent.querySelectorAll(`[data-loop="${n.namePrefix}"]`).length !==
      rows.length
  )
    return;
  const prefix = `${section.rows.namePrefix}[${index}]`;
  for (const [j, row] of rows.entries()) {
    const controls = nativeRowControls(row);
    if (
      !controls.length ||
      controls.some(
        (e) => e.name && !e.name.startsWith(`${prefix}.${n.namePrefix}[${j}].`),
      ) ||
      Array.from(row.querySelectorAll("[data-rel-target]")).some(
        (e) =>
          ![prefix, `${prefix}.${n.namePrefix}[${j}]`].includes(
            e.getAttribute("data-rel-target")!,
          ),
      )
    )
      return;
  }
  return rows;
}
const guards = new WeakMap<
  Element,
  {
    parents: Element[];
    children: Element[];
    siblings: Element[][];
    values: Map<Element, string>;
    parent: Element;
    section: NativeSection;
    index: number;
  }
>();
export function captureNativeNestedRows(
  root: Element,
  parents: Element[],
  parent: Element,
  section: NativeSection,
  index: number,
) {
  const children = nativeNestedRows(parent, section, index);
  if (!children) return false;
  guards.set(parent, {
    parents: [...parents],
    children: [...children],
    siblings: parents.map((p, i) => nativeNestedRows(p, section, i) ?? []),
    parent,
    section,
    index,
    values: new Map(
      parents.flatMap((p) =>
        nativeRowControls(p).map((e) => [e, nativeControlValue(e)] as const),
      ),
    ),
  });
  return true;
}
export function nativeNestedPreparationCurrent(
  parent: Element,
  parents: Element[],
): boolean {
  const g = guards.get(parent);
  if (!g) return false;
  const children = nativeNestedRows(parent, g.section, g.index);
  if (
    !children ||
    parents.length !== g.parents.length ||
    parents.some((p, i) => p !== g.parents[i]) ||
    g.children.some((r, i) => children[i] !== r) ||
    [...g.values].some(
      ([e, v]) =>
        !e.isConnected ||
        !g.parents.some((p) => p.contains(e)) ||
        nativeControlValue(e as HTMLInputElement) !== v,
    )
  )
    return false;
  const added: Element[] = [];
  for (const [index, p] of parents.entries()) {
    const current = nativeNestedRows(p, g.section, index),
      before = g.siblings[index];
    if (!current || before.some((child, j) => current[j] !== child))
      return false;
    added.push(...current.slice(before.length));
  }
  return (
    added.every(nativeRowBlank) &&
    parents
      .flatMap(nativeRowControls)
      .every((e) => g.values.has(e) || added.some((r) => r.contains(e)))
  );
}
export function nativeNestedState(
  parent: Element,
  parents: Element[],
  section: NativeSection,
  index: number,
): string[] | undefined {
  const children = nativeNestedRows(parent, section, index);
  if (!children) return;
  const values = (root: Element, exclude: Element[] = []) =>
    nativeRowControls(root)
      .filter((e) => !exclude.some((r) => r.contains(e)))
      .map((e) => [
        e.tagName,
        e.name,
        e.value,
        e instanceof HTMLInputElement ? e.checked : null,
      ]);
  const outside = parents.map((p) => values(p, p === parent ? children : []));
  return children.map((child) => JSON.stringify([outside, values(child)]));
}
