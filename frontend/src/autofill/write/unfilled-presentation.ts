import type { CandidateRegistry } from "../dom/candidate-registry";
import { UNFILLED_FIELD_HIGHLIGHT } from "./field-highlight-style";
import {
  candidateElements,
  drawOutlines,
  isOutlineTarget,
} from "./outline-overlays";

/**
 * Red borders over fields the autofill left empty. Drawn as overlays only, so
 * site elements keep their own style, class and attributes.
 */
export function createUnfilledPresentation(document: Document) {
  // Fields the user already filled stay unmarked when the result is redrawn.
  let dismissed = new WeakSet<HTMLElement>();
  let release: (() => void) | undefined;
  const clearOverlays = () => {
    release?.();
    release = undefined;
  };
  const clear = () => {
    clearOverlays();
    dismissed = new WeakSet();
  };
  const mark = (registry: CandidateRegistry, ids: readonly string[]) => {
    clearOverlays();
    const view = document.defaultView;
    if (!view) return;
    const candidates = candidateElements(registry, ids);
    const targets = candidates.filter(
      (element) =>
        !dismissed.has(element) &&
        isOutlineTarget(document, element, candidates),
    );
    if (!targets.length) return;
    const startHref = view.location.href;
    const listeners: (() => void)[] = [];
    const outlines = drawOutlines(document, targets, {
      attribute: "data-career-form-unfilled-highlight",
      border: UNFILLED_FIELD_HIGHLIGHT.border,
      // A pushState navigation fires no event; the next tracking pass notices it.
      alive: () =>
        view.location.href === startHref && targets.some((e) => e.isConnected),
      onClear: () => listeners.forEach((off) => off()),
    });
    for (const element of targets) {
      const onEdit = () => {
        const value = (element as HTMLInputElement).value;
        if (typeof value !== "string" || !value.trim()) return;
        dismissed.add(element);
        outlines.remove(element);
      };
      element.addEventListener("input", onEdit);
      element.addEventListener("change", onEdit);
      listeners.push(() => {
        element.removeEventListener("input", onEdit);
        element.removeEventListener("change", onEdit);
      });
    }
    view.addEventListener("popstate", clear);
    view.addEventListener("hashchange", clear);
    listeners.push(() => {
      view.removeEventListener("popstate", clear);
      view.removeEventListener("hashchange", clear);
    });
    release = outlines.clear;
  };
  return { mark, clear };
}
