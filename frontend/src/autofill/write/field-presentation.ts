import type { CandidateRegistry } from "../dom/candidate-registry";
export function createFieldPresentation(document: Document) {
  const withinVisibleArea = (element: HTMLElement) => {
    const view = document.defaultView;
    const rect = element.getBoundingClientRect();
    if (
      rect.top < 0 ||
      rect.left < 0 ||
      rect.bottom > (view?.innerHeight ?? 0) ||
      rect.right > (view?.innerWidth ?? 0)
    )
      return false;
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const style = view?.getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      const clips = (overflow: string | undefined) =>
        /^(auto|scroll|hidden|clip)$/.test(overflow ?? "");
      if (
        (clips(style?.overflowY) &&
          (rect.top < bounds.top || rect.bottom > bounds.bottom)) ||
        (clips(style?.overflowX) &&
          (rect.left < bounds.left || rect.right > bounds.right))
      )
        return false;
    }
    return true;
  };
  let restore: (() => void) | undefined;
  let restorePanel: (() => void) | undefined;
  const clear = () => {
    restore?.();
    restorePanel?.();
    restore = undefined;
    restorePanel = undefined;
  };
  const show = (registry: CandidateRegistry, id: string): boolean => {
    clear();
    const lookup = registry.lookupField(id);
    if (lookup.status !== "ready" && lookup.status !== "blocked") return false;
    if (
      lookup.status === "blocked" &&
      ["hidden", "inert", "unsupported"].includes(lookup.reason)
    )
      return false;
    const element = lookup.handle.elements[0];
    if (
      !element ||
      element.ownerDocument !== document ||
      !element.isConnected ||
      element.type === "hidden"
    )
      return false;
    const view = document.defaultView;
    const computed = view?.getComputedStyle(element);
    if (computed?.display === "none" || computed?.visibility === "hidden")
      return false;
    const properties = {
      "background-color": "#fff1d8",
      outline: "2px solid #ad5b2f",
      "outline-offset": "2px",
    };
    const saved = Object.keys(properties).map((name) => ({
      name,
      value: element.style.getPropertyValue(name),
      priority: element.style.getPropertyPriority(name),
    }));
    for (const [name, value] of Object.entries(properties))
      element.style.setProperty(name, value, "important");
    restore = () => {
      for (const { name, value, priority } of saved) {
        if (value) element.style.setProperty(name, value, priority);
        else element.style.removeProperty(name);
      }
    };
    const panelHost = document.querySelector("career-form-profile-panel");
    const initialRect = element.getBoundingClientRect();
    const initialHit = document.elementFromPoint?.(
      initialRect.left + initialRect.width / 2,
      initialRect.top + initialRect.height / 2,
    );
    // Keep neighboring fields stable; move only clipped or covered controls.
    // Our own floating panel is moved separately without shifting the page.
    if (
      !withinVisibleArea(element) ||
      (initialHit &&
        initialHit !== element &&
        !element.contains(initialHit) &&
        initialHit !== panelHost)
    )
      element.scrollIntoView?.({
        block: "center",
        inline: "center",
        behavior: "instant",
      });
    // Try the page's horizontal scroll space before moving the panel aside.
    const panel = panelHost?.shadowRoot?.querySelector<HTMLElement>(
      ".career-form-in-page-panel",
    );
    const rect = element.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    if (
      panelRect &&
      rect.right > panelRect.left &&
      rect.left < panelRect.right &&
      rect.bottom > panelRect.top &&
      rect.top < panelRect.bottom
    ) {
      let ancestor = element.parentElement;
      while (ancestor && ancestor.scrollWidth <= ancestor.clientWidth)
        ancestor = ancestor.parentElement;
      ancestor?.scrollBy?.({
        left: rect.right - panelRect.left + 24,
        behavior: "instant",
      });
      const target = element.getBoundingClientRect();
      if (panel && target.right > panelRect.left) {
        // Never shrink the results panel to expose a field: that hides the
        // list the user is navigating and can clamp its scroll position.
        const gap = 12;
        const leftSpace = target.left - gap * 2;
        const rightSpace = (view?.innerWidth ?? 0) - target.right - gap * 2;
        const left =
          leftSpace >= panelRect.width
            ? gap
            : rightSpace >= panelRect.width
              ? (view?.innerWidth ?? 0) - panelRect.width - gap
              : undefined;
        if (left === undefined) {
          clear();
          return false;
        }
        const panelStyles = ["left", "right"].map((name) => ({
          name,
          value: panel.style.getPropertyValue(name),
          priority: panel.style.getPropertyPriority(name),
        }));
        restorePanel = () => {
          for (const { name, value, priority } of panelStyles) {
            if (value) panel.style.setProperty(name, value, priority);
            else panel.style.removeProperty(name);
          }
        };
        panel.style.setProperty("left", `${left}px`, "important");
        panel.style.setProperty("right", "auto", "important");
      }
    }
    // A fixed header or modal can still cover a centered target. Never report
    // a successful location when the browser's hit test cannot reach it.
    const target = element.getBoundingClientRect();
    if (!withinVisibleArea(element)) {
      clear();
      return false;
    }
    const hit = document.elementFromPoint?.(
      target.left + target.width / 2,
      target.top + target.height / 2,
    );
    if (hit && hit !== element && !element.contains(hit)) {
      clear();
      return false;
    }
    return true;
  };
  return { show, clear };
}
