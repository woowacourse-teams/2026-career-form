import type { NativeField } from "./native-form-contract";

/** Reads the same computed pseudo content in browsers and injected test readers. */
export function nativeUnitMatches(
  element: Element,
  row: Element,
  unit: NativeField["unit"],
  read: (element: Element, pseudo: "::after") => string = (owner, pseudo) =>
    owner.ownerDocument.defaultView!.getComputedStyle(owner, pseudo).content,
): boolean {
  if (!unit) return true;
  const parent = element.parentElement;
  if (!parent || !row.contains(parent) || !parent.matches(unit.parentSelector))
    return false;
  try {
    return read(parent, unit.pseudo) === unit.content;
  } catch {
    return false;
  }
}
