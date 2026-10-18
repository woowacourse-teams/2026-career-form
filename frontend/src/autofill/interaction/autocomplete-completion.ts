import { executionPolicy } from "../workflow/execution-policy";

export const AUTOCOMPLETE_DISMISS_EVENT = "career-form:autocomplete-dismiss";
export const AUTOCOMPLETE_DISMISS_TARGET = "data-career-form-autocomplete-dismiss";

/** Close only policy-designated menus after the write pass; never select a result. */
export function dismissCompletedAutocomplete(document: Document): void {
  const selector = executionPolicy(document)?.browserPolicy?.completionAutocompleteSelector;
  if (!selector) return;
  for (const input of document.querySelectorAll(selector)) {
    if (!(input instanceof HTMLInputElement) || !input.isConnected) continue;
    const token = crypto.randomUUID();
    input.setAttribute(AUTOCOMPLETE_DISMISS_TARGET, token);
    try {
      const EventType = document.defaultView?.CustomEvent ?? CustomEvent;
      document.dispatchEvent(new EventType(AUTOCOMPLETE_DISMISS_EVENT, { detail: token }));
    } finally {
      input.removeAttribute(AUTOCOMPLETE_DISMISS_TARGET);
    }
  }
}
