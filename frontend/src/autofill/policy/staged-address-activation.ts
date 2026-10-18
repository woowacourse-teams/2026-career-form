/** The async address owner revalidates profile approval before EACH synthetic event. */
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
  const events = primaryActivationEvents(node);
  if (!events) return false;
  for (const dispatch of events)
    if (!(await current()) || !dispatch()) return false;
  activated();
  return true;
}
function primaryActivationEvents(
  node: HTMLButtonElement,
): (() => boolean)[] | undefined {
  const rect = node.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2,
    clientY = rect.top + rect.height / 2;
  if (
    !(rect.width > 0 && rect.height > 0) ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY)
  )
    return;
  return ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].map(
    (type) => () => {
      if (
        !node.isConnected ||
        node.type !== "button" ||
        node.matches(":disabled") ||
        node.closest('[hidden],[inert],[aria-hidden="true"]')
      )
        return false;
      const now = node.getBoundingClientRect();
      if (
        now.left !== rect.left ||
        now.top !== rect.top ||
        now.width !== rect.width ||
        now.height !== rect.height
      )
        return false;
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: type.endsWith("down") ? 1 : 0,
        clientX,
        clientY,
        detail: 1,
      };
      node.dispatchEvent(
        type.startsWith("pointer")
          ? new PointerEvent(type, {
              ...init,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
            })
          : new MouseEvent(type, init),
      );
      return true;
    },
  );
}
