import { cachedDomRead, hasDomReadPass } from "./read-pass";
/**
 * Ids are relation evidence only when they identify exactly one element.
 * Sites that render placeholder ids such as "NaN" for every repeated row, or
 * reuse one id across branches, must not link labels or surfaces by id.
 */
const PLACEHOLDER_ID = /^(nan|undefined|null)$/i;

export function isTrustedId(root: Document | ShadowRoot, id: string): boolean {
  if (!id || PLACEHOLDER_ID.test(id)) return false;
  if (!hasDomReadPass()) {
    const quoted = id.replace(/["\\]/g, "\\$&");
    return root.querySelectorAll(`[id="${quoted}"]`).length === 1;
  }
  const counts = cachedDomRead(root, "trusted-id-counts", () => {
    const result = new Map<string, number>();
    for (const element of root.querySelectorAll("[id]"))
      result.set(element.id, (result.get(element.id) ?? 0) + 1);
    return result;
  });
  return counts.get(id) === 1;
}

type LabelledControl =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Labels that wrap the control or point at it through a trusted id. */
export function trustedLabels(control: LabelledControl): HTMLLabelElement[] {
  const root = control.getRootNode() as Document | ShadowRoot;
  const idTrusted = isTrustedId(root, control.id);
  return Array.from(control.labels ?? []).filter(
    (label) =>
      label.contains(control) || (idTrusted && label.htmlFor === control.id),
  );
}
