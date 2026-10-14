import { localWorkflowLog } from "../debug/local-workflow";

const normalize = (value: string) =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim();

function visible(element: HTMLElement): boolean {
  if (
    !element.isConnected ||
    element.matches(":disabled, [aria-disabled='true']")
  )
    return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const style = view.getComputedStyle(node);
    if (
      node.hidden ||
      node.matches("[inert], [aria-hidden='true']") ||
      style.display === "none" ||
      style.visibility === "hidden"
    )
      return false;
  }
  return true;
}

/** Only inspect the current input's owned, completed search surface. */
export function findDirectInputAction(
  root: HTMLElement,
  query: string,
): HTMLElement | undefined {
  const value = normalize(query);
  if (!value || !visible(root)) return undefined;
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, a, [role='button'], [role='option']",
    ),
  ).filter((element) => {
    if (!visible(element)) return false;
    if (
      element.tagName === "BUTTON" &&
      (element as HTMLButtonElement).type === "submit"
    )
      return false;
    if (element.tagName === "A") {
      const href = element.getAttribute("href")?.trim() ?? "";
      if (href && href !== "#" && !/^javascript:void\(0\);?$/i.test(href))
        return false;
    }
    const text = normalize(
      element.textContent ?? element.getAttribute("aria-label") ?? "",
    );
    const directLabel =
      /^(직접\s*입력(?:하기)?|입력한\s*(?:값|내용)\s*사용(?:하기)?)$/.test(
        text,
      );
    const usesQuery = [
      value + " 사용하기",
      value + " 사용",
      value + "으로 입력",
      value + "로 입력",
    ].includes(text);
    const context = normalize(element.parentElement?.textContent ?? "");
    // A generic direct-input label must be accompanied by the current query.
    return usesQuery || (directLabel && context.includes(value));
  });
  const leaves = candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) => other !== candidate && candidate.contains(other),
      ),
  );
  return leaves.length === 1 ? leaves[0] : undefined;
}

export async function selectDirectInput(options: {
  root: HTMLElement;
  input: HTMLInputElement;
  query: string;
  isCurrent(): boolean;
  isConfirmed(): boolean;
}): Promise<boolean> {
  const { root, input, query, isCurrent, isConfirmed } = options;
  if (!isCurrent() || input.value !== query || input.disabled || input.readOnly)
    return false;
  const action = findDirectInputAction(root, query);
  if (!action) return false;
  input.focus();
  if (
    !isCurrent() ||
    input.value !== query ||
    findDirectInputAction(root, query) !== action
  )
    return false;
  action.click();
  input.blur();
  const view = input.ownerDocument.defaultView;
  if (!view) return false;
  const started = Date.now();
  do {
    if (!isCurrent() || !input.isConnected || input.value !== query)
      return false;
    if (isConfirmed()) {
      localWorkflowLog("search-direct-input-confirmed", {
        fieldName: input.name,
      });
      return true;
    }
    await new Promise<void>((resolve) => view.setTimeout(resolve, 25));
  } while (Date.now() - started < 500);
  localWorkflowLog("search-direct-input-unconfirmed", {
    fieldName: input.name,
  });
  return false;
}
