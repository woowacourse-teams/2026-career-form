import type { NativeOwnership } from "./native-form-collection";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const writes = new WeakMap<
  Element,
  { digest: string; url: string; values: Map<Control, string> }
>();
export function nativeRowControls(row: Element): Control[] {
  return Array.from(
    row.querySelectorAll<Control>("input,select,textarea"),
  ).filter(
    (e) =>
      !(
        e instanceof HTMLInputElement &&
        ["button", "submit", "reset"].includes(e.type)
      ),
  );
}
export function nativeControlValue(e: Control): string {
  return e instanceof HTMLInputElement && ["radio", "checkbox"].includes(e.type)
    ? e.checked
      ? e.value
      : ""
    : e.value;
}
export function nativeRowBlank(row: Element): boolean {
  return nativeRowControls(row).every((e) => nativeControlValue(e) === "");
}
export function nativeRowWritable(
  o: NativeOwnership,
  changing: Element[] = [],
): boolean {
  if (!o.section.rows && !o.section.singleEntity) return true;
  const receipt = writes.get(o.row);
  if (receipt && (receipt.url !== o.url || receipt.digest !== o.digest))
    return false;
  const ignored = new Set(changing);
  if (
    receipt &&
    [...receipt.values].some(
      ([e, value]) =>
        !ignored.has(e) &&
        (!e.isConnected ||
          !o.row.contains(e) ||
          nativeControlValue(e) !== value),
    )
  )
    return false;
  return nativeRowControls(o.row).every(
    (e) =>
      ignored.has(e) ||
      nativeControlValue(e) === "" ||
      receipt?.values.get(e) === nativeControlValue(e),
  );
}
/** Called only for controls whose planned value was just set or tuple-verified. */
export function recordNativeRowWrite(
  o: NativeOwnership,
  elements: Element[],
): void {
  if (!o.section.rows && !o.section.singleEntity) return;
  let receipt = writes.get(o.row);
  if (!receipt) {
    receipt = { url: o.url, digest: o.digest, values: new Map() };
    writes.set(o.row, receipt);
  }
  for (const e of elements)
    if (
      e instanceof HTMLInputElement ||
      e instanceof HTMLSelectElement ||
      e instanceof HTMLTextAreaElement
    )
      receipt.values.set(e, nativeControlValue(e));
}
export function nativeRowHasWrites(o: NativeOwnership): boolean {
  return !!writes.get(o.row)?.values.size && nativeRowWritable(o);
}

const preparationGuards = new WeakMap<
  Element,
  { rows: Element[]; values: Map<Control, string>[] }
>();
export function captureNativePreparationRows(
  root: Element,
  rows: Element[],
): void {
  preparationGuards.set(root, {
    rows: [...rows],
    values: rows.map(
      (row) =>
        new Map(nativeRowControls(row).map((e) => [e, nativeControlValue(e)])),
    ),
  });
}
export function nativePreparationRowsCurrent(
  root: Element,
  rows: Element[],
): boolean {
  const guard = preparationGuards.get(root);
  if (!guard) return true;
  return (
    guard.rows.every(
      (row, index) =>
        rows[index] === row &&
        nativeRowControls(row).length === guard.values[index].size &&
        nativeRowControls(row).every(
          (e) => guard.values[index].get(e) === nativeControlValue(e),
        ),
    ) && rows.slice(guard.rows.length).every(nativeRowBlank)
  );
}
