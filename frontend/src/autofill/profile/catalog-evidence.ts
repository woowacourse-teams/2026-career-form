import type { CatalogEvidence } from "./catalog-match";

function visible(element: Element, root: Element): boolean {
  if (!element.isConnected || !root.contains(element)) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const style = view.getComputedStyle(current);
    if (
      current.matches("[hidden], [inert], [aria-hidden='true']") ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    )
      return false;
  }
  return true;
}

/** A visible description must be explicitly and exclusively owned by this option. */
export function catalogEvidenceForElement(
  option: HTMLElement,
  root: Element,
  label = option.textContent?.trim() ?? "",
): CatalogEvidence {
  const references =
    option.getAttribute("aria-describedby")?.trim().split(/\s+/) ?? [];
  if (references.length !== 1 || !references[0] || !visible(option, root))
    return { label };
  const nodes = [
    ...option.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
  ].filter((node) => node.id === references[0]);
  const description = nodes[0];
  if (nodes.length !== 1 || !description || !visible(description, root))
    return { label };
  const owners = [
    ...root.querySelectorAll<HTMLElement>("[aria-describedby]"),
  ].filter((node) =>
    node
      .getAttribute("aria-describedby")
      ?.trim()
      .split(/\s+/)
      .includes(references[0]),
  );
  if (owners.length !== 1 || owners[0] !== option) return { label };
  const walker = option.ownerDocument.createTreeWalker(description, 4);
  const words: string[] = [];
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (text.parentElement && visible(text.parentElement, root))
      words.push(text.textContent ?? "");
  }
  const detail = words.join(" ").trim();
  if (!detail) return { label };
  if (option.contains(description)) {
    const copy = option.cloneNode(true);
    const ElementType = option.ownerDocument.defaultView?.HTMLElement;
    if (ElementType && copy instanceof ElementType) {
      [...copy.querySelectorAll("[id]")]
        .find((node) => node.id === description.id)
        ?.remove();
      return { label: copy.textContent?.trim() ?? "", detail };
    }
  }
  return { label, detail };
}
