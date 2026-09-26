import { genericFormGroupFor, genericFormGroups } from "./generic-form-groups";

const MARKERS = "[data-repeatable-group], [data-repeater-item]";
const CONTROLS =
  "input:not([type='hidden']):not([type='button']), select, textarea";

function shape(element: Element): string {
  const controls = Array.from(
    element.querySelectorAll<HTMLInputElement>(CONTROLS),
  );
  if (controls.length < 2) return "";
  return controls
    .map((control) =>
      [
        control.tagName,
        control.type,
        control.name.replace(/\d+/g, "#"),
        control.labels?.[0]?.textContent?.trim() ??
          control.getAttribute("aria-label") ??
          "",
      ].join(":"),
    )
    .join("|");
}

export function isGenericRepeatableRow(element: Element): boolean {
  if (element.closest("template, [data-template]")) return false;
  if (element.matches(MARKERS)) return true;
  const names = [element.id, ...element.classList];
  if (
    names.some(
      (name) =>
        /(?:^|[-_])item$/i.test(name) &&
        !/^(?:form|input|field|select)-item$/i.test(name),
    ) &&
    shape(element)
  )
    return true;
  if (
    !element.matches("fieldset, [role='group']") ||
    !element.parentElement?.closest("section, fieldset, [role='group']")
  )
    return false;
  const signature = shape(element);
  const label =
    element.querySelector(":scope > legend")?.textContent ??
    element.getAttribute("aria-label");
  if (!signature || !label) return false;
  return Array.from(element.parentElement.children).some(
    (peer) =>
      peer !== element &&
      peer.tagName === element.tagName &&
      shape(peer) === signature &&
      (peer.querySelector(":scope > legend")?.textContent ??
        peer.getAttribute("aria-label")) === label,
  );
}

export function genericRowFor(element: Element): Element | undefined {
  const grouped = genericFormGroupFor(element)?.rows.find(
    (row) => row === element || row.contains(element),
  );
  if (grouped) return grouped;
  let ancestor = element.parentElement;
  while (ancestor && !ancestor.matches("form, body")) {
    if (isGenericRepeatableRow(ancestor)) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return undefined;
}

export function genericRows(container: Element): Element[] {
  const candidates = Array.from(
    container.querySelectorAll(
      `${MARKERS}, [class], [id], fieldset, [role='group']`,
    ),
  ).filter(isGenericRepeatableRow);
  const groupedRows = genericFormGroups(container.ownerDocument)
    .filter(
      (group) => group.area === container || container.contains(group.area),
    )
    .flatMap((group) => group.rows);
  return [...new Set([...candidates, ...groupedRows])].filter(
    (row, _, rows) =>
      !rows.some((parent) => parent !== row && parent.contains(row)),
  );
}
