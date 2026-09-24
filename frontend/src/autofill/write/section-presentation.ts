import type { CandidateRegistry } from "../dom/candidate-registry";

/** Presents a section without focusing a control or repositioning the results panel. */
export function presentSection(
  document: Document,
  registry: CandidateRegistry,
  ids: readonly string[],
): (() => void) | undefined {
  const view = document.defaultView;
  if (!view) return;
  const elements = [...new Set(ids)].flatMap((id) => {
    const lookup = registry.lookupField(id);
    if (lookup.status !== "ready" && lookup.status !== "blocked") return [];
    if (
      lookup.status === "blocked" &&
      ["hidden", "inert", "unsupported"].includes(lookup.reason)
    )
      return [];
    const element = lookup.handle.elements[0];
    if (
      !element?.isConnected ||
      element.ownerDocument !== document ||
      element.type === "hidden"
    )
      return [];
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
        return [];
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? [element] : [];
  });
  if (!elements.length) return;
  const readingBounds = (
    element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  ) => {
    const rect = element.getBoundingClientRect();
    const labels = [...(element.labels ?? [])]
      .map((label) => label.getBoundingClientRect())
      .filter(
        (label) =>
          label.width > 0 &&
          label.height > 0 &&
          Math.abs(label.top - rect.top) < 100,
      );
    const left = Math.min(rect.left, ...labels.map((label) => label.left));
    const top = Math.min(rect.top, ...labels.map((label) => label.top));
    return new DOMRect(
      left,
      top,
      Math.max(rect.right, ...labels.map((label) => label.right)) - left,
      Math.max(rect.bottom, ...labels.map((label) => label.bottom)) - top,
    );
  };
  const union = (withLabels = false) => {
    const rects = elements
      .filter((element) => element.isConnected)
      .map((element) =>
        withLabels ? readingBounds(element) : element.getBoundingClientRect(),
      );
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    return new DOMRect(
      left,
      top,
      Math.max(...rects.map((rect) => rect.right)) - left,
      Math.max(...rects.map((rect) => rect.bottom)) - top,
    );
  };
  const neighbors = [
    ...document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input,select,textarea"),
  ].filter((element) => !elements.includes(element));
  let common: HTMLElement | null = elements[0].parentElement;
  while (common && !elements.every((element) => common!.contains(element)))
    common = common.parentElement;
  // A form/body shared with other categories is not a meaningful section.
  const fields = union();
  const containerBounds = common?.getBoundingClientRect();
  const container =
    common &&
    !["BODY", "HTML", "FORM"].includes(common.tagName) &&
    containerBounds &&
    containerBounds.height >= fields.height &&
    containerBounds.height <= fields.height + 200 &&
    containerBounds.width >= fields.width &&
    containerBounds.width <= fields.width + 240
      ? common
      : undefined;
  const bounds = () => {
    const rect = container?.isConnected
      ? container.getBoundingClientRect()
      : union(true);
    const side = container ? 20 : 24;
    let top = rect.top - 20;
    let bottom = rect.bottom + 20;
    // Use available whitespace, without drawing across the neighboring section's labels or controls.
    for (const neighbor of neighbors) {
      if (!neighbor.isConnected) continue;
      const control = neighbor.getBoundingClientRect();
      if (!control.width || !control.height) continue;
      const other = readingBounds(neighbor);
      if (other.right <= rect.left || other.left >= rect.right) continue;
      if (other.bottom <= rect.top)
        top = Math.max(top, (other.bottom + rect.top) / 2);
      if (other.top >= rect.bottom)
        bottom = Math.min(bottom, (other.top + rect.bottom) / 2);
    }
    const left = Math.max(4, rect.left - side);
    const right = Math.min(view.innerWidth - 4, rect.right + side);
    return new DOMRect(left, top, Math.max(0, right - left), bottom - top);
  };
  const rect = bounds();
  const available = view.innerHeight - 104;
  if (
    rect.top < 80 ||
    rect.top >= view.innerHeight - 80 ||
    (rect.height <= available && rect.bottom > view.innerHeight - 24)
  ) {
    const anchor =
      container ?? elements[0].closest<HTMLElement>("label") ?? elements[0];
    const margin = anchor.style.getPropertyValue("scroll-margin-top");
    const priority = anchor.style.getPropertyPriority("scroll-margin-top");
    anchor.style.setProperty("scroll-margin-top", "96px", "important");
    anchor.scrollIntoView?.({
      block: "start",
      inline: "nearest",
      behavior: "instant",
    });
    if (margin) anchor.style.setProperty("scroll-margin-top", margin, priority);
    else anchor.style.removeProperty("scroll-margin-top");
  }
  const visible = elements.some((element) => {
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left),
      right = Math.min(view.innerWidth, rect.right);
    const top = Math.max(0, rect.top),
      bottom = Math.min(view.innerHeight, rect.bottom);
    if (right <= left || bottom <= top) return false;
    if (!document.elementFromPoint) return true;
    return [0.1, 0.5, 0.9].some((fraction) => {
      const hit = document.elementFromPoint(
        left + (right - left) * fraction,
        (top + bottom) / 2,
      );
      return hit === element || (!!hit && element.contains(hit));
    });
  });
  if (!visible) return;
  const overlay = document.createElement("div");
  overlay.setAttribute("data-career-form-section-highlight", "");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText =
    "all:initial;position:fixed;box-sizing:border-box;pointer-events:none;border:1px solid #b77b50;border-radius:14px;background:transparent;z-index:2147483000;";
  const update = () => {
    if (!elements.some((element) => element.isConnected)) {
      clear();
      return;
    }
    const rect = bounds();
    Object.assign(overlay.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  };
  const observer =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(update);
  const clear = () => {
    overlay.remove();
    document.removeEventListener("scroll", update, true);
    view.removeEventListener("resize", update);
    observer?.disconnect();
  };
  document.body.append(overlay);
  document.addEventListener("scroll", update, true);
  view.addEventListener("resize", update);
  if (container) observer?.observe(container);
  else elements.forEach((element) => observer?.observe(element));
  update();
  return clear;
}
