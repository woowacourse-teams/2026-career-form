import type { FieldCandidateHandle } from "../../dom/types";
import type { FailureReporter, WriteFailureCode } from "../../write/failure";

import {
  SK_AUTOCOMPLETE_REQUEST_EVENT,
  SK_AUTOCOMPLETE_RESPONSE_EVENT,
  SK_AUTOCOMPLETE_TARGET_ATTRIBUTE,
  matchesSkCatalogField,
  type SkAutocompleteFieldName,
} from "./autocomplete-protocol";
export {
  SK_AUTOCOMPLETE_REQUEST_EVENT,
  SK_AUTOCOMPLETE_RESPONSE_EVENT,
  SK_AUTOCOMPLETE_TARGET_ATTRIBUTE,
  type SkAutocompleteFieldName,
} from "./autocomplete-protocol";
import { catalogApprovalForItem } from "../../profile/catalog-identity";
import { rememberCatalogSelection } from "../../profile/catalog-receipt";
import type {
  ApprovedCatalogMatch,
  CatalogEvidence,
} from "../../profile/catalog-match";
import type { StateDriverContext } from "../workflow";

type BridgeCommand = "probe" | "confirm" | "verify";
type BridgeStatus = "ready" | "confirmed" | "rejected";

interface BridgeMessage {
  requestId: string;
  command?: BridgeCommand;
  fieldName?: SkAutocompleteFieldName;
  status?: BridgeStatus;
  selectedValue?: string;
  selectedLabel?: string;
  selectedCode?: string;
  evidence?: CatalogEvidence;
  catalogMatch?: ApprovedCatalogMatch;
  failureCode?: unknown;
}

const RESPONSE_TIMEOUT_MILLISECONDS = 4_000;
const FAILURE_CODES: ReadonlySet<WriteFailureCode> = new Set([
  "SEARCH_NO_RESULTS",
  "SEARCH_NO_EXACT_MATCH",
  "SEARCH_AMBIGUOUS",
  "SEARCH_TIMEOUT",
  "SEARCH_UNCONFIRMED",
  "EXAM_SCORE_NOT_READY",
]);
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

async function request(
  document: Document,
  handle: FieldCandidateHandle,
  command: BridgeCommand,
  onFailure?: FailureReporter,
  context?: StateDriverContext,
): Promise<boolean> {
  if (
    context?.signal.aborted ||
    (context?.beforeMutation && !(await context.beforeMutation()))
  )
    return false;
  const approval = context
    ? catalogApprovalForItem(context.item)
    : { status: "legacy" as const };
  if (context?.signal.aborted || approval.status === "invalid") return false;
  const input = targetInput(document, handle);
  if (!input || input.hasAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE)) {
    return Promise.resolve(false);
  }
  if (
    approval.status === "selected" &&
    (!matchesSkCatalogField(
      input.name as SkAutocompleteFieldName,
      approval.match,
    ) ||
      (command === "probe"
        ? Boolean(input.value.trim())
        : input.value !== approval.match.query))
  )
    return false;
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
    const finish = (confirmed: boolean, failureCode?: WriteFailureCode) => {
      if (completed) return;
      completed = true;
      view.clearTimeout(timeout);
      document.removeEventListener(SK_AUTOCOMPLETE_RESPONSE_EVENT, onResponse);
      context?.signal.removeEventListener("abort", onAbort);
      if (input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) === requestId) {
        input.removeAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE);
      }
      if (!confirmed && failureCode) onFailure?.(failureCode);
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
      const validContext =
        response.command === command &&
        response.fieldName === input.name &&
        input.isConnected &&
        input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) === requestId;
      let receiptValid = true;
      if (
        validContext &&
        command === "confirm" &&
        response.status === "confirmed" &&
        approval.status === "selected"
      ) {
        const snapshot = response;
        const row = input.closest(".form-item-group");
        receiptValid = Boolean(
          context &&
          snapshot.evidence &&
          typeof snapshot.selectedLabel === "string" &&
          snapshot.evidence.label === snapshot.selectedLabel &&
          (snapshot.evidence.detail === undefined ||
            typeof snapshot.evidence.detail === "string") &&
          typeof snapshot.selectedCode === "string" &&
          rememberCatalogSelection(context.item, {
            element: input,
            evidence: snapshot.evidence,
            verify: () => {
              if (
                !input.isConnected ||
                input.closest(".form-item-group") !== row ||
                input.value !== snapshot.selectedValue ||
                context.signal.aborted
              )
                return false;
              const id = crypto.randomUUID();
              let verified = false;
              const listen = (event: Event) => {
                if (!("detail" in event) || typeof event.detail !== "string")
                  return;
                try {
                  const result = JSON.parse(event.detail) as BridgeMessage;
                  verified =
                    result.requestId === id &&
                    result.command === "verify" &&
                    result.fieldName === input.name &&
                    result.status === "confirmed" &&
                    result.selectedValue === snapshot.selectedValue &&
                    result.selectedLabel === snapshot.selectedLabel &&
                    result.selectedCode === snapshot.selectedCode;
                } catch {
                  verified = false;
                }
              };
              const previous = input.getAttribute(
                SK_AUTOCOMPLETE_TARGET_ATTRIBUTE,
              );
              input.setAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE, id);
              document.addEventListener(SK_AUTOCOMPLETE_RESPONSE_EVENT, listen);
              try {
                dispatchMessage(document, {
                  requestId: id,
                  command: "verify",
                  fieldName: input.name as SkAutocompleteFieldName,
                  selectedValue: snapshot.selectedValue,
                  selectedLabel: snapshot.selectedLabel,
                  selectedCode: snapshot.selectedCode,
                });
              } finally {
                document.removeEventListener(
                  SK_AUTOCOMPLETE_RESPONSE_EVENT,
                  listen,
                );
                if (
                  input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) === id
                ) {
                  if (previous === null)
                    input.removeAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE);
                  else
                    input.setAttribute(
                      SK_AUTOCOMPLETE_TARGET_ATTRIBUTE,
                      previous,
                    );
                }
              }
              return verified;
            },
          }),
        );
      }
      finish(
        receiptValid &&
          response.status === expectedStatus &&
          validContext &&
          (command === "probe" ||
            (typeof response.selectedValue === "string" &&
              input.value === response.selectedValue)),
        validContext &&
          response.status === "rejected" &&
          FAILURE_CODES.has(response.failureCode as WriteFailureCode)
          ? (response.failureCode as WriteFailureCode)
          : undefined,
      );
    };
    const onAbort = () => finish(false);
    document.addEventListener(SK_AUTOCOMPLETE_RESPONSE_EVENT, onResponse);
    context?.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = view.setTimeout(
      () =>
        finish(
          false,
          input.isConnected &&
            input.getAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE) ===
              requestId &&
            input.value === initialValue
            ? "SEARCH_TIMEOUT"
            : "SEARCH_UNCONFIRMED",
        ),
      RESPONSE_TIMEOUT_MILLISECONDS,
    );
    if (
      context?.signal.aborted ||
      (context &&
        JSON.stringify(catalogApprovalForItem(context.item)) !==
          JSON.stringify(approval))
    ) {
      finish(false);
      return;
    }
    dispatchMessage(document, {
      requestId,
      command,
      fieldName: input.name as SkAutocompleteFieldName,
      ...(approval.status === "selected"
        ? { catalogMatch: approval.match }
        : {}),
    });
  });
}

export function isSkAutocompleteBridgeReady(
  document: Document,
  handle: FieldCandidateHandle,
  context?: StateDriverContext,
): Promise<boolean> {
  return request(document, handle, "probe", undefined, context);
}

export function confirmSkAutocomplete(
  document: Document,
  handle: FieldCandidateHandle,
  onFailure?: FailureReporter,
  context?: StateDriverContext,
): Promise<boolean> {
  const previous = queues.get(document) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => request(document, handle, "confirm", onFailure, context));
  queues.set(
    document,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
}
