function isVisible(element: Element, view: Window): boolean {
  const HTMLElementConstructor = (view as unknown as {
    HTMLElement: typeof HTMLElement;
  }).HTMLElement;
  if (!(element instanceof HTMLElementConstructor)) return false;
  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = view.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function hasStructuralName(field: Element, expected: string): boolean {
  const name = field.getAttribute("name") ?? "";
  return name === expected || new RegExp(`^${expected}_[0-9a-f-]{36}$`, "i").test(name);
}

export function waitForExpectedFields(
  pageDocument: Document,
  expectedFieldNames: readonly string[],
  timeoutMilliseconds = 1_000,
): Promise<boolean> {
  const view = pageDocument.defaultView;
  if (!view || expectedFieldNames.length === 0) return Promise.resolve(false);

  const allVisible = () =>
    expectedFieldNames.every((name) =>
      Array.from(pageDocument.querySelectorAll("[name]")).some((field) =>
        hasStructuralName(field, name) && isVisible(field, view),
      ),
    );

  if (allVisible()) return Promise.resolve(true);
  if (timeoutMilliseconds === 0) return Promise.resolve(false);

  return new Promise((resolve) => {
    const observer = new view.MutationObserver(() => {
      if (!allVisible()) return;
      observer.disconnect();
      view.clearTimeout(timeout);
      resolve(true);
    });
    const timeout = view.setTimeout(() => {
      observer.disconnect();
      // Some company forms complete their DOM update without an observable
      // mutation. Give that update one bounded settling turn, then verify the
      // same policy-supplied fields instead of treating time as success.
      view.setTimeout(() => resolve(allVisible()), 1_000);
    }, timeoutMilliseconds);
    observer.observe(pageDocument.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "style", "class", "aria-hidden", "name"],
    });
  });
}
