import {
  HIGH_RISK_ACTION,
  MAX_OBSERVATION_POLLS,
  OBSERVATION_POLL_MS,
  type ElementBinding,
  type ReadonlySearchFailureReason,
  type SearchControl,
  type SearchResult,
  type SearchSubmit,
  elementSignature,
  isAnchorElement,
  isButtonElement,
  isInputElement,
  isSelectElement,
  isTextareaElement,
  isVisible,
  normalized,
} from "./readonly-search";

export { normalized } from "./readonly-search";

const SEARCH_LABEL = /검색|search|find|lookup|조회|찾기/i;
const QUERY_LABEL =
  /입력|query|keyword|검색어|검색|학교|전공|소재지|major|school|location|region/i;

export function delay(signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const timer = globalThis.setTimeout(
      () => resolve(!signal?.aborted),
      OBSERVATION_POLL_MS,
    );
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        resolve(false);
      },
      { once: true },
    );
  });
}

type FrameState = Map<HTMLIFrameElement, boolean>;

export interface FrameNavigationObservation {
  isReady(frame: HTMLIFrameElement, document: Document): boolean;
  stop(): void;
}

export function frameState(document: Document): FrameState {
  return new Map(
    Array.from(document.querySelectorAll("iframe")).map((frame) => [
      frame,
      isVisible(frame),
    ]),
  );
}

/**
 * A visible popup iframe can expose its old, fully loaded document while an
 * opener assigns the same src again. Observe the click boundary so execution
 * waits for that navigation instead of typing into the predecessor.
 */
export function observeFrameNavigation(
  document: Document,
): FrameNavigationObservation {
  const pendingDocuments = new Map<HTMLIFrameElement, Document | undefined>();
  const onLoad = (event: Event) => {
    const target = event.target;
    if (
      target &&
      typeof target === "object" &&
      "tagName" in target &&
      (target as Element).tagName === "IFRAME"
    ) {
      pendingDocuments.delete(target as HTMLIFrameElement);
    }
  };
  const Observer = document.defaultView?.MutationObserver;
  const observer = Observer
    ? new Observer((records) => {
        for (const record of records) {
          if (
            record.type === "attributes" &&
            record.target.nodeName === "IFRAME"
          ) {
            pendingDocuments.set(
              record.target as HTMLIFrameElement,
              accessibleFrameDocument(record.target as HTMLIFrameElement),
            );
          }
        }
      })
    : undefined;
  const root = document.documentElement;
  if (observer && root) {
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcdoc"],
    });
  }
  document.addEventListener("load", onLoad, true);
  return {
    isReady(frame, currentDocument) {
      if (pendingDocuments.has(frame))
        return pendingDocuments.get(frame) !== currentDocument;
      return true;
    },
    stop() {
      observer?.disconnect();
      document.removeEventListener("load", onLoad, true);
    },
  };
}

function changedFrames(
  document: Document,
  before: FrameState,
): HTMLIFrameElement[] {
  return Array.from(document.querySelectorAll("iframe")).filter(
    (frame) => !before.has(frame) || (!before.get(frame) && isVisible(frame)),
  );
}

export function accessibleFrameDocument(
  frame: HTMLIFrameElement,
): Document | undefined {
  try {
    const sandbox = frame.getAttribute("sandbox");
    if (sandbox !== null && !sandbox.split(/\s+/).includes("allow-same-origin"))
      return undefined;
    const document = frame.contentDocument;
    return document?.defaultView ? document : undefined;
  } catch {
    return undefined;
  }
}

export function frameNavigationSettled(
  frame: HTMLIFrameElement,
  document: Document,
): boolean {
  // Deferred popup scripts install the local search submit handler before
  // `complete`; an interactive document can still native-submit and navigate.
  if (document.readyState !== "complete") return false;
  const baseTarget = document
    .querySelector("base")
    ?.getAttribute("target")
    ?.trim()
    .toLowerCase();
  if (baseTarget && baseTarget !== "_self") return false;
  // A newly visible iframe may still expose its previous document while a
  // changed src is loading. Never type or select a result in that old page.
  if (frame.hasAttribute("srcdoc")) return document.URL === "about:srcdoc";
  const source = frame.getAttribute("src");
  if (!source) return document.URL === "about:blank";
  try {
    const expected = new URL(source, frame.ownerDocument.baseURI);
    const actual = new URL(document.URL);
    expected.hash = "";
    actual.hash = "";
    return expected.href === actual.href;
  } catch {
    return false;
  }
}

export async function openedFrame(
  document: Document,
  before: FrameState,
  navigation: FrameNavigationObservation,
  signal?: AbortSignal,
): Promise<
  { frame: HTMLIFrameElement; document: Document } | ReadonlySearchFailureReason
> {
  for (let attempt = 0; attempt < MAX_OBSERVATION_POLLS; attempt += 1) {
    if (signal?.aborted) return "popup_frame_not_found";
    const frames = changedFrames(document, before);
    if (frames.length > 1) return "multiple_popup_frames";
    if (frames.length === 1) {
      const popupDocument = accessibleFrameDocument(frames[0]!);
      if (!popupDocument) return "inaccessible_popup_frame";
      if (
        navigation.isReady(frames[0]!, popupDocument) &&
        frameNavigationSettled(frames[0]!, popupDocument) &&
        popupDocument.querySelector("input, textarea, select, button, a")
      )
        return { frame: frames[0]!, document: popupDocument };
    }
    if (!(await delay(signal))) break;
  }
  return "popup_frame_not_found";
}

function queryLabel(element: Element): string {
  const labels =
    "labels" in element
      ? Array.from((element as HTMLInputElement).labels ?? [])
          .map((label) => label.textContent ?? "")
          .join(" ")
      : "";
  return [
    element.getAttribute("title"),
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    labels,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function plausibleQueryInput(element: Element): element is SearchControl {
  return (
    isInputElement(element) &&
    ["text", "search"].includes(element.type) &&
    QUERY_LABEL.test(queryLabel(element))
  );
}

export function queryCandidates(document: Document): SearchControl[] {
  return Array.from(document.querySelectorAll("input")).filter(
    plausibleQueryInput,
  );
}

export function isQueryInput(element: Element): element is SearchControl {
  if (
    !plausibleQueryInput(element) ||
    !isVisible(element) ||
    element.matches(":disabled") ||
    element.closest("[aria-disabled='true'], [inert]") ||
    element.readOnly
  )
    return false;
  return true;
}

function submitLabel(element: Element): string {
  return [
    element.getAttribute("title"),
    element.getAttribute("aria-label"),
    (element as HTMLInputElement).value,
    element.textContent,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function plausibleSearchSubmit(element: Element): element is SearchSubmit {
  if (!(isButtonElement(element) || isInputElement(element))) return false;
  if (isInputElement(element) && !["submit", "button"].includes(element.type))
    return false;
  return SEARCH_LABEL.test(submitLabel(element));
}

export function submitCandidates(document: Document): SearchSubmit[] {
  return Array.from(document.querySelectorAll("button, input")).filter(
    plausibleSearchSubmit,
  );
}

export function isSearchSubmit(element: Element): element is SearchSubmit {
  if (!plausibleSearchSubmit(element)) return false;
  if (!isVisible(element) || element.matches(":disabled")) return false;
  if (element.closest("[aria-disabled='true'], [inert]")) return false;
  if (isButtonElement(element) && !["button", "submit"].includes(element.type))
    return false;
  return !HIGH_RISK_ACTION.test(submitLabel(element));
}

function editableControls(
  form: HTMLFormElement,
): Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> {
  return Array.from(form.elements).filter(
    (
      element,
    ): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      (isInputElement(element) ||
        isTextareaElement(element) ||
        isSelectElement(element)) &&
      !(
        isInputElement(element) &&
        ["hidden", "button", "submit", "reset", "image"].includes(element.type)
      ) &&
      !element.disabled &&
      !("readOnly" in element && element.readOnly),
  );
}

function associatedElements(form: HTMLFormElement): Element[] {
  const controls = [
    ...Array.from(form.elements),
    ...Array.from(form.querySelectorAll("a, button, input, select, textarea")),
  ];
  const external = Array.from(
    form.ownerDocument.querySelectorAll("button, input, select, textarea, a"),
  ).filter(
    (element) =>
      element.getAttribute("form") === form.id && !form.contains(element),
  );
  return [...new Set([...controls, ...external])];
}

function associatedActionControls(form: HTMLFormElement): Element[] {
  return associatedElements(form).filter((element) =>
    element.matches(
      "button, input[type='button'], input[type='submit'], input[type='reset'], input[type='image'], a",
    ),
  );
}

function hasUnsafeAssociatedControls(
  form: HTMLFormElement,
  query: SearchControl,
  submit: SearchSubmit,
): boolean {
  const all = associatedElements(form);
  const external = all.some(
    (element) =>
      element.getAttribute("form") === form.id && !form.contains(element),
  );
  if (external) return true;
  return all.some((element) => {
    if (element === query || element === submit) return false;
    if (isInputElement(element) && element.type === "hidden") return false;
    return element.matches("input, select, textarea, button, a");
  });
}

export function isolatedSearchForm(
  query: SearchControl,
  submit: SearchSubmit,
): boolean {
  const form = query.form;
  if (!form || submit.form !== form || form.parentElement?.closest("form"))
    return false;
  const editable = editableControls(form);
  if (editable.length !== 1 || editable[0] !== query) return false;
  if (hasUnsafeAssociatedControls(form, query, submit)) return false;
  const actions = associatedActionControls(form);
  if (actions.length !== 1 || actions[0] !== submit) return false;
  return actions.every((element) => isSearchSubmit(element));
}

export function hasMultipleEditableControls(query: SearchControl): boolean {
  const form = query.form;
  if (!form) return false;
  const editable = editableControls(form);
  return editable.length !== 1 || editable[0] !== query;
}

export function hasSafeSearchDestination(
  query: SearchControl,
  submit: SearchSubmit,
): boolean {
  const form = query.form;
  if (!form) return false;
  if (!isSearchSubmit(submit) || submit.form !== form) return false;
  const target = (submit.formTarget || form.target).trim().toLowerCase();
  if (target && target !== "_self") return false;
  const method = (
    submit.getAttribute("formmethod") ||
    form.getAttribute("method") ||
    "get"
  )
    .trim()
    .toLowerCase();
  if (method !== "get") return false;
  const rawAction = (
    submit.getAttribute("formaction") ||
    form.getAttribute("action") ||
    ""
  ).trim();
  const nativeSubmit =
    (isButtonElement(submit) && submit.type === "submit") ||
    (isInputElement(submit) && submit.type === "submit");
  if (!rawAction && nativeSubmit) return false;
  if (!rawAction && !nativeSubmit) return true;
  let action: URL;
  try {
    action = new URL(rawAction, form.ownerDocument.baseURI);
    const current = new URL(form.ownerDocument.URL);
    if (action.origin !== current.origin) return false;
  } catch {
    return false;
  }
  if (HIGH_RISK_ACTION.test(`${action.pathname} ${action.search}`))
    return false;
  const current = new URL(form.ownerDocument.URL);
  const sameDocumentHash =
    action.pathname === current.pathname && action.hash.length > 0;
  const searchOnlyDestination = SEARCH_LABEL.test(
    `${action.pathname} ${action.search}`,
  );
  return sameDocumentHash || searchOnlyDestination;
}

export function currentBinding<T extends Element>(
  binding: ElementBinding<T>,
  document: Document,
  predicate: (element: Element) => boolean,
): boolean {
  return (
    binding.element.isConnected &&
    binding.element.ownerDocument === document &&
    elementSignature(binding.element) === binding.signature &&
    predicate(binding.element)
  );
}

export function setNativeValue(
  input: SearchControl,
  value: string,
  assertCurrent?: () => boolean,
): boolean {
  if (assertCurrent?.() === false) return false;
  const view = input.ownerDocument.defaultView;
  const prototype = view?.HTMLInputElement?.prototype;
  if (!prototype || !view?.Event) return false;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return false;
  setter.call(input, value);
  if (assertCurrent?.() === false) return false;
  input.dispatchEvent(new view.Event("input", { bubbles: true }));
  if (assertCurrent?.() === false) return false;
  input.dispatchEvent(new view.Event("change", { bubbles: true }));
  return (
    assertCurrent?.() !== false && normalized(input.value) === normalized(value)
  );
}

export function resultCandidates(
  document: Document,
  expectedValue: string | readonly string[],
  allowUnlabelledScopes = false,
): SearchResult[] {
  const expectedValues = (
    Array.isArray(expectedValue) ? expectedValue : [expectedValue]
  ).map(normalized);
  const scopes = Array.from(
    document.querySelectorAll(
      "[data-search-results], [role='listbox'], [role='list'], ul, ol, table",
    ),
  ).filter((scope) => allowUnlabelledScopes || isResultScope(scope));
  const unique = new Set<Element>();
  scopes.forEach((scope) => {
    scope
      .querySelectorAll("a, button")
      .forEach((element) => unique.add(element));
  });
  return Array.from(unique).filter(
    (element): element is SearchResult =>
      (isAnchorElement(element) || isButtonElement(element)) &&
      resultVisible(element) &&
      expectedValues.includes(normalized(element.textContent ?? "")),
  );
}

function isResultScope(scope: Element): boolean {
  if (scope.matches("[data-search-results], [role='listbox']")) return true;
  const labelled = [
    scope.getAttribute("aria-label"),
    ...(scope.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .map((id) => scope.ownerDocument.getElementById(id)?.textContent ?? ""),
    scope.querySelector("caption")?.textContent,
    scope.previousElementSibling?.textContent,
  ]
    .filter(Boolean)
    .join(" ");
  return /검색|결과|선택|result|select|search/i.test(labelled);
}

function resultVisible(element: HTMLElement): boolean {
  if (
    element.hidden ||
    element.closest("[hidden], [aria-hidden='true'], [inert]")
  )
    return false;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden")
      return false;
  }
  return true;
}

export function safeResultActivation(
  result: SearchResult,
  _allowSchoolPlaceCallback = false,
): boolean {
  if (!result.isConnected) return false;
  if (!isVisible(result) || result.matches(":disabled")) return false;
  if (result.closest("[aria-disabled='true'], [inert]")) return false;
  if (HIGH_RISK_ACTION.test(submitLabel(result))) return false;
  if (isButtonElement(result)) return result.type === "button";
  const target = result.getAttribute("target")?.trim().toLowerCase() ?? "";
  const baseTarget =
    result.ownerDocument
      .querySelector("base")
      ?.getAttribute("target")
      ?.trim()
      .toLowerCase() ?? "";
  if (
    result.hasAttribute("download") ||
    (target && target !== "_self") ||
    (baseTarget && baseTarget !== "_self")
  )
    return false;
  const href = result.getAttribute("href")?.trim() ?? "";
  if (HIGH_RISK_ACTION.test(href)) return false;
  return href === "" || href === "#" || false;
}

/** JavaScript URL callbacks are outside the generic activation contract. */
export function activateSchoolRegionResult(_result: SearchResult): boolean {
  return false;
}

export function isSchoolRegionListPopup(
  document: Document,
  canonicalFieldKey: string,
): boolean {
  if (!canonicalFieldKey.endsWith(".schoolRegion")) return false;
  if (queryCandidates(document).length || submitCandidates(document).length)
    return false;
  const selects = Array.from(document.querySelectorAll("select")).filter(
    (select) =>
      isVisible(select) &&
      !select.disabled &&
      !select.closest("[aria-disabled='true'], [inert]"),
  );
  if (selects.length !== 1) return false;
  const country = selects[0]!;
  const selectedLabel = normalized(
    country.selectedOptions[0]?.textContent ?? "",
  );
  return (
    country.value === "KOR" &&
    ["한국", "대한민국"].includes(selectedLabel) &&
    Array.from(document.querySelectorAll("input, textarea, select")).filter(
      (control) => {
        if (!isVisible(control as HTMLElement)) return false;
        if (isInputElement(control))
          return !["hidden", "button", "submit", "reset", "image"].includes(
            control.type,
          );
        return true;
      },
    ).length === 1
  );
}

export function outerLocation(document: Document): string {
  return document.defaultView?.location.href ?? "";
}
