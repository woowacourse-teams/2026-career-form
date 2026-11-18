import type { SearchSurface } from "./search-surface";
import { normalized } from "./readonly-search";
import { elements, shown } from "./search-surface-dom";

/**
 * The page replaced the query input with the searched text: the input is gone
 * and exactly one visible element beside it holds the query as its own text.
 * Unlike `observeQueryCommit`, no reset control is required.
 */
export function observeQueryReflection(
  surface: SearchSurface,
  query: HTMLInputElement,
  expected: string,
): () => boolean {
  const parent = query.parentElement;
  const eligible =
    surface.kind === "same-document-layer" &&
    parent !== null &&
    surface.root.contains(parent) &&
    shown(query);
  return () => {
    if (
      !eligible ||
      !parent?.isConnected ||
      query.isConnected ||
      !surface.root.contains(parent) ||
      !shown(parent) ||
      parent.querySelector("input,textarea,select,[contenteditable='true']")
    )
      return false;
    return (
      elements<HTMLElement>(parent, "*").filter(
        (element) =>
          shown(element) &&
          normalized(
            Array.from(element.childNodes)
              .filter((node) => node.nodeType === 3)
              .map((node) => node.textContent ?? "")
              .join(""),
          ) === normalized(expected),
      ).length === 1
    );
  };
}

export function observeQueryCommit(
  surface: SearchSurface,
  query: HTMLInputElement,
  expected: string,
): () => boolean {
  const parent = query.parentElement;
  const eligible =
    surface.kind === "same-document-layer" &&
    parent !== null &&
    surface.root.contains(parent) &&
    shown(query);
  return () => {
    if (
      !eligible ||
      !parent?.isConnected ||
      query.isConnected ||
      !surface.root.contains(parent) ||
      !shown(parent) ||
      parent.querySelector("input,textarea,select,[contenteditable='true']")
    )
      return false;
    const resets = elements<HTMLButtonElement>(parent, "button[type='reset']");
    if (resets.length !== 1 || !shown(resets[0]!)) return false;
    // A committed query chip replaces the original input and owns its reset
    // action. A matching result label elsewhere is not query evidence.
    const chips = elements<HTMLElement>(parent, "span,div,p").filter(
      (element) =>
        shown(element) &&
        element.contains(resets[0]!) &&
        normalized(
          Array.from(element.childNodes)
            .filter((node) => node.nodeType === 3)
            .map((node) => node.textContent ?? "")
            .join(""),
        ) === normalized(expected),
    );
    return chips.length === 1;
  };
}
