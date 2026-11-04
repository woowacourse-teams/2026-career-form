import type { CandidateRegistry } from "../dom/candidate-registry";
import { fieldHighlightClip, floatingLabelRects } from "./field-highlight-clip";

/** Elements a presentation may outline for these candidates; never authorizes a write. */
export function candidateElements(
  registry: CandidateRegistry,
  ids: readonly string[],
): HTMLElement[] {
  return [...new Set(ids)].flatMap((id) => {
    const lookup = registry.lookupField(id);
    if (lookup.status !== "ready" && lookup.status !== "blocked") return [];
    if (
      lookup.status === "blocked" &&
      ["hidden", "inert", "unsupported"].includes(lookup.reason)
    )
      return [];
    return [...lookup.handle.elements, ...(lookup.handle.customElements ?? [])];
  });
}

export function isVisibleElement(
  document: Document,
  element: HTMLElement,
  candidates: readonly HTMLElement[],
): boolean {
  const view = document.defaultView;
  if (
    !view ||
    !element?.isConnected ||
    element.ownerDocument !== document ||
    element.getAttribute("type") === "hidden" ||
    (element.tagName === "BUTTON" && !candidates.includes(element)) ||
    (element instanceof HTMLInputElement &&
      element.type === "radio" &&
      !element.checked)
  )
    return false;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const style = view.getComputedStyle(node);
    if (
      node.hidden ||
      node.hasAttribute("inert") ||
      style.display === "none" ||
      style.visibility === "hidden"
    )
      return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** A visible control that can carry a border of its own. */
export function isOutlineTarget(
  document: Document,
  element: HTMLElement,
  candidates: readonly HTMLElement[],
): boolean {
  return (
    isVisibleElement(document, element, candidates) &&
    (["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) ||
      (candidates.includes(element) &&
        (element.tagName === "BUTTON" ||
          element.getAttribute("role") === "radiogroup"))) &&
    !["radio", "checkbox", "submit", "reset", "image", "file"].includes(
      element.getAttribute("type") ?? "",
    )
  );
}

export interface OutlineOptions {
  attribute: string;
  border: string;
  /** The overlays are dropped as soon as this reports false. */
  alive?: () => boolean;
  onClear?: () => void;
}

/**
 * Fixed-position, pointer-transparent borders that follow their elements.
 * The site elements themselves are never modified.
 */
export function drawOutlines(
  document: Document,
  elements: readonly HTMLElement[],
  { attribute, border, alive, onClear }: OutlineOptions,
) {
  const view = document.defaultView!;
  const overlays = new Map<HTMLElement, HTMLElement>(
    elements.map((element) => {
      const overlay = document.createElement("div");
      overlay.setAttribute(attribute, "");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = `all:initial;position:fixed;box-sizing:border-box;pointer-events:none;border:${border};border-radius:8px;background:transparent;z-index:2147483000;`;
      // Some CSS parsers drop the declarations that follow `all:initial`.
      overlay.style.setProperty("pointer-events", "none");
      overlay.style.setProperty("border", border);
      return [element, overlay];
    }),
  );
  const update = () => {
    if (!(alive ?? (() => elements.some((e) => e.isConnected)))()) {
      clear();
      return;
    }
    const labels = floatingLabelRects(document, [...overlays.keys()]);
    for (const [element, overlay] of overlays) {
      const rect = element.getBoundingClientRect();
      const hidden =
        !element.isConnected ||
        !rect.width ||
        !rect.height ||
        !!element.closest("[hidden], [inert]") ||
        view.getComputedStyle(element).visibility === "hidden";
      Object.assign(overlay.style, {
        display: hidden ? "none" : "block",
        clipPath: fieldHighlightClip(rect, labels),
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }
  };
  const observer =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(update);
  const clear = () => {
    overlays.forEach((overlay) => overlay.remove());
    overlays.clear();
    document.removeEventListener("scroll", update, true);
    view.removeEventListener("resize", update);
    observer?.disconnect();
    onClear?.();
  };
  const remove = (element: HTMLElement) => {
    overlays.get(element)?.remove();
    overlays.delete(element);
    observer?.unobserve(element);
  };
  document.body.append(...overlays.values());
  document.addEventListener("scroll", update, true);
  view.addEventListener("resize", update);
  overlays.forEach((_, element) => observer?.observe(element));
  update();
  return { remove, clear };
}
