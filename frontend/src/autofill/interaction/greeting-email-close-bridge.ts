import { greetingSyntheticDomName } from "../adapters/greeting/collection";

const REQUEST = "career-form:greeting-email-close-request";
const ACK = "career-form:greeting-email-close-ack";
const COMMIT_REQUEST = "career-form:greeting-email-commit-request";
const COMMIT_ACK = "career-form:greeting-email-commit-ack";
const MARKER = "data-career-form-greeting-email-close";
const installed = new WeakSet<Document>();

function validInput(input: HTMLInputElement): boolean {
  const style = input.ownerDocument.defaultView?.getComputedStyle(input);
  return (
    input.isConnected &&
    !input.disabled &&
    !input.readOnly &&
    ["email", "text"].includes(input.type) &&
    !input.closest('[hidden], [inert], [aria-hidden="true"]') &&
    style?.display !== "none" &&
    style?.visibility !== "hidden" &&
    greetingSyntheticDomName(input) === "basicInformation.email"
  );
}

function confirmationButton(
  input: HTMLInputElement,
): HTMLButtonElement | undefined {
  const field = input.closest('div[data-scope="field"][data-part="root"]');
  const buttons = field?.querySelectorAll("button");
  const button = buttons?.[0];
  if (
    !field ||
    buttons?.length !== 1 ||
    !(button instanceof HTMLButtonElement) ||
    button.type !== "button" ||
    button.textContent?.trim() !== "이메일 확인" ||
    button.closest('[data-scope="field"][data-part="root"]') !== field
  )
    return;
  return button;
}
function confirmationReady(input: HTMLInputElement): boolean {
  const button = confirmationButton(input);
  if (
    !button ||
    !button.isConnected ||
    button.disabled ||
    button.getAttribute("aria-disabled") === "true" ||
    button.closest("[hidden], [inert]") ||
    button.parentElement?.closest('[aria-hidden="true"]') ||
    // Greeting marks this visible button aria-hidden while its popup is open.
    // It is only an acceptance signal; this bridge never clicks the button.
    (button.getAttribute("aria-hidden") === "true" && !exactPopup(input))
  )
    return false;
  const style = input.ownerDocument.defaultView?.getComputedStyle(button);
  return style?.display !== "none" && style?.visibility !== "hidden";
}

function exactPopup(input: HTMLInputElement): boolean {
  const id = input.getAttribute("aria-controls");
  if (!id || input.getAttribute("aria-expanded") !== "true") return false;
  const matches = [...input.ownerDocument.querySelectorAll("[id]")].filter(
    (node) => node.id === id,
  );
  const popup = matches[0];
  return (
    matches.length === 1 &&
    !!popup?.matches(
      'div[role="presentation"][data-scope="scroll-area"][data-part="viewport"]',
    ) &&
    !!popup.parentElement?.matches(
      'div[data-scope="scroll-area"][data-part="root"]',
    )
  );
}

function parse(event: Event): Record<string, unknown> | undefined {
  if (
    !("detail" in event) ||
    typeof event.detail !== "string" ||
    event.detail.length > 256
  )
    return;
  try {
    const value: unknown = JSON.parse(event.detail);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return;
  }
}
function dispatch(doc: Document, name: string, detail: object): void {
  const event = doc.createEvent("CustomEvent");
  event.initCustomEvent(name, false, false, JSON.stringify(detail));
  doc.dispatchEvent(event);
}

// MAIN world: fixed email activation/commit/dismissal actions. Requests carry
// only a nonce, never field values, selectors, callbacks, or executable code.
export function installGreetingEmailCloseBridge(doc: Document): void {
  if (installed.has(doc)) return;
  installed.add(doc);
  const consumed = new Map<string, number>();
  const receive = (event: Event) => {
    const committing = event.type === COMMIT_REQUEST;
    const request = parse(event);
    const nonce = request?.nonce;
    if (
      !request ||
      Object.keys(request).join() !== "nonce" ||
      typeof nonce !== "string" ||
      !/^[0-9a-f-]{36}$/.test(nonce)
    )
      return;
    const now = Date.now();
    for (const [key, time] of consumed)
      if (now - time > 60_000) consumed.delete(key);
    const respond = (ok: boolean) =>
      dispatch(doc, committing ? COMMIT_ACK : ACK, {
        nonce,
        ok,
      });
    if (consumed.has(nonce) || consumed.size >= 256) {
      respond(false);
      return;
    }
    consumed.set(nonce, now);
    const marked = doc.querySelectorAll(`[${MARKER}]`);
    const input = marked[0];
    if (
      marked.length !== 1 ||
      !(input instanceof HTMLInputElement) ||
      input.getAttribute(MARKER) !== nonce ||
      !validInput(input) ||
      (!committing && (!exactPopup(input) || !confirmationReady(input))) ||
      !doc.body
    ) {
      respond(false);
      return;
    }
    const url = doc.URL;
    if (committing) {
      const value = input.value;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (
        !value ||
        !setter ||
        typeof doc.execCommand !== "function" ||
        (input.maxLength >= 0 && value.length > input.maxLength)
      ) {
        respond(false);
        return;
      }
      try {
        // Activation and value events share one MAIN call stack. The value was
        // staged only in this exact input by the approved isolated writer.
        const writable = () =>
          doc.URL === url &&
          validInput(input) &&
          (input.maxLength < 0 || value.length <= input.maxLength) &&
          (input.value === "" || input.value === value);
        // Greeting captures the initial input state on focus. The isolated
        // staging value must not become that baseline before MAIN emits input.
        setter.call(input, "");
        if (!writable() || input.value !== "") {
          respond(false);
          return;
        }
        input.focus();
        if (!writable()) {
          respond(false);
          return;
        }
        input.click();
        if (!writable()) {
          respond(false);
          return;
        }
        // insertText uses the browser's editing path and its own input event.
        // Never insert into another element if a focus/click handler redirected focus.
        if (
          doc.activeElement !== input ||
          input.value !== "" ||
          !doc.execCommand("insertText", false, value) ||
          doc.URL !== url ||
          !validInput(input) ||
          input.value !== value
        ) {
          respond(false);
          return;
        }
        // Keep focus while Greeting processes the popup's delayed autofocus.
        // Blurring here can discard acceptance on a focused page; dismiss only
        // after the isolated writer observes the owned confirmation button.
        respond(doc.URL === url && validInput(input) && input.value === value);
      } catch {
        respond(false);
      }
      return;
    }
    const controls = input.getAttribute("aria-controls");
    const value = input.value;
    const unchanged = () =>
      doc.URL === url &&
      validInput(input) &&
      input.getAttribute(MARKER) === nonce &&
      input.value === value &&
      input.getAttribute("aria-controls") === controls;
    let finished = false;
    let timer: ReturnType<typeof setTimeout>;
    let dismissal: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      if (input.getAttribute("aria-expanded") === "false") finish(true);
    });
    const finish = (closed: boolean) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(dismissal);
      respond(
        closed &&
          unchanged() &&
          input.getAttribute("aria-expanded") === "false",
      );
    };
    observer.observe(input, {
      attributes: true,
      attributeFilter: ["aria-expanded"],
    });
    timer = setTimeout(() => finish(false), 800);
    try {
      // Greeting ignores outside-pointer dismissal while this input has focus.
      // Acceptance was already checked; blur may close the popup by itself.
      input.blur();
      if (!unchanged()) {
        finish(false);
        return;
      }
      if (input.getAttribute("aria-expanded") === "false") {
        finish(true);
        return;
      }
      // Let Greeting process blur before sending the outside pointer event.
      dismissal = setTimeout(() => {
        if (finished) return;
        try {
          if (
            !unchanged() ||
            doc.activeElement === input ||
            !exactPopup(input) ||
            !confirmationReady(input) ||
            !doc.body
          ) {
            finish(false);
            return;
          }
          doc.body.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true, composed: true }),
          );
          if (input.getAttribute("aria-expanded") === "false") finish(true);
        } catch {
          finish(false);
        }
      }, 0);
    } catch {
      finish(false);
    }
  };
  doc.addEventListener(REQUEST, receive);
  doc.addEventListener(COMMIT_REQUEST, receive);
}

export async function closeGreetingEmailPopup(
  input: HTMLInputElement,
  current: () => boolean,
): Promise<boolean> {
  if (
    !current() ||
    !validInput(input) ||
    !exactPopup(input) ||
    !confirmationReady(input) ||
    input.hasAttribute(MARKER)
  )
    return false;
  const doc = input.ownerDocument;
  const url = doc.URL;
  const nonce = crypto.randomUUID();
  const value = input.value;
  const controls = input.getAttribute("aria-controls");
  input.setAttribute(MARKER, nonce);
  try {
    const acknowledged = await new Promise<boolean>((resolve) => {
      let settling: ReturnType<typeof setTimeout> | undefined;
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        clearTimeout(settling);
        doc.removeEventListener(ACK, ack);
        resolve(ok);
      };
      const ack = (event: Event) => {
        const response = parse(event);
        if (
          response?.nonce !== nonce ||
          typeof response.ok !== "boolean" ||
          Object.keys(response).sort().join() !== "nonce,ok"
        )
          return;
        finish(response.ok);
      };
      const timer = setTimeout(() => finish(false), 1000);
      doc.addEventListener(ACK, ack);
      // The button can be ready before Greeting's popup dismissal handler.
      // This bounded interval was verified on the installed extension path.
      settling = setTimeout(() => {
        if (
          !current() ||
          doc.URL !== url ||
          !validInput(input) ||
          input.getAttribute(MARKER) !== nonce ||
          input.value !== value ||
          input.getAttribute("aria-controls") !== controls ||
          !exactPopup(input) ||
          !confirmationReady(input)
        ) {
          finish(false);
          return;
        }
        dispatch(doc, REQUEST, { nonce });
      }, 150);
    });
    return (
      acknowledged &&
      current() &&
      doc.URL === url &&
      validInput(input) &&
      input.getAttribute(MARKER) === nonce &&
      input.value === value &&
      input.getAttribute("aria-controls") === controls &&
      input.getAttribute("aria-expanded") === "false"
    );
  } finally {
    if (input.getAttribute(MARKER) === nonce) input.removeAttribute(MARKER);
  }
}

/** A nonce-only synchronous request commits the value already staged in the
 * exact input. A missing or deferred MAIN response never counts as success. */
export function commitGreetingEmailInput(
  input: HTMLInputElement,
  current: () => boolean,
): boolean {
  if (!current() || !validInput(input) || input.hasAttribute(MARKER))
    return false;
  const doc = input.ownerDocument;
  const url = doc.URL;
  const nonce = crypto.randomUUID();
  const value = input.value;
  let acknowledged = false;
  const ack = (event: Event) => {
    const result = parse(event);
    if (
      result?.nonce === nonce &&
      Object.keys(result).sort().join() === "nonce,ok"
    )
      acknowledged = result.ok === true;
  };
  input.setAttribute(MARKER, nonce);
  doc.addEventListener(COMMIT_ACK, ack);
  try {
    dispatch(doc, COMMIT_REQUEST, { nonce });
    return (
      acknowledged &&
      current() &&
      doc.URL === url &&
      validInput(input) &&
      input.value === value
    );
  } finally {
    doc.removeEventListener(COMMIT_ACK, ack);
    if (input.getAttribute(MARKER) === nonce) input.removeAttribute(MARKER);
  }
}

/** Observe the site's committed state rather than guessing a debounce duration. */
export async function waitForGreetingEmailAcceptance(
  input: HTMLInputElement,
  current: () => boolean,
): Promise<boolean> {
  const button = confirmationButton(input);
  const value = input.value;
  const valid = () =>
    current() &&
    validInput(input) &&
    input.value === value &&
    confirmationButton(input) === button;
  if (!button || !value || !valid()) return false;
  if (confirmationReady(input)) return true;
  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean) => {
      observer.disconnect();
      clearTimeout(deadline);
      clearInterval(contextCheck);
      resolve(ok);
    };
    const check = () => {
      if (!valid()) finish(false);
      else if (confirmationReady(input)) finish(true);
    };
    const observer = new MutationObserver(check);
    observer.observe(input.ownerDocument, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    const deadline = setTimeout(() => finish(false), 3000);
    // Context invalidation and DOM property changes need not emit mutations.
    const contextCheck = setInterval(check, 50);
    check();
  });
}
