import { normalizeDisplayName } from "../write/display-name";
/** Bounded DOM operations. Policies supply order and targets, never JavaScript. */
export type PlanCondition = {
  target: string;
  read: "VALUE" | "ATTRIBUTE" | "ACTIVE" | "MATCHES" | "NONEMPTY";
  name?: string;
  equals: string;
  normalize?: "TRIM_COLLAPSE" | "NFKC_COLLAPSE" | "DISPLAY";
};
export type DomStep = {
  target: string;
  op:
    | "SET_VALUE"
    | "FOCUS"
    | "BLUR"
    | "CLICK"
    | "ACTIVATE_PRIMARY"
    | "INSERT_TEXT"
    | "EVENT"
    | "KEY"
    | "POINTER"
    | "SET_ATTRIBUTE"
    | "REMOVE_ATTRIBUTE"
    | "CLASS";
  value?: string;
  event?: string;
  key?: string;
  code?: string;
  legacyEnter?: true;
  name?: string;
  composed?: boolean;
  when?: PlanCondition[];
  require?: PlanCondition[];
};
export type DomPlan = DomStep[];
export function validDomPlan(value: unknown): value is DomPlan {
  if (!Array.isArray(value) || value.length > 32) return false;
  const condition = (v: any) =>
    v &&
    typeof v.target === "string" &&
    /^[a-z][a-zA-Z0-9]*$/.test(v.target) &&
    ["VALUE", "ATTRIBUTE", "ACTIVE", "MATCHES", "NONEMPTY"].includes(v.read) &&
    typeof v.equals === "string" &&
    v.equals.length <= 1000 &&
    (v.normalize === undefined ||
      ["TRIM_COLLAPSE", "NFKC_COLLAPSE", "DISPLAY"].includes(v.normalize)) &&
    (!["ATTRIBUTE", "MATCHES"].includes(v.read) ||
      (typeof v.name === "string" && v.name.length > 0)) &&
    Object.keys(v).every((k) =>
      ["target", "read", "name", "equals", "normalize"].includes(k),
    ) &&
    (v.name === undefined ||
      (typeof v.name === "string" && v.name.length <= 1000));
  return value.every(
    (s: any) =>
      s &&
      typeof s.target === "string" &&
      /^[a-z][a-zA-Z0-9]*$/.test(s.target) &&
      [
        "SET_VALUE",
        "FOCUS",
        "BLUR",
        "CLICK",
        "ACTIVATE_PRIMARY",
        "INSERT_TEXT",
        "EVENT",
        "KEY",
        "POINTER",
        "SET_ATTRIBUTE",
        "REMOVE_ATTRIBUTE",
        "CLASS",
      ].includes(s.op) &&
      (s.op !== "ACTIVATE_PRIMARY" ||
        Object.keys(s).every((k) =>
          ["op", "target", "when", "require"].includes(k),
        )) &&
      (s.value === undefined ||
        (typeof s.value === "string" && s.value.length <= 1000)) &&
      (s.event === undefined ||
        [
          "input",
          "change",
          "keydown",
          "keyup",
          "keypress",
          "pointerdown",
          "pointerup",
        ].includes(s.event)) &&
      (s.key === undefined ||
        (typeof s.key === "string" && s.key.length <= 40)) &&
      (s.name === undefined ||
        (typeof s.name === "string" &&
          /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s.name))) &&
      (s.code === undefined ||
        (typeof s.code === "string" && s.code.length <= 40)) &&
      (s.legacyEnter === undefined ||
        (s.legacyEnter === true &&
          s.op === "KEY" &&
          s.event === "keypress" &&
          s.key === "Enter" &&
          s.code === "Enter")) &&
      (s.event !== "keypress" || s.legacyEnter === true) &&
      (s.composed === undefined || typeof s.composed === "boolean") &&
      [s.when, s.require].every(
        (list) =>
          list === undefined ||
          (Array.isArray(list) && list.length <= 8 && list.every(condition)),
      ) &&
      (!(s.op === "KEY" || s.op === "EVENT" || s.op === "POINTER") ||
        typeof s.event === "string") &&
      (s.op !== "KEY" || typeof s.key === "string") &&
      (!["SET_ATTRIBUTE", "REMOVE_ATTRIBUTE", "CLASS"].includes(s.op) ||
        typeof s.name === "string") &&
      (!["SET_VALUE", "SET_ATTRIBUTE", "INSERT_TEXT", "CLASS"].includes(s.op) ||
        typeof s.value === "string") &&
      Object.keys(s).every((k) =>
        [
          "target",
          "op",
          "value",
          "event",
          "key",
          "code",
          "composed",
          "legacyEnter",
          "when",
          "require",
          "name",
        ].includes(k),
      ),
  );
}
export function runDomPlan(
  plan: DomPlan,
  targets: Record<string, HTMLElement | undefined | null>,
  values: Record<string, string>,
  current: () => boolean,
): boolean {
  const expand = (text = "") =>
    text.replace(/\{([a-zA-Z]+)\}/g, (_, key) =>
      Object.hasOwn(values, key)
        ? values[key]
        : (() => {
            throw new Error("Missing plan value");
          })(),
    );
  const passes = (conditions: PlanCondition[] = []) =>
    evaluatePlanConditions(conditions, targets, values);

  try {
    for (const step of plan) {
      if (!current()) return false;
      if (!passes(step.when)) continue;
      const node = targets[step.target];
      if (!node?.isConnected || !passes(step.require)) return false;
      switch (step.op) {
        case "SET_VALUE": {
          const prototype =
            node instanceof HTMLInputElement
              ? HTMLInputElement.prototype
              : node instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : undefined;
          const setter =
            prototype &&
            Object.getOwnPropertyDescriptor(prototype, "value")?.set;
          if (!setter) return false;
          setter.call(node, expand(step.value));
          break;
        }
        case "SET_ATTRIBUTE":
          if (!step.name) return false;
          node.setAttribute(step.name, expand(step.value));
          break;
        case "REMOVE_ATTRIBUTE":
          if (!step.name) return false;
          node.removeAttribute(step.name);
          break;
        case "CLASS":
          if (!step.name) return false;
          node.classList.toggle(step.name, expand(step.value) === "true");
          break;
        case "FOCUS":
          node.focus();
          break;
        case "BLUR":
          node.blur();
          break;
        case "CLICK":
          node.click();
          break;
        case "ACTIVATE_PRIMARY": {
          if (
            !validDomPlan([step]) ||
            !(node instanceof HTMLButtonElement) ||
            node.type !== "button"
          )
            return false;
          const events = primaryActivationEvents(node);
          if (!events) return false;
          for (const dispatch of events) {
            if (!current() || !dispatch()) return false;
          }
          break;
        }
        case "INSERT_TEXT":
          if (
            node.ownerDocument.activeElement !== node ||
            !node.ownerDocument.execCommand(
              "insertText",
              false,
              expand(step.value),
            )
          )
            return false;
          break;
        case "KEY": {
          if (!validDomPlan([step])) return false;
          const event = new KeyboardEvent(step.event!, {
            key: step.key,
            ...(step.code ? { code: step.code } : {}),
            bubbles: true,
            cancelable: step.legacyEnter === true,
          });
          if (step.legacyEnter) {
            Object.defineProperties(event, {
              keyCode: { get: () => 13 },
              which: { get: () => 13 },
            });
          }
          node.dispatchEvent(event);
          break;
        }
        case "POINTER":
          node.dispatchEvent(
            new PointerEvent(step.event!, {
              bubbles: true,
              composed: step.composed ?? false,
            }),
          );
          break;
        case "EVENT":
          node.dispatchEvent(new Event(step.event!, { bubbles: true }));
          break;
      }
      if (!current()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function evaluatePlanConditions(
  conditions: PlanCondition[],
  targets: Record<string, HTMLElement | undefined | null>,
  values: Record<string, string>,
): boolean {
  const expand = (text: string) =>
    text.replace(/\{([a-zA-Z]+)\}/g, (_, key) =>
      Object.hasOwn(values, key)
        ? values[key]
        : (() => {
            throw new Error("Missing plan value");
          })(),
    );
  return conditions.every((c) => {
    const node = targets[c.target];
    if (!node?.isConnected) return false;
    const actual =
      c.read === "NONEMPTY"
        ? String(Boolean((node as HTMLInputElement).value?.trim()))
        : c.read === "VALUE"
          ? (node as HTMLInputElement).value
          : c.read === "ACTIVE"
            ? String(node.ownerDocument.activeElement === node)
            : c.read === "MATCHES"
              ? String(node.matches(c.name ?? "*"))
              : (node.getAttribute(c.name ?? "") ?? "");
    const normalize = (value: string) =>
      c.normalize === "DISPLAY"
        ? normalizeDisplayName(value)
        : c.normalize === "NFKC_COLLAPSE"
          ? value.normalize("NFKC").replace(/\s+/g, " ").trim()
          : c.normalize === "TRIM_COLLAPSE"
            ? value.replace(/\s+/g, " ").trim()
            : value;
    return normalize(actual) === normalize(expand(c.equals));
  });
}

export function validPlanConditions(value: unknown): value is PlanCondition[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    validDomPlan([{ op: "FOCUS", target: "control", require: value }])
  );
}

/** The async address owner revalidates profile approval before EACH synthetic event. */
export async function activateOwnedPrimary(
  node: HTMLButtonElement,
  current: () => Promise<boolean>,
): Promise<boolean> {
  const events = primaryActivationEvents(node);
  if (!events) return false;
  for (const dispatch of events)
    if (!(await current()) || !dispatch()) return false;
  return true;
}
function primaryActivationEvents(
  node: HTMLButtonElement,
): (() => boolean)[] | undefined {
  const rect = node.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2,
    clientY = rect.top + rect.height / 2;
  if (
    !(rect.width > 0 && rect.height > 0) ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY)
  )
    return;
  return ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].map(
    (type) => () => {
      if (
        !node.isConnected ||
        node.type !== "button" ||
        node.matches(":disabled") ||
        node.closest('[hidden],[inert],[aria-hidden="true"]')
      )
        return false;
      const now = node.getBoundingClientRect();
      if (
        now.left !== rect.left ||
        now.top !== rect.top ||
        now.width !== rect.width ||
        now.height !== rect.height
      )
        return false;
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: type.endsWith("down") ? 1 : 0,
        clientX,
        clientY,
        detail: 1,
      };
      node.dispatchEvent(
        type.startsWith("pointer")
          ? new PointerEvent(type, {
              ...init,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
            })
          : new MouseEvent(type, init),
      );
      return true;
    },
  );
}
