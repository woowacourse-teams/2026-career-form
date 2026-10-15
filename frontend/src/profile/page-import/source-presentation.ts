import { FIELD_HIGHLIGHT } from "../../autofill/write/field-highlight-style";
import { resolveImportSourceControls } from "./reader";

/** Presentation only: never focuses, clicks or writes to a source form control. */
export function presentImportSources(
  document: Document,
  sources: readonly string[],
): () => void {
  const view = document.defaultView;
  if (!view) return () => {};
  const isVisible = (element: HTMLElement) => {
    if (!element.isConnected || element.getAttribute("type") === "hidden")
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
        node.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        ["hidden", "collapse"].includes(style.visibility)
      )
        return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const elements = resolveImportSourceControls(document, sources).filter(
    isVisible,
  );
  if (!elements.length) return () => {};
  elements[0].scrollIntoView?.({
    block: "center",
    inline: "nearest",
    behavior: "instant",
  });
  const overlays = elements.map((element) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-career-form-import-highlight", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText = `all:initial;position:fixed;box-sizing:border-box;pointer-events:none;border:${FIELD_HIGHLIGHT.border};border-radius:6px;background:transparent;z-index:2147483000;`;
    overlay.style.setProperty("pointer-events", "none", "important");
    return { element, overlay };
  });
  let cleared = false;
  const update = () => {
    if (cleared) return;
    for (const { element, overlay } of overlays) {
      if (!isVisible(element)) {
        overlay.remove();
        continue;
      }
      const rect = element.getBoundingClientRect();
      Object.assign(overlay.style, {
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
  document.body.append(...overlays.map(({ overlay }) => overlay));
  document.addEventListener("scroll", update, true);
  view.addEventListener("resize", update);
  elements.forEach((element) => observer?.observe(element));
  update();
  return () => {
    cleared = true;
    overlays.forEach(({ overlay }) => overlay.remove());
    document.removeEventListener("scroll", update, true);
    view.removeEventListener("resize", update);
    observer?.disconnect();
  };
}
