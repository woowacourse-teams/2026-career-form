import { runFlowProgram, validFlowProgram } from "../policy/flow-plan";
import { runDomPlan, validDomPlan } from "../policy/action-plan";
import type { ComponentPolicy } from "../policy/component-policy";
import { executionPolicy } from "../workflow/execution-policy";
type EmailContract = {
  labels: string[];
  confirmation: string;
  bridge: ComponentPolicy["emailBridge"];
};
const requestedContracts = new WeakMap<HTMLInputElement, EmailContract>();
function emailContract(input: HTMLInputElement): EmailContract | undefined {
  const policy = executionPolicy(input.ownerDocument)?.componentPolicy;
  return policy?.capabilities.includes("commit")
    ? {
        labels: policy.labels.email,
        confirmation: policy.labels.emailConfirmation,
        bridge: policy.emailBridge,
      }
    : requestedContracts.get(input);
}
function validContract(v: unknown): v is EmailContract {
  if (!v || typeof v !== "object") return false;
  const c = v as EmailContract;
  return (
    Object.keys(c).sort().join() === "bridge,confirmation,labels" &&
    Array.isArray(c.labels) &&
    c.labels.length > 0 &&
    c.labels.length <= 8 &&
    c.labels.every(
      (x) => typeof x === "string" && x.length > 0 && x.length <= 100,
    ) &&
    typeof c.confirmation === "string" &&
    c.confirmation.length > 0 &&
    c.confirmation.length <= 100 &&
    !!c.bridge &&
    validDomPlan(c.bridge.plans?.commit) &&
    validFlowProgram(c.bridge.flow) &&
    !!c.bridge.entrypoints &&
    [c.bridge.entrypoints.acceptance, c.bridge.entrypoints.close].every(
      (n) => typeof n === "string" && c.bridge.flow.plans[n]?.realm === "LOCAL",
    ) &&
    !!c.bridge.ownership &&
    typeof c.bridge.ownership.excludeRows === "boolean" &&
    [c.bridge.ownership.labelCount, c.bridge.ownership.inputCount].every(
      (n) => Number.isInteger(n) && n > 0 && n <= 8,
    ) &&
    Number.isInteger(c.bridge.ackTimeoutMs) &&
    c.bridge.ackTimeoutMs > 0 &&
    c.bridge.ackTimeoutMs <= 10000 &&
    !!c.bridge.selectors &&
    ["field", "input", "row", "label"].every((key) => {
      const selector =
        c.bridge.selectors[key as keyof typeof c.bridge.selectors];
      if (typeof selector !== "string" || !selector || selector.length > 1000)
        return false;
      try {
        document.createDocumentFragment().querySelector(selector);
        return true;
      } catch {
        return false;
      }
    })
  );
}
function ownsEmailField(input: HTMLInputElement): boolean {
  const contract = emailContract(input);
  if (!contract) return false;
  const fieldSelector = emailContract(input)!.bridge.selectors.field;
  const matches = [
    ...input.ownerDocument.querySelectorAll<HTMLInputElement>(
      contract.bridge.selectors.input,
    ),
  ].filter((node) => {
    if (
      contract.bridge.ownership.excludeRows &&
      node.closest(contract.bridge.selectors.row)
    )
      return false;
    const field = node.closest(fieldSelector);
    const labels = field
      ? [...field.querySelectorAll(contract.bridge.selectors.label)].filter(
          (label) => label.closest(fieldSelector) === field,
        )
      : [];
    return (
      labels.length === contract.bridge.ownership.labelCount &&
      contract.labels.includes(
        labels[0].textContent?.replace(/[\s*]/g, "") ?? "",
      )
    );
  });
  return (
    matches.length === contract.bridge.ownership.inputCount &&
    matches.includes(input)
  );
}

const REQUEST = "career-form:components-email-close-request";
const ACK = "career-form:components-email-close-ack";
const COMMIT_REQUEST = "career-form:components-email-commit-request";
const COMMIT_ACK = "career-form:components-email-commit-ack";
const MARKER = "data-career-form-components-email-close";
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
    ownsEmailField(input)
  );
}

function parse(event: Event): Record<string, unknown> | undefined {
  if (
    !("detail" in event) ||
    typeof event.detail !== "string" ||
    event.detail.length > 64000
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

// MAIN world: bounded policy DOM operations. Requests carry
// a nonce and bounded declarative selectors/labels, never field values or executable code.
export function installComponentEmailCloseBridge(doc: Document): void {
  if (installed.has(doc)) return;
  installed.add(doc);
  const consumed = new Map<string, number>();
  const receive = (event: Event) => {
    const committing = event.type === COMMIT_REQUEST;
    const request = parse(event);
    const nonce = request?.nonce;
    if (
      !request ||
      Object.keys(request).sort().join() !==
        (committing ? "contract,nonce" : "contract,nonce,plan") ||
      !validContract(request.contract) ||
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
    if (input instanceof HTMLInputElement)
      requestedContracts.set(input, request.contract as EmailContract);
    if (
      marked.length !== 1 ||
      !(input instanceof HTMLInputElement) ||
      input.getAttribute(MARKER) !== nonce ||
      !validInput(input) ||
      (!committing &&
        (typeof request.plan !== "string" ||
          emailContract(input)?.bridge.flow.plans[request.plan]?.realm !==
            "MAIN")) ||
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
        if (
          !runDomPlan(
            emailContract(input)!.bridge.plans.commit,
            { input, body: doc.body },
            { value },
            writable,
          )
        ) {
          respond(false);
          return;
        }
        // Keep focus while Component forms processes the popup's delayed autofocus.
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
    void runFlowProgram(
      emailContract(input)!.bridge.flow,
      request.plan as string,
      {
        targets: { input, body: doc.body },
        values: { value },
        current: unchanged,
        realm: "MAIN",
      },
    ).then((ok) => respond(ok && unchanged()));
  };
  doc.addEventListener(REQUEST, receive);
  doc.addEventListener(COMMIT_REQUEST, receive);
}

async function requestComponentFlow(
  input: HTMLInputElement,
  plan: string,
  current: () => boolean,
): Promise<boolean> {
  if (!current() || !validInput(input) || input.hasAttribute(MARKER))
    return false;
  const doc = input.ownerDocument,
    url = doc.URL,
    nonce = crypto.randomUUID(),
    value = input.value,
    controls = input.getAttribute("aria-controls");
  const valid = () =>
    current() &&
    doc.URL === url &&
    validInput(input) &&
    input.value === value &&
    input.getAttribute("aria-controls") === controls &&
    input.getAttribute(MARKER) === nonce;
  input.setAttribute(MARKER, nonce);
  try {
    const acknowledged = await new Promise<boolean>((resolve) => {
      let finished = false;
      const finish = (ok: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearInterval(check);
        doc.removeEventListener(ACK, ack);
        resolve(ok);
      };
      const ack = (event: Event) => {
        const r = parse(event);
        if (
          r?.nonce === nonce &&
          typeof r.ok === "boolean" &&
          Object.keys(r).sort().join() === "nonce,ok"
        )
          finish(r.ok);
      };
      const timer = setTimeout(
        () => finish(false),
        emailContract(input)!.bridge.ackTimeoutMs,
      );
      const check = setInterval(() => {
        if (!valid()) finish(false);
      }, 50);
      doc.addEventListener(ACK, ack);
      if (valid())
        dispatch(doc, REQUEST, { nonce, contract: emailContract(input), plan });
      else finish(false);
    });
    return acknowledged && valid();
  } finally {
    if (input.getAttribute(MARKER) === nonce) input.removeAttribute(MARKER);
  }
}
export function executeComponentFlow(
  input: HTMLInputElement,
  plan: string,
  current: () => boolean,
  authorize?: () => Promise<boolean>,
): Promise<boolean> {
  const contract = emailContract(input);
  if (!contract || !validInput(input)) return Promise.resolve(false);
  const value = input.value,
    url = input.ownerDocument.URL;
  return runFlowProgram(contract.bridge.flow, plan, {
    targets: { input, body: input.ownerDocument.body },
    values: { value },
    current: () =>
      current() &&
      input.ownerDocument.URL === url &&
      validInput(input) &&
      input.value === value,
    authorize,
    bridge: (name, guard) => requestComponentFlow(input, name, guard),
  });
}
export function closeComponentEmailPopup(
  input: HTMLInputElement,
  current: () => boolean,
): Promise<boolean> {
  const name = emailContract(input)?.bridge.entrypoints.close;
  return name
    ? executeComponentFlow(input, name, current)
    : Promise.resolve(false);
}

/** A synchronous request with bounded display-label data commits the value already staged in the
 * exact input. A missing or deferred MAIN response never counts as success. */
export function commitComponentEmailInput(
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
    dispatch(doc, COMMIT_REQUEST, { nonce, contract: emailContract(input) });
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

/** Compatibility entry point; the acceptance condition and wait are policy data. */
export function waitForComponentEmailAcceptance(
  input: HTMLInputElement,
  current: () => boolean,
): Promise<boolean> {
  const name = emailContract(input)?.bridge.entrypoints.acceptance;
  return name
    ? executeComponentFlow(input, name, current)
    : Promise.resolve(false);
}
