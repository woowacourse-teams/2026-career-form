import type { StagedAddress } from "./staged-address-contract";
import { nativeForm, nativeDocument } from "./native-form-collection";
import { visible } from "./primitives";
export function one(
  root: ParentNode,
  selector: string,
): HTMLElement | undefined {
  const nodes = root.querySelectorAll(selector);
  return nodes.length === 1 && nodes[0] instanceof HTMLElement
    ? nodes[0]
    : undefined;
}
export function stagedAddressPolicy(
  document: Document,
): StagedAddress | undefined {
  const form = nativeForm(document);
  return form?.address?.enabled && nativeDocument(document, form)
    ? form.address
    : undefined;
}
export function stagedAddressNodes(document: Document) {
  const policy = stagedAddressPolicy(document);
  if (!policy) return;
  const form = nativeForm(document)!;
  const root = one(document, form.rootSelector);
  const buttons = Array.from(document.querySelectorAll(policy.triggerSelector));
  if (buttons.length !== 1) return;
  const button = buttons[0];
  const row = button.closest(policy.rowSelector);
  if (
    !(button instanceof HTMLButtonElement) ||
    button.type !== "button" ||
    !visible(button) ||
    button.textContent?.trim() !== policy.triggerLabel ||
    !row ||
    !root?.contains(row)
  )
    return;
  const fields = policy.fields.map((f) =>
    one(document, `input[name="${CSS.escape(f.rawName)}"]`),
  );
  if (
    !fields.every(
      (e, i) =>
        e instanceof HTMLInputElement &&
        e.type === "text" &&
        row.contains(e) &&
        e.closest(policy.rowSelector) === row &&
        e.readOnly === policy.fields[i].readonly &&
        !e.disabled &&
        !e.matches(":disabled") &&
        !e.closest('[inert],[aria-hidden="true"]') &&
        // `hidden` identifies the site's text.hidden companion, not computed CSS.
        // Some live tenants visibly render it; it is still readback-only.
        (policy.fields[i].hidden ? e.classList.contains("hidden") : visible(e)),
    )
  )
    return;
  const postcode = one(row, policy.postcodeSelector);
  if (!postcode) return;
  return {
    policy,
    button,
    row,
    fields: fields as HTMLInputElement[],
    postcode,
  };
}
export function sameAddressNodes(
  a: ReturnType<typeof stagedAddressNodes>,
  b: ReturnType<typeof stagedAddressNodes>,
) {
  return (
    !!a &&
    !!b &&
    a.row === b.row &&
    a.button === b.button &&
    a.postcode === b.postcode &&
    a.fields.every((f, i) => f === b.fields[i])
  );
}
