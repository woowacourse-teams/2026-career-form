/**
 * Ids are relation evidence only when they identify exactly one element.
 * Sites that render placeholder ids such as "NaN" for every repeated row, or
 * reuse one id across branches, must not link labels or surfaces by id.
 */
const PLACEHOLDER_ID = /^(nan|undefined|null)$/i;

export function isTrustedId(root: Document | ShadowRoot, id: string): boolean {
  if (!id || PLACEHOLDER_ID.test(id)) return false;
  // Attribute selector values only need quotes and backslashes escaped.
  const quoted = id.replace(/["\\]/g, "\\$&");
  return root.querySelectorAll(`[id="${quoted}"]`).length === 1;
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
