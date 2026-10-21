/** Revalidate approval before each optional pointer event and the site-owned click. */
export async function activateOwnedPrimary(
  node: HTMLButtonElement,
  current: () => Promise<boolean>,
  activated: () => void = () => {},
): Promise<boolean> {
  if (
    !node.matches('button[data-button="modalSubmit"]') ||
    !node.closest("#modal.modal-bg > .modal")
  )
    return false;
  const view = node.ownerDocument.defaultView!;
  const rect = node.getBoundingClientRect();
  // The site's jQuery handler only needs HTMLElement.click(). Geometry and
  // PointerEvent availability are not prerequisites for that owned activation.
  if (
    typeof view.PointerEvent === "function" &&
    rect.width > 0 &&
    rect.height > 0
  ) {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      if (!(await current()) || !ready()) return false;
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: type.endsWith("down") ? 1 : 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        detail: 1,
      };
      node.dispatchEvent(
        type.startsWith("pointer")
          ? new view.PointerEvent(type, {
              ...init,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
            })
          : new view.MouseEvent(type, init),
      );
    }
  }
  if (!(await current()) || !ready()) return false;
  node.click();
  activated();
  return true;
  function ready() {
    return (
      node.isConnected &&
      node.type === "button" &&
      !node.matches(":disabled") &&
      !node.closest('[hidden],[inert],[aria-hidden="true"]')
    );
  }
}
