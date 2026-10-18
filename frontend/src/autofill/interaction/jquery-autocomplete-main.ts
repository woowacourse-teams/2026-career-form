import {
  AUTOCOMPLETE_DISMISS_EVENT,
  AUTOCOMPLETE_DISMISS_TARGET,
} from "./autocomplete-completion";
import { validSearchRule, type SearchRule } from "../workflow/execution-policy";
import { selectDirectInput } from "../interaction/search-direct-input";
import {
  JQUERY_AUTOCOMPLETE_REQUEST_EVENT,
  JQUERY_AUTOCOMPLETE_RESPONSE_EVENT,
  JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE,
  type JqueryAutocompleteFieldName,
  matchesCatalogField,
} from "./jquery-autocomplete-protocol";
import {
  isApprovedCatalogMatch,
  matchesApprovedCatalog,
  type ApprovedCatalogMatch,
  type CatalogEvidence,
} from "../profile/catalog-match";
import { catalogEvidenceForElement } from "../profile/catalog-evidence";
import {
  isStandardValueId,
  standardValueAliases,
} from "../../profile/standard-values";
import type { FailureReporter, WriteFailureCode } from "../write/failure";

export interface JqueryAutocompleteItem {
  id?: unknown;
  label?: unknown;
  value?: unknown;
}

export interface JqueryAutocompleteInstance {
  menu?: { element?: { 0?: HTMLElement; length: number } };
  selectedItem?: JqueryAutocompleteItem;
  term?: string;
  pending?: number;
  searching?: number;
}

export interface JqueryObject {
  data(key: string): unknown;
  autocomplete(
    command: "instance" | "search" | "close",
    value?: string,
  ): JqueryAutocompleteInstance | undefined;
}

export type Jquery = (element: Element) => JqueryObject;

interface RequestMessage {
  requestId: string;
  command: "probe" | "confirm" | "verify";
  fieldName: JqueryAutocompleteFieldName;
  catalogMatch?: ApprovedCatalogMatch;
  selectedValue?: string;
  selectedLabel?: string;
  selectedCode?: string;
  rule: SearchRule;
}

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/\s+/g, " ").trim()
    : "";
}

function matchesStandardValue(
  profileValue: string,
  item: JqueryAutocompleteItem | undefined,
  rule: SearchRule,
): boolean {
  if (!item || !isStandardValueId(profileValue)) return false;
  const aliases = new Set(standardValueAliases(profileValue).map(normalize));
  const values = [item.label, item.value].flatMap((value) => {
    const normalized = normalize(value);
    const withoutLanguage = normalize(
      typeof value === "string" && rule.stripParentheticalLabel
        ? value.replace(/\([^)]*\)/g, " ")
        : value,
    );
    return [normalized, withoutLanguage];
  });
  return values.some((value) => aliases.has(value));
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
      (value.command === "probe" ||
        value.command === "confirm" ||
        value.command === "verify") &&
      typeof value.fieldName === "string" &&
      validSearchRule(value.rule) &&
      !!value.rule.confirmation &&
      Number.isInteger(value.rule.readyCount) &&
      Array.isArray(value.rule.invalidResultIds) &&
      value.rule.fieldName === value.fieldName &&
      (value.catalogMatch === undefined ||
        (isApprovedCatalogMatch(value.catalogMatch) &&
          matchesCatalogField(
            value.fieldName as JqueryAutocompleteFieldName,
            value.catalogMatch,
            value.rule?.catalogKind,
          )))
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
      `input[${JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE}]`,
    ),
  ).filter(
    (input) =>
      input.getAttribute(JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE) ===
        request.requestId &&
      input.name === request.fieldName &&
      Boolean(input.closest(request.rule.rowSelector)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function autocompleteInstance(
  jquery: Jquery,
  input: HTMLInputElement,
): JqueryAutocompleteInstance | undefined {
  try {
    return (
      jquery(input).autocomplete("instance") ??
      (jquery(input).data("ui-autocomplete") as
        JqueryAutocompleteInstance | undefined)
    );
  } catch {
    return undefined;
  }
}

function exactMenuItem(
  jquery: Jquery,
  input: HTMLInputElement,
  rule: SearchRule,
  instance: JqueryAutocompleteInstance,
  onFailure?: FailureReporter,
  catalogMatch?: ApprovedCatalogMatch,
):
  | {
      element: HTMLElement;
      item: JqueryAutocompleteItem;
      evidence: CatalogEvidence;
    }
  | undefined {
  const query = normalize(input.value);
  const menu = instance.menu?.element?.[0];
  if (!query || !menu || !visible(menu)) return undefined;
  const elements = Array.from(
    menu.querySelectorAll<HTMLElement>(".ui-menu-item"),
  ).filter(visible);
  let unverifiableCandidate =
    elements.length === 0 && menu.childElementCount > 0;
  const matches = elements.flatMap((element) => {
    const item = jquery(element).data("ui-autocomplete-item") as
      JqueryAutocompleteItem | undefined;
    const label = normalize(item?.label);
    const value = normalize(item?.value);
    const id = item?.id === undefined ? undefined : String(item.id).trim();
    const validId = rule.requireResultId
      ? Boolean(id && !rule.invalidResultIds?.includes(id))
      : id === undefined ||
        (id.length > 0 && !rule.invalidResultIds?.includes(id));
    const exact = label === query && value === query;
    const canonicalExam =
      rule.standardAliases === true && matchesStandardValue(query, item, rule);
    if (!item || !label || !value || !validId) unverifiableCandidate = true;
    const evidence = catalogEvidenceForElement(
      element,
      menu,
      typeof item?.label === "string" ? item.label : "",
    );
    const approved = catalogMatch
      ? matchesApprovedCatalog(catalogMatch, evidence) &&
        matchesApprovedCatalog(catalogMatch, {
          ...evidence,
          label: typeof item?.value === "string" ? item.value : "",
        })
      : exact || canonicalExam;
    return item && label && value && approved && validId
      ? [{ element, item: { ...item }, evidence }]
      : [];
  });
  if (matches.length !== 1)
    onFailure?.(
      matches.length > 1
        ? "SEARCH_AMBIGUOUS"
        : unverifiableCandidate
          ? "SEARCH_UNCONFIRMED"
          : elements.length > 0
            ? "SEARCH_NO_EXACT_MATCH"
            : "SEARCH_NO_RESULTS",
    );
  return matches.length === 1 ? matches[0] : undefined;
}

function waitForExactMenuItem(
  document: Document,
  jquery: Jquery,
  input: HTMLInputElement,
  request: RequestMessage,
  query: string,
  onFailure?: FailureReporter,
): Promise<
  | {
      element: HTMLElement;
      item: JqueryAutocompleteItem;
      evidence: CatalogEvidence;
    }
  | undefined
> {
  const current = () => {
    if (
      !input.isConnected ||
      input.getAttribute(JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE) !==
        request.requestId ||
      input.value !== query
    ) {
      return {
        done: true,
        match: undefined,
        failureCode: "SEARCH_UNCONFIRMED" as const,
      };
    }
    const instance = autocompleteInstance(jquery, input);
    const requestSettled =
      instance &&
      normalize(instance.term) === normalize(query) &&
      instance.pending === 0;
    if (!requestSettled) return { done: false, match: undefined };
    let failureCode: WriteFailureCode | undefined = "SEARCH_UNCONFIRMED";
    const match = exactMenuItem(
      jquery,
      input,
      request.rule,
      instance,
      (code) => {
        failureCode = code;
      },
      request.catalogMatch,
    );
    const menu = instance.menu?.element?.[0];
    return {
      done: Boolean(menu && visible(menu)),
      match,
      failureCode: match ? undefined : failureCode,
    };
  };
  const initial = current();
  if (initial.done) {
    if (initial.failureCode) onFailure?.(initial.failureCode);
    return Promise.resolve(initial.match);
  }
  const view = document.defaultView;
  if (!view) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let completed = false;
    const finish = (
      match:
        | {
            element: HTMLElement;
            item: JqueryAutocompleteItem;
            evidence: CatalogEvidence;
          }
        | undefined,
      failureCode?: WriteFailureCode,
    ) => {
      if (completed) return;
      completed = true;
      observer.disconnect();
      view.clearInterval(interval);
      view.clearTimeout(timeout);
      if (failureCode) onFailure?.(failureCode);
      resolve(match);
    };
    const inspect = () => {
      const result = current();
      if (result.done) finish(result.match, result.failureCode);
    };
    const observer = new view.MutationObserver(inspect);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "aria-describedby",
        "id",
        JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE,
      ],
    });
    const interval = view.setInterval(inspect, 25);
    const timeout = view.setTimeout(
      () => finish(undefined, current().failureCode ?? "SEARCH_TIMEOUT"),
      request.rule.menuTimeoutMs ?? 2500,
    );
  });
}

function sameItem(
  left: JqueryAutocompleteItem | undefined,
  right: JqueryAutocompleteItem,
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

function visibleExamScore(input: HTMLInputElement, rule: SearchRule): boolean {
  if (!rule.readySelector) return true;
  const row = input.closest<HTMLElement>(rule.rowSelector);
  if (!row) return false;
  const controls = Array.from(
    row.querySelectorAll<HTMLElement>(rule.readySelector),
  ).filter(visible);
  return controls.length === rule.readyCount;
}

function waitForExamScore(
  input: HTMLInputElement,
  rule: SearchRule,
): Promise<boolean> {
  if (visibleExamScore(input, rule)) return Promise.resolve(true);
  const document = input.ownerDocument;
  const view = document.defaultView;
  if (!view) return Promise.resolve(false);
  return new Promise((resolve) => {
    const observer = new view.MutationObserver(() => {
      if (!visibleExamScore(input, rule)) return;
      observer.disconnect();
      view.clearTimeout(timeout);
      resolve(true);
    });
    const timeout = view.setTimeout(() => {
      observer.disconnect();
      resolve(visibleExamScore(input, rule));
    }, rule.readyTimeoutMs ?? 1000);
    observer.observe(input.closest(rule.rowSelector)!, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "disabled"],
    });
  });
}

async function confirmSelection(
  document: Document,
  jquery: Jquery,
  request: RequestMessage,
  onFailure?: FailureReporter,
): Promise<
  | {
      directInput?: boolean;
      selectedValue: string;
      selectedLabel: string;
      selectedCode: string;
      evidence: CatalogEvidence;
      instance: JqueryAutocompleteInstance;
      row: Element;
    }
  | undefined
> {
  const input = markedInput(document, request);
  if (!input || !visible(input)) return undefined;
  const query = input.value;
  const instance = autocompleteInstance(jquery, input);
  const row = input.closest(request.rule.rowSelector);
  if (
    !instance ||
    !row ||
    (request.catalogMatch && input.value !== request.catalogMatch.query)
  )
    return undefined;
  try {
    jquery(input).autocomplete("search", query);
  } catch {
    return undefined;
  }
  let searchFailure: WriteFailureCode | undefined;
  const match = await waitForExactMenuItem(
    document,
    jquery,
    input,
    request,
    query,
    (code) => {
      searchFailure = code;
    },
  );
  if (
    !match &&
    request.rule.allowDirectInput === true &&
    searchFailure !== "SEARCH_AMBIGUOUS"
  ) {
    const menu = instance.menu?.element?.[0];
    const current = () =>
      input.isConnected &&
      input.getAttribute(JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE) ===
        request.requestId &&
      input.closest(request.rule.rowSelector) === row &&
      autocompleteInstance(jquery, input) === instance;
    if (
      menu &&
      instance.pending === 0 &&
      normalize(instance.term) === normalize(query) &&
      (await selectDirectInput({
        root: menu,
        input,
        query,
        isCurrent: current,
        isConfirmed: () =>
          !!request.rule.confirmation &&
          jquery(input).data(request.rule.confirmation.dataKey) ===
            request.rule.confirmation.value &&
          !visible(menu),
      }))
    ) {
      const scoreReady =
        !request.rule.readySelector ||
        (await waitForExamScore(input, request.rule));
      if (
        scoreReady &&
        current() &&
        input.value === query &&
        !!request.rule.confirmation &&
        jquery(input).data(request.rule.confirmation.dataKey) ===
          request.rule.confirmation.value
      ) {
        return {
          directInput: true,
          selectedValue: query,
          selectedLabel: query,
          selectedCode: String(instance.selectedItem?.id ?? ""),
          evidence: { label: query },
          instance,
          row,
        };
      }
      onFailure?.("EXAM_SCORE_NOT_READY");
      return undefined;
    }
  }
  if (!match && searchFailure) onFailure?.(searchFailure);
  if (
    !match ||
    !input.isConnected ||
    input.getAttribute(JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE) !==
      request.requestId ||
    input.value !== query ||
    input.closest(request.rule.rowSelector) !== row ||
    autocompleteInstance(jquery, input) !== instance ||
    !instance.menu?.element?.[0]?.contains(match.element) ||
    !visible(match.element) ||
    !sameItem(
      jquery(match.element).data("ui-autocomplete-item") as
        JqueryAutocompleteItem | undefined,
      match.item,
      true,
    ) ||
    (request.catalogMatch &&
      !matchesApprovedCatalog(
        request.catalogMatch,
        catalogEvidenceForElement(
          match.element,
          instance.menu.element[0],
          match.evidence.label,
        ),
      ))
  ) {
    return undefined;
  }
  const chosen = { ...match.item };
  const action =
    match.element.querySelector<HTMLElement>(".ui-menu-item-wrapper") ??
    match.element;
  input.focus();
  action.click();
  input.blur();
  const scoreReady =
    !request.rule.readySelector ||
    (await waitForExamScore(input, request.rule));
  const selected = autocompleteInstance(jquery, input)?.selectedItem;
  const selectionConfirmed =
    input.isConnected &&
    input.getAttribute(JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE) ===
      request.requestId &&
    !!request.rule.confirmation &&
    jquery(input).data(request.rule.confirmation.dataKey) ===
      request.rule.confirmation.value &&
    input.closest(request.rule.rowSelector) === row &&
    autocompleteInstance(jquery, input) === instance &&
    sameItem(selected, chosen, true) &&
    selected?.label === chosen.label &&
    selected?.value === chosen.value &&
    input.value === chosen.value;
  if (selectionConfirmed && !scoreReady) onFailure?.("EXAM_SCORE_NOT_READY");
  return scoreReady && selectionConfirmed
    ? {
        selectedValue: input.value,
        selectedLabel: match.evidence.label,
        selectedCode: String(chosen.id ?? ""),
        evidence: match.evidence,
        instance,
        row,
      }
    : undefined;
}

function respond(
  document: Document,
  request: RequestMessage,
  status: "ready" | "confirmed" | "rejected",
  selectedValue?: string,
  failureCode?: WriteFailureCode,
  selection?: {
    selectedLabel: string;
    selectedCode: string;
    evidence: CatalogEvidence;
  },
): void {
  const EventConstructor = document.defaultView?.CustomEvent ?? CustomEvent;
  document.dispatchEvent(
    new EventConstructor(JQUERY_AUTOCOMPLETE_RESPONSE_EVENT, {
      detail: JSON.stringify({
        requestId: request.requestId,
        command: request.command,
        fieldName: request.fieldName,
        status,
        ...(selectedValue !== undefined ? { selectedValue } : {}),
        ...(failureCode ? { failureCode } : {}),
        ...(selection
          ? {
              selectedLabel: selection.selectedLabel,
              selectedCode: selection.selectedCode,
              evidence: selection.evidence,
            }
          : {}),
      }),
    }),
  );
}

export function installJqueryAutocompleteMainBridge(
  document: Document,
  providedJquery?: Jquery,
): () => void {
  const view = document.defaultView;
  const valuesBeforeWrite = new WeakMap<HTMLInputElement, string>();
  const selections = new WeakMap<
    HTMLInputElement,
    {
      directInput?: boolean;
      selectedValue: string;
      selectedLabel: string;
      selectedCode: string;
      evidence: CatalogEvidence;
      instance: JqueryAutocompleteInstance;
      row: Element;
    }
  >();
  const listener = (event: Event) => {
    if (!view) {
      return;
    }
    const request = parseRequest(event);
    if (!request) return;
    const jquery =
      providedJquery ?? (view as Window & { jQuery?: Jquery }).jQuery;
    if (!jquery) {
      respond(document, request, "rejected");
      return;
    }
    const input = markedInput(document, request);
    if (!input || !autocompleteInstance(jquery, input)) {
      respond(document, request, "rejected");
      return;
    }
    if (request.command === "verify") {
      const saved = selections.get(input);
      const selected = autocompleteInstance(jquery, input)?.selectedItem;
      const valid =
        saved &&
        input.closest(request.rule.rowSelector) === saved.row &&
        autocompleteInstance(jquery, input) === saved.instance &&
        !!request.rule.confirmation &&
        jquery(input).data(request.rule.confirmation.dataKey) ===
          request.rule.confirmation.value &&
        input.value === saved.selectedValue &&
        request.selectedValue === saved.selectedValue &&
        request.selectedLabel === saved.selectedLabel &&
        request.selectedCode === saved.selectedCode &&
        (saved.directInput ||
          (selected?.label === saved.selectedLabel &&
            String(selected?.id ?? "") === saved.selectedCode &&
            selected?.value === saved.selectedValue));
      respond(
        document,
        request,
        valid ? "confirmed" : "rejected",
        valid ? input.value : undefined,
        undefined,
        valid ? saved : undefined,
      );
      return;
    }
    if (request.command === "probe") {
      if (request.catalogMatch && input.value.trim()) {
        respond(document, request, "rejected");
        return;
      }
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
    let failureCode: WriteFailureCode = "SEARCH_UNCONFIRMED";
    void confirmSelection(document, jquery, request, (code) => {
      failureCode = code;
    }).then((confirmed) => {
      if (confirmed) selections.set(input, confirmed);
      else selections.delete(input);
      const previousValue = valuesBeforeWrite.get(input);
      valuesBeforeWrite.delete(input);
      if (
        !confirmed &&
        previousValue !== undefined &&
        input.isConnected &&
        input.getAttribute(JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE) ===
          request.requestId &&
        input.value === writtenValue
      ) {
        input.value = previousValue;
        input.blur();
      }
      respond(
        document,
        request,
        confirmed ? "confirmed" : "rejected",
        confirmed?.selectedValue,
        confirmed ? undefined : failureCode,
        confirmed,
      );
    });
  };
  const dismiss = (event: Event) => {
    if (
      !("detail" in event) ||
      typeof event.detail !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(event.detail)
    )
      return;
    const targets = [
      ...document.querySelectorAll<HTMLInputElement>(
        `input[${AUTOCOMPLETE_DISMISS_TARGET}]`,
      ),
    ].filter(
      (input) =>
        input.getAttribute(AUTOCOMPLETE_DISMISS_TARGET) === event.detail,
    );
    if (targets.length !== 1) return;
    const jquery =
      providedJquery ?? (view as (Window & { jQuery?: Jquery }) | null)?.jQuery;
    if (!jquery) return;
    const input = targets[0]!;
    const instance = autocompleteInstance(jquery, input);
    if (!instance) return;
    // Cancel the delayed search too, so an already queued input event cannot reopen it.
    if (instance.searching !== undefined)
      view?.clearTimeout(instance.searching);
    try {
      jquery(input).autocomplete("close");
    } catch {
      /* Optional presentation cleanup. */
    }
  };
  document.addEventListener(AUTOCOMPLETE_DISMISS_EVENT, dismiss);
  document.addEventListener(JQUERY_AUTOCOMPLETE_REQUEST_EVENT, listener);
  return () => {
    document.removeEventListener(JQUERY_AUTOCOMPLETE_REQUEST_EVENT, listener);
    document.removeEventListener(AUTOCOMPLETE_DISMISS_EVENT, dismiss);
  };
}

/** Dormant until a validated policy request targets a marked input. No site permission expansion. */
export function installPolicyAutocompleteBridge(document: Document): void {
  const view = document.defaultView as
    (Window & { __careerFormJqueryBridge?: boolean }) | null;
  if (!view || view.__careerFormJqueryBridge) return;
  installJqueryAutocompleteMainBridge(document);
  view.__careerFormJqueryBridge = true;
}
