import type { CandidateRegistry } from "../dom/candidate-registry";

/** Only presentation uses these containers; this never authorizes a write. */
function reviewRoots(element: HTMLElement): HTMLElement[] {
  const etc = element.closest("article#etc.field-form-apply");
  if (etc) {
    // Hyundai puts three unrelated categories in one article. Include every
    // dependent control of the operated family, but not the entire article.
    const families = [
      ["milCd", "milExcptCd", "milRank", "milDitinc", "milStartDt", "milEndDt"],
      ["branchYn", "branchRel", "branchSupplyYn", "branchAddPoint", "branchNo"],
      ["injuryYn", "injuryGrade", "injuryType", "injuryTypeNm", "injuryCont"],
    ];
    const family = families.find((ids) => ids.includes(element.id));
    if (family)
      return [...etc.querySelectorAll<HTMLElement>("[id]")]
        .filter((node) => family.includes(node.id))
        .map((node) => node.closest<HTMLElement>(".field") ?? node)
        .filter(
          (node) =>
            !node.closest("[hidden], [inert]") &&
            node.getBoundingClientRect().height > 0,
        );
  }
  const root = element.closest<HTMLElement>(
    "fieldset, section, [role='group'], .apply-form-box, article.field-form-apply",
  );
  return root ? [root] : [];
}

/** Presents a section without focusing a control or repositioning the results panel. */
export function presentSection(
  document: Document,
  registry: CandidateRegistry,
  ids: readonly string[],
  recorded: readonly HTMLElement[] = [],
  highlighted?: readonly HTMLElement[],
): (() => void) | undefined {
  const view = document.defaultView;
  if (!view) return;
  const candidates = [...new Set(ids)].flatMap((id) => {
    const lookup = registry.lookupField(id);
    if (lookup.status !== "ready" && lookup.status !== "blocked") return [];
    if (
      lookup.status === "blocked" &&
      ["hidden", "inert", "unsupported"].includes(lookup.reason)
    )
      return [];
    return lookup.handle.elements;
  });
  const isVisible = (element: HTMLElement) => {
    if (
      !element?.isConnected ||
      element.ownerDocument !== document ||
      element.getAttribute("type") === "hidden" ||
      element.tagName === "BUTTON" ||
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
  };
  const elements = [...new Set([...candidates, ...recorded])].filter(isVisible);
  if (!elements.length) return;
  const readingBounds = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const labels = [...((element as HTMLInputElement).labels ?? [])]
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
  // Section structure, not the number of successful writes, defines the review boundary.
  const roots = [...new Set(elements.flatMap(reviewRoots))];
  const semanticBounds = () => {
    const rects = roots
      .filter((root) => root.isConnected)
      .map((root) => root.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) return undefined;
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    return new DOMRect(
      left,
      top,
      Math.max(...rects.map((rect) => rect.right)) - left,
      Math.max(...rects.map((rect) => rect.bottom)) - top,
    );
  };
  const bounds = () => {
    const rect =
      semanticBounds() ??
      (container?.isConnected
        ? container.getBoundingClientRect()
        : union(true));
    const side = container ? 20 : 24;
    let top = rect.top - 20;
    let bottom = rect.bottom + 20;
    // Use available whitespace, without drawing across the neighboring section's labels or controls.
    for (const neighbor of neighbors) {
      if (
        !neighbor.isConnected ||
        roots.some((root) => root.contains(neighbor))
      )
        continue;
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
  const targetTop =
    rect.height <= view.innerHeight - 96
      ? (view.innerHeight - rect.height) / 2
      : view.innerHeight * 0.25;
  // Avoid small repeated jumps when the section is already near the reading position.
  const tolerance = Math.min(96, view.innerHeight * 0.1);
  if (Math.abs(rect.top - targetTop) > tolerance) {
    const anchor =
      roots[0] ??
      container ??
      elements[0].closest<HTMLElement>("label") ??
      elements[0];
    const margin = anchor.style.getPropertyValue("scroll-margin-top");
    const priority = anchor.style.getPropertyPriority("scroll-margin-top");
    const offset = anchor.getBoundingClientRect().top - rect.top;
    anchor.style.setProperty(
      "scroll-margin-top",
      `${targetTop + offset}px`,
      "important",
    );
    anchor.scrollIntoView?.({
      block: "start",
      inline: "nearest",
      behavior: "instant",
    });
    if (margin) anchor.style.setProperty("scroll-margin-top", margin, priority);
    else anchor.style.removeProperty("scroll-margin-top");
  }
  const visible = [...elements, ...roots].some((element) => {
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
  const outlined = [...new Set(highlighted ?? elements)].filter(
    (element) =>
      isVisible(element) &&
      ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) &&
      !["radio", "checkbox", "submit", "reset", "image", "file"].includes(
        element.getAttribute("type") ?? "",
      ),
  );
  const overlays = outlined.map((element) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-career-form-section-highlight", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText =
      "all:initial;position:fixed;box-sizing:border-box;pointer-events:none;border:3px solid #a65f2d;border-radius:8px;background:transparent;z-index:2147483000;";
    return { element, overlay };
  });
  const update = () => {
    if (!elements.some((element) => element.isConnected)) {
      clear();
      return;
    }
    for (const { element, overlay } of overlays) {
      const rect = element.getBoundingClientRect();
      const hidden =
        !element.isConnected ||
        !rect.width ||
        !rect.height ||
        !!element.closest("[hidden], [inert]") ||
        view.getComputedStyle(element).visibility === "hidden";
      Object.assign(overlay.style, {
        display: hidden ? "none" : "block",
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
    overlays.forEach(({ overlay }) => overlay.remove());
    document.removeEventListener("scroll", update, true);
    view.removeEventListener("resize", update);
    observer?.disconnect();
  };
  document.body.append(...overlays.map(({ overlay }) => overlay));
  document.addEventListener("scroll", update, true);
  view.addEventListener("resize", update);
  outlined.forEach((element) => observer?.observe(element));
  update();
  return clear;
}
