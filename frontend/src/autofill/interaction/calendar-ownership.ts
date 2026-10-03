/** A competing or unresolved explicit link disqualifies inferred ownership. */
export function hasCalendarOwnershipConflict(
  target: HTMLInputElement,
  opener: HTMLElement,
  popup: HTMLElement,
): boolean {
  const controls = new Set<HTMLElement>([target, opener]);
  if (target.id) {
    target.ownerDocument
      .querySelectorAll<HTMLElement>("[aria-labelledby][aria-controls]")
      .forEach((control) => {
        if (
          (control.getAttribute("aria-labelledby") ?? "")
            .split(/\s+/)
            .includes(target.id)
        )
          controls.add(control);
      });
  }
  return Array.from(controls).some((control) =>
    (control.getAttribute("aria-controls") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .some((id) => target.ownerDocument.getElementById(id) !== popup),
  );
}
