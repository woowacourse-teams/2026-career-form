import type { FieldCandidateHandle } from "../../dom/types";

export const SK_AUTOCOMPLETE_REQUEST_EVENT =
  "career-form:sk-autocomplete-request";
export const SK_AUTOCOMPLETE_RESPONSE_EVENT =
  "career-form:sk-autocomplete-response";
export const SK_AUTOCOMPLETE_TARGET_ATTRIBUTE =
  "data-career-form-sk-autocomplete-target";

export type SkAutocompleteFieldName =
  "eduEducationName" | "cerCertName" | "lngExamName";

type BridgeCommand = "probe" | "confirm";
type BridgeStatus = "ready" | "confirmed" | "rejected";

interface BridgeMessage {
  requestId: string;
  command?: BridgeCommand;
  fieldName?: SkAutocompleteFieldName;
  status?: BridgeStatus;
}

const RESPONSE_TIMEOUT_MILLISECONDS = 4_000;
const queues = new WeakMap<Document, Promise<void>>();

function targetInput(
  document: Document,
  handle: FieldCandidateHandle,
): HTMLInputElement | undefined {
  if (
    document.location.host !== "www.skcareers.com" ||
    !document.location.pathname.startsWith("/Application/Index/") ||
    handle.candidate.element !== "input" ||
    handle.candidate.control !== "text" ||
    handle.elements.length !== 1
  ) {
    return undefined;
  }
  const input = handle.elements[0];
  const name = handle.candidate.domName;
  if (
    !(input instanceof HTMLInputElement) ||
    !input.isConnected ||
    input.ownerDocument !== document ||
    input.name !== name
  ) {
    return undefined;
  }
  const rows: Record<SkAutocompleteFieldName, string> = {
    eduEducationName: ".form-item-group.educationUniv-item",
    cerCertName: ".form-item-group.cert-Item",
    lngExamName: ".form-item-group.langExam-Item",
  };
  if (!(name && Object.hasOwn(rows, name))) return undefined;
  const fieldName = name as SkAutocompleteFieldName;
  return input.closest(rows[fieldName]) ? input : undefined;
}

function dispatchMessage(document: Document, message: BridgeMessage): void {
  const EventConstructor = document.defaultView?.CustomEvent ?? CustomEvent;
  document.dispatchEvent(
    new EventConstructor(SK_AUTOCOMPLETE_REQUEST_EVENT, {
      detail: JSON.stringify(message),
    }),
  );
}

function request(
  document: Document,
  handle: FieldCandidateHandle,
  command: BridgeCommand,
): Promise<boolean> {
  const input = targetInput(document, handle);
  if (!input || input.hasAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE)) {
    return Promise.resolve(false);
  }
  const initialValue = input.value;
  if (command === "confirm" && !initialValue.trim()) {
    return Promise.resolve(false);
  }
  const requestId = crypto.randomUUID();
  input.setAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE, requestId);

  return new Promise((resolve) => {
    const view = document.defaultView;
    if (!view) {
      input.removeAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE);
      resolve(false);
      return;
    }
    let completed = false;
    const finish = (confirmed: boolean) => {
      if (completed) return;
      completed = true;
      view.clearTimeout(timeout);
      document.removeEventListener(SK_AUTOCOMPLETE_RESPONSE_EVENT, onResponse);
      if (input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) === requestId) {
        input.removeAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE);
      }
      resolve(confirmed);
    };
    const onResponse = (event: Event) => {
      if (!("detail" in event) || typeof event.detail !== "string") {
        return;
      }
      let response: BridgeMessage;
      try {
        const parsed: unknown = JSON.parse(event.detail);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          return;
        }
        response = parsed as BridgeMessage;
      } catch {
        return;
      }
      if (response.requestId !== requestId) return;
      const expectedStatus = command === "probe" ? "ready" : "confirmed";
      finish(
        response.status === expectedStatus &&
          response.command === command &&
          response.fieldName === input.name &&
          input.isConnected &&
          input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) === requestId &&
          (command === "probe" || input.value === initialValue),
      );
    };
    document.addEventListener(SK_AUTOCOMPLETE_RESPONSE_EVENT, onResponse);
    const timeout = view.setTimeout(
      () => finish(false),
      RESPONSE_TIMEOUT_MILLISECONDS,
    );
    dispatchMessage(document, {
      requestId,
      command,
      fieldName: input.name as SkAutocompleteFieldName,
    });
  });
}

export function isSkAutocompleteBridgeReady(
  document: Document,
  handle: FieldCandidateHandle,
): Promise<boolean> {
  return request(document, handle, "probe");
}

export function confirmSkAutocomplete(
  document: Document,
  handle: FieldCandidateHandle,
): Promise<boolean> {
  const previous = queues.get(document) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => request(document, handle, "confirm"));
  queues.set(
    document,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
}
