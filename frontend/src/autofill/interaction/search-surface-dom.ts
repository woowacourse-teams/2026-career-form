import { HIGH_RISK_ACTION, isVisible, normalized } from "./readonly-search";
import { SearchFailure } from "./search-session";

export type SearchRoot = Document | Element | ShadowRoot;
export const SURFACE_SELECTOR =
  "dialog, [role='dialog'], [popover], [role='listbox'], iframe, [data-search-surface]";
export function elements<T extends Element = HTMLElement>(
  root: SearchRoot,
  selector: string,
): T[] {
  const found = Array.from(root.querySelectorAll<T>(selector));
  if (found.length > 512) throw new SearchFailure("decision_budget_exhausted");
  return found;
}
export function roots(document: Document, target: Element): SearchRoot[] {
  const root = target.getRootNode();
  // Only enter a ShadowRoot already tied to the approved target. No closed-root probing.
  return root !== document && "host" in root
    ? [document, root as ShadowRoot]
    : [document];
}
export function shown(element: Element): boolean {
  if (!element.isConnected || !isVisible(element as HTMLElement)) return false;
  if (element.tagName === "DIALOG" && !element.hasAttribute("open"))
    return false;
  if (element.hasAttribute("popover")) {
    try {
      if (!element.matches(":popover-open")) return false;
    } catch {
      return false;
    }
  }
  return true;
}
export function linked(control: Element, target: Element): boolean {
  if (!target.id || control.getRootNode() !== target.getRootNode())
    return false;
  return ["aria-controls", "aria-owns", "popovertarget", "commandfor"].some(
    (attribute) =>
      (control.getAttribute(attribute) ?? "").split(/\s+/).includes(target.id),
  );
}
export function activeModal(document: Document): Element | undefined {
  const modals = elements(
    document,
    "dialog[open], [role='dialog'][aria-modal='true']",
  ).filter((item) => {
    if (!shown(item)) return false;
    if (item.getAttribute("aria-modal") === "true") return true;
    try {
      return item.matches(":modal");
    } catch {
      return false;
    }
  });
  if (modals.length > 1) throw new SearchFailure("surface_ambiguous");
  return modals[0];
}
export function interactive(element: HTMLElement): boolean {
  const modal = activeModal(element.ownerDocument);
  return (
    shown(element) &&
    !element.matches(":disabled, [aria-disabled='true']") &&
    !element.closest("[inert], [aria-disabled='true']") &&
    (!modal || modal.contains(element))
  );
}
export function label(element: Element): string {
  const inputLabels =
    "labels" in element
      ? Array.from((element as HTMLInputElement).labels ?? [])
          .map((item) => item.textContent)
          .join(" ")
      : "";
  return normalized(
    [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("placeholder"),
      inputLabels,
      element.textContent,
    ]
      .filter(Boolean)
      .join(" "),
  );
}
/** Only a single literal-bearing selector call is eligible for a normal UI click.
 * This does not evaluate the URL. Result scope, uniqueness and reflection are
 * independently checked by the search transaction. */
function simpleSelectionHref(href: string, labelText: string): boolean {
  if (href.length > 256 || HIGH_RISK_ACTION.test(href)) return false;
  const match = /^javascript:([A-Za-z_$][\w$]*)\('([^'\\\r\n]*)'\);?$/i.exec(
    href,
  );
  if (
    !match ||
    /^(eval|function|fetch|open|close|post|send|navigate|location|window|document|parent|top)$/i.test(
      match[1]!,
    )
  )
    return false;
  const label = normalized(labelText);
  return (
    Boolean(label) &&
    match[2]!.split(/[|,]/).some((part) => normalized(part) === label)
  );
}

export function safeActivation(
  element: HTMLElement,
  acceptedValues?: readonly string[],
): boolean {
  if (!interactive(element) || HIGH_RISK_ACTION.test(label(element)))
    return false;
  if (element.hasAttribute("download")) return false;
  const target =
    element.getAttribute("target") ||
    element.ownerDocument.querySelector("base")?.getAttribute("target");
  if (target && target.toLowerCase() !== "_self") return false;
  if (element.tagName === "BUTTON" || element.tagName === "INPUT")
    return (element as HTMLButtonElement).type === "button";
  if (element.tagName === "A") {
    const href = element.getAttribute("href")?.trim() ?? "";
    if (href === "" || href === "#") return true;
    if (
      !acceptedValues ||
      !acceptedValues.some(
        (value) => normalized(value) === normalized(element.textContent ?? ""),
      ) ||
      element.closest("form") ||
      Array.from(element.attributes).some((attribute) =>
        /^on/i.test(attribute.name),
      )
    )
      return false;
    return simpleSelectionHref(href, element.textContent ?? "");
  }
  return (
    element.getAttribute("role") === "option" &&
    !element.hasAttribute("href") &&
    !element.querySelector("a[href], button, input")
  );
}
export function accessibleDocument(
  frame: HTMLIFrameElement,
): Document | undefined {
  try {
    const sandbox = frame.getAttribute("sandbox");
    if (sandbox !== null && !frame.sandbox.contains("allow-same-origin"))
      return undefined;
    const doc = frame.contentDocument;
    if (!doc?.defaultView || doc.URL === "about:blank") return undefined;
    if (
      doc.URL !== "about:srcdoc" &&
      new URL(doc.URL).origin !== frame.ownerDocument.location.origin
    )
      return undefined;
    return doc;
  } catch {
    return undefined;
  }
}
