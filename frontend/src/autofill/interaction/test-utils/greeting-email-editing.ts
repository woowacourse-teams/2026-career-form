/** jsdom has no editing command implementation. Model only the reviewed browser
 * boundary: insertText on the focused, empty email input emits one input event.
 * Real browser trust/React acceptance is verified separately by the live smoke. */
export function mockGreetingEditingCommand(doc: Document): () => void {
  const original = Object.getOwnPropertyDescriptor(doc, "execCommand");
  Object.defineProperty(doc, "execCommand", {
    configurable: true,
    writable: true,
    value(command: string, showUi: boolean, value: string): boolean {
      const input = doc.activeElement;
      if (
        command !== "insertText" ||
        showUi !== false ||
        typeof value !== "string" ||
        !(input instanceof HTMLInputElement) ||
        input.value !== ""
      )
        return false;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: value,
        }),
      );
      return true;
    },
  });
  return () => {
    if (original) Object.defineProperty(doc, "execCommand", original);
    else Reflect.deleteProperty(doc, "execCommand");
  };
}
