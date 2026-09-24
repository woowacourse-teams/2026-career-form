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
  const union = () => {
    const rects = elements
      .filter((element) => element.isConnected)
      .map((element) => element.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    return new DOMRect(
      left,
      top,
      Math.max(...rects.map((rect) => rect.right)) - left,
      Math.max(...rects.map((rect) => rect.bottom)) - top,
    );
  };
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
  const bounds = () =>
    container?.getBoundingClientRect() ??
    (() => {
      const rect = union();
      return new DOMRect(
        rect.left - 8,
        rect.top - 20,
        rect.width + 16,
        rect.height + 26,
      );
    })();
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
    "all:initial;position:fixed;box-sizing:border-box;pointer-events:none;border:2px solid #a65f2d;border-radius:10px;background:transparent;z-index:2147483000;";
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
