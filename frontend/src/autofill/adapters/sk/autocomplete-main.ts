import {
  SK_AUTOCOMPLETE_REQUEST_EVENT,
  SK_AUTOCOMPLETE_RESPONSE_EVENT,
  SK_AUTOCOMPLETE_TARGET_ATTRIBUTE,
  type SkAutocompleteFieldName,
} from "./autocomplete-bridge";

export interface SkAutocompleteItem {
  id?: unknown;
  label?: unknown;
  value?: unknown;
}

export interface SkAutocompleteInstance {
  menu?: { element?: { 0?: HTMLElement; length: number } };
  selectedItem?: SkAutocompleteItem;
  term?: string;
  pending?: number;
}

export interface SkJQueryObject {
  data(key: string): unknown;
  autocomplete(
    command: "instance" | "search",
    value?: string,
  ): SkAutocompleteInstance | undefined;
}

export type SkJQuery = (element: Element) => SkJQueryObject;

interface RequestMessage {
  requestId: string;
  command: "probe" | "confirm";
  fieldName: SkAutocompleteFieldName;
}

const ROW_SELECTORS: Record<SkAutocompleteFieldName, string> = {
  eduEducationName: ".form-item-group.educationUniv-item",
  cerCertName: ".form-item-group.cert-Item",
  lngExamName: ".form-item-group.langExam-Item",
};
const SCORE_SETTLE_TIMEOUT_MILLISECONDS = 1_000;
const MENU_SETTLE_TIMEOUT_MILLISECONDS = 2_500;

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/\s+/g, " ").trim()
    : "";
}

function visible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  for (
    let current: HTMLElement | null = element;
    current;
    current = current.parentElement
  ) {
    if (
      current.hidden ||
      current.matches("[aria-hidden='true'], [inert]") ||
      view.getComputedStyle(current).display === "none" ||
      view.getComputedStyle(current).visibility === "hidden"
    ) {
      return false;
    }
  }
  return true;
}

function parseRequest(event: Event): RequestMessage | undefined {
  if (!("detail" in event) || typeof event.detail !== "string") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(event.detail);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return undefined;
    }
    const value = parsed as Partial<RequestMessage>;
    return typeof value.requestId === "string" &&
      (value.command === "probe" || value.command === "confirm") &&
      typeof value.fieldName === "string" &&
      Object.hasOwn(ROW_SELECTORS, value.fieldName)
      ? (value as RequestMessage)
      : undefined;
  } catch {
    return undefined;
  }
}

function markedInput(
  document: Document,
  request: RequestMessage,
): HTMLInputElement | undefined {
  const matches = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[${SK_AUTOCOMPLETE_TARGET_ATTRIBUTE}]`,
    ),
  ).filter(
    (input) =>
      input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) ===
        request.requestId &&
      input.name === request.fieldName &&
      Boolean(input.closest(ROW_SELECTORS[request.fieldName])),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function autocompleteInstance(
  jquery: SkJQuery,
  input: HTMLInputElement,
): SkAutocompleteInstance | undefined {
  try {
    return (
      jquery(input).autocomplete("instance") ??
      (jquery(input).data("ui-autocomplete") as
        SkAutocompleteInstance | undefined)
    );
  } catch {
    return undefined;
  }
}

function exactMenuItem(
  jquery: SkJQuery,
  input: HTMLInputElement,
  fieldName: SkAutocompleteFieldName,
  instance: SkAutocompleteInstance,
): { element: HTMLElement; item: SkAutocompleteItem } | undefined {
  const query = normalize(input.value);
  const menu = instance.menu?.element?.[0];
  if (!query || !menu || !visible(menu)) return undefined;
  const matches = Array.from(
    menu.querySelectorAll<HTMLElement>(".ui-menu-item"),
  ).flatMap((element) => {
    const item = jquery(element).data("ui-autocomplete-item") as
      SkAutocompleteItem | undefined;
    const label = normalize(item?.label);
    const value = normalize(item?.value);
    const id = item?.id === undefined ? undefined : String(item.id).trim();
    const validId =
      fieldName === "lngExamName"
        ? Boolean(id && id !== "0")
        : id === undefined || (id.length > 0 && id !== "0");
    return item &&
      visible(element) &&
      label === query &&
      value === query &&
      validId
      ? [{ element, item }]
      : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function waitForExactMenuItem(
  document: Document,
  jquery: SkJQuery,
  input: HTMLInputElement,
  request: RequestMessage,
  query: string,
): Promise<{ element: HTMLElement; item: SkAutocompleteItem } | undefined> {
  const current = () => {
    if (
      !input.isConnected ||
      input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) !==
        request.requestId ||
      input.value !== query
    ) {
      return { done: true, match: undefined };
    }
    const instance = autocompleteInstance(jquery, input);
    const requestSettled =
      instance &&
      normalize(instance.term) === normalize(query) &&
      instance.pending === 0;
    if (!requestSettled) return { done: false, match: undefined };
    const match = exactMenuItem(jquery, input, request.fieldName, instance);
    const menu = instance.menu?.element?.[0];
    return { done: Boolean(menu && visible(menu)), match };
  };
  const initial = current();
  if (initial.done) return Promise.resolve(initial.match);
  const view = document.defaultView;
  if (!view) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let completed = false;
    const finish = (
      match: { element: HTMLElement; item: SkAutocompleteItem } | undefined,
    ) => {
      if (completed) return;
      completed = true;
      observer.disconnect();
      view.clearInterval(interval);
      view.clearTimeout(timeout);
      resolve(match);
    };
    const inspect = () => {
      const result = current();
      if (result.done) finish(result.match);
    };
    const observer = new view.MutationObserver(inspect);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    const interval = view.setInterval(inspect, 25);
    const timeout = view.setTimeout(
      () => finish(undefined),
      MENU_SETTLE_TIMEOUT_MILLISECONDS,
    );
  });
}

function sameItem(
  left: SkAutocompleteItem | undefined,
  right: SkAutocompleteItem,
  requireId: boolean,
): boolean {
  if (
    normalize(left?.label) !== normalize(right.label) ||
    normalize(left?.value) !== normalize(right.value)
  ) {
    return false;
  }
  return !requireId || String(left?.id ?? "") === String(right.id ?? "");
}

function visibleExamScore(input: HTMLInputElement): boolean {
  const row = input.closest<HTMLElement>(ROW_SELECTORS.lngExamName);
  if (!row) return false;
  const controls = Array.from(
    row.querySelectorAll<HTMLElement>(
      "input[name='lngExamScore'], select[name='lngExamScoreSel']",
    ),
  ).filter(visible);
  return controls.length === 1;
}

function waitForExamScore(input: HTMLInputElement): Promise<boolean> {
  if (visibleExamScore(input)) return Promise.resolve(true);
  const document = input.ownerDocument;
  const view = document.defaultView;
  if (!view) return Promise.resolve(false);
  return new Promise((resolve) => {
    const observer = new view.MutationObserver(() => {
      if (!visibleExamScore(input)) return;
      observer.disconnect();
      view.clearTimeout(timeout);
      resolve(true);
    });
    const timeout = view.setTimeout(() => {
      observer.disconnect();
      resolve(visibleExamScore(input));
    }, SCORE_SETTLE_TIMEOUT_MILLISECONDS);
    observer.observe(input.closest(ROW_SELECTORS.lngExamName)!, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "disabled"],
    });
  });
}

async function confirmSelection(
  document: Document,
  jquery: SkJQuery,
  request: RequestMessage,
): Promise<boolean> {
  const input = markedInput(document, request);
  if (!input || !visible(input)) return false;
  const query = input.value;
  const instance = autocompleteInstance(jquery, input);
  if (!instance) return false;
  try {
    jquery(input).autocomplete("search", query);
  } catch {
    return false;
  }
  const match = await waitForExactMenuItem(
    document,
    jquery,
    input,
    request,
    query,
  );
  if (
    !match ||
    !input.isConnected ||
    input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) !==
      request.requestId ||
    input.value !== query
  ) {
    return false;
  }
  const action =
    match.element.querySelector<HTMLElement>(".ui-menu-item-wrapper") ??
    match.element;
  input.focus();
  action.click();
  input.blur();
  const scoreReady =
    request.fieldName !== "lngExamName" || (await waitForExamScore(input));
  const selected = autocompleteInstance(jquery, input)?.selectedItem;
  return Boolean(
    scoreReady &&
    input.isConnected &&
    input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) ===
      request.requestId &&
    input.value === query &&
    jquery(input).data("confirmed") === true &&
    sameItem(selected, match.item, request.fieldName === "lngExamName"),
  );
}

function respond(
  document: Document,
  request: RequestMessage,
  status: "ready" | "confirmed" | "rejected",
): void {
  const EventConstructor = document.defaultView?.CustomEvent ?? CustomEvent;
  document.dispatchEvent(
    new EventConstructor(SK_AUTOCOMPLETE_RESPONSE_EVENT, {
      detail: JSON.stringify({
        requestId: request.requestId,
        command: request.command,
        fieldName: request.fieldName,
        status,
      }),
    }),
  );
}

export function installSkAutocompleteMainBridge(
  document: Document,
  jquery: SkJQuery,
): () => void {
  const view = document.defaultView;
  const valuesBeforeWrite = new WeakMap<HTMLInputElement, string>();
  const listener = (event: Event) => {
    if (
      !view ||
      document.location.host !== "www.skcareers.com" ||
      !document.location.pathname.startsWith("/Application/Index/")
    ) {
      return;
    }
    const request = parseRequest(event);
    if (!request) return;
    const input = markedInput(document, request);
    if (!input || !autocompleteInstance(jquery, input)) {
      respond(document, request, "rejected");
      return;
    }
    if (request.command === "probe") {
      valuesBeforeWrite.set(input, input.value);
      input.focus();
      respond(
        document,
        request,
        document.activeElement === input ? "ready" : "rejected",
      );
      return;
    }
    const writtenValue = input.value;
    void confirmSelection(document, jquery, request).then((confirmed) => {
      const previousValue = valuesBeforeWrite.get(input);
      valuesBeforeWrite.delete(input);
      if (
        !confirmed &&
        previousValue !== undefined &&
        input.isConnected &&
        input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) ===
          request.requestId &&
        input.value === writtenValue
      ) {
        input.value = previousValue;
        input.blur();
      }
      respond(document, request, confirmed ? "confirmed" : "rejected");
    });
  };
  document.addEventListener(SK_AUTOCOMPLETE_REQUEST_EVENT, listener);
  return () =>
    document.removeEventListener(SK_AUTOCOMPLETE_REQUEST_EVENT, listener);
}
