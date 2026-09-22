import type { CandidateRegistry } from "../dom/candidate-registry";
export function createFieldPresentation(document: Document) {
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
    element.scrollIntoView?.({
      block: "center",
      inline: "center",
      behavior: "instant",
    });
    // Keep the target left of the floating panel, including in nested scrollers.
    const panel = document
      .querySelector("career-form-profile-panel")
      ?.shadowRoot?.querySelector<HTMLElement>(".career-form-in-page-panel");
    const rect = element.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    if (
      panelRect &&
      rect.right > panelRect.left &&
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
        const below = (view?.innerHeight ?? 0) - target.bottom - 24;
        const above = target.top - 24;
        const height = Math.min(panelRect.height, Math.max(below, above));
        if (height < 120) {
          clear();
          return false;
        }
        const top = below >= above ? target.bottom + 12 : 12;
        const panelStyles = ["top", "height"].map((name) => ({
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
        panel.style.setProperty("top", `${top}px`, "important");
        panel.style.setProperty("height", `${height}px`, "important");
      }
    }
    // A fixed header or modal can still cover a centered target. Never report
    // a successful location when the browser's hit test cannot reach it.
    const target = element.getBoundingClientRect();
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
