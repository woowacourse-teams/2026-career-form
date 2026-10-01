import { HIGH_RISK_ACTION, isVisible, normalized } from "./readonly-search";
import { SearchFailure } from "./search-session";
import { isTrustedId } from "../dom/trusted-id";
import type { SearchSurfaceKind } from "./search-surface";

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
  if (!isTrustedId(target.getRootNode() as Document | ShadowRoot, target.id))
    return false;
  return ["aria-controls", "aria-owns", "popovertarget", "commandfor"].some(
    (attribute) =>
      (control.getAttribute(attribute) ?? "").split(/\s+/).includes(target.id),
  );
}
const LAYER_TAGS = new Set(["DIV", "SECTION", "ASIDE", "ARTICLE"]);

/**
 * A container without surface markup that structurally looks like a search
 * layer: a writable query input, a button and a result list (C9). Visibility
 * is judged by the caller from its before/after comparison.
 */
export function isRolelessLayerCandidate(element: Element): boolean {
  return (
    LAYER_TAGS.has(element.tagName) &&
    !element.matches(SURFACE_SELECTOR) &&
    Array.from(element.querySelectorAll<HTMLInputElement>("input")).some(
      (input) => ["text", "search"].includes(input.type) && !input.readOnly,
    ) &&
    element.querySelector("button") !== null &&
    element.querySelector("ul, ol, table, [role='list']") !== null
  );
}

/** Subjects a target field and a search surface can explicitly share. */
export const SEARCH_SUBJECTS = [
  "학교",
  "school",
  "전공",
  "major",
  "소재지",
  "region",
  "자격증",
  "certificate",
] as const;

export function sharesSearchSubject(fieldName: string, surfaceName: string) {
  const field = fieldName.toLowerCase();
  const surface = surfaceName.toLowerCase();
  return SEARCH_SUBJECTS.some(
    (subject) => field.includes(subject) && surface.includes(subject),
  );
}

export function layerHeading(container: Element): string {
  return (container.querySelector("h1, h2, h3, h4, h5, h6")?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
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
  const actionValue =
    element.tagName === "INPUT" &&
    ["button", "submit", "reset"].includes((element as HTMLInputElement).type)
      ? (element as HTMLInputElement).value
      : "";
  return normalized(
    [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("placeholder"),
      inputLabels,
      actionValue,
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

/** The owned result area a candidate was found in. */
export interface ActivationScope {
  readonly resultRoot: Element;
  readonly surfaceKind: SearchSurfaceKind;
}

/**
 * A same-document fragment link with a single onclick handler, inside the
 * owned result root of a same-document surface (C10). The handler source is
 * never read, parsed or evaluated.
 */
function fragmentResultLink(
  element: HTMLElement,
  acceptedValues: readonly string[] | undefined,
  scope: ActivationScope | undefined,
): boolean {
  const href = element.getAttribute("href")?.trim() ?? "";
  const form = element.closest("form");
  if (
    !scope ||
    !["same-document-dialog", "same-document-layer"].includes(
      scope.surfaceKind,
    ) ||
    !scope.resultRoot.contains(element) ||
    !href.startsWith("#") ||
    href.length < 2 ||
    // An enclosing application form is allowed only around the whole result
    // root; a form inside the owned result area still fails closed.
    (form && (form === scope.resultRoot || !form.contains(scope.resultRoot)))
  )
    return false;
  const handlers = Array.from(element.attributes).filter((attribute) =>
    /^on/i.test(attribute.name),
  );
  if (handlers.length !== 1 || handlers[0]!.name.toLowerCase() !== "onclick")
    return false;
  const page = new URL(element.ownerDocument.URL);
  const next = new URL(href, page);
  return (
    next.origin === page.origin &&
    next.pathname === page.pathname &&
    next.search === page.search &&
    !!acceptedValues?.some(
      (value) => normalized(value) === normalized(element.textContent ?? ""),
    )
  );
}

export function safeActivation(
  element: HTMLElement,
  acceptedValues?: readonly string[],
  scope?: ActivationScope,
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
    if (fragmentResultLink(element, acceptedValues, scope)) return true;
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
