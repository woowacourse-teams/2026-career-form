/**
 * Hplace v1 site dialogs (CF-505): `#overlay-root [role="dialog"]` shells
 * with an `h2#modal-title` title, 취소 and a primary button that carries a
 * `mainbrandcolor` attribute. Only stable anchors, never emotion classes.
 */
export const v1Text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/\s+/g, " ").trim() ?? "";

export function v1Dialogs(document: Document): HTMLElement[] {
  const root = document.getElementById("overlay-root");
  return root
    ? Array.from(root.querySelectorAll<HTMLElement>('[role="dialog"]'))
    : [];
}

/** The only open dialog, when its title is exactly `title`. */
export function titledDialog(
  document: Document,
  title: string,
): HTMLElement | undefined {
  const dialogs = v1Dialogs(document);
  const titles = dialogs[0]?.querySelectorAll("h2#modal-title");
  return dialogs.length === 1 &&
    titles?.length === 1 &&
    v1Text(titles[0]) === title
    ? dialogs[0]
    : undefined;
}

/** The dialog's one enabled `button[type=button]` labelled exactly `label`. */
export function dialogButton(
  dialog: Element,
  label: string,
  primary = false,
): HTMLButtonElement | undefined {
  const buttons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('button[type="button"]'),
  ).filter((b) => v1Text(b) === label);
  return buttons.length === 1 &&
    !buttons[0].disabled &&
    (!primary || buttons[0].hasAttribute("mainbrandcolor"))
    ? buttons[0]
    : undefined;
}
