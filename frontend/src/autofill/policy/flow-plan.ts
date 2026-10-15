import { runDomPlan, validDomPlan, type DomPlan } from "./action-plan";

export type FlowCondition =
  | { fact: string; equals: boolean }
  | { all: FlowCondition[] }
  | { any: FlowCondition[] }
  | { not: FlowCondition }
  | { ref: string }
  | {
      target: string;
      read:
        | "EXISTS"
        | "VALUE"
        | "TEXT"
        | "ATTRIBUTE"
        | "STYLE"
        | "ACTIVE"
        | "MATCHES"
        | "SAME";
      name?: string;
      equals: string;
      trim?: boolean;
    }
  | { value: string; equals: string };
export type FlowTarget = {
  from: string;
  relation: "CLOSEST" | "QUERY" | "PARENT" | "CONTROLLED";
  selector?: string;
  count?: number;
  depth?: number;
};
export type FlowStep =
  | { op: "PIN"; target: string; attributes: string[] }
  | { op: "ASSERT"; condition: FlowCondition }
  | {
      op: "WAIT";
      condition: FlowCondition;
      timeoutMs: number;
      pollMs: number;
      stableTargets?: string[];
    }
  | { op: "IF"; condition: FlowCondition; then: FlowStep[]; else?: FlowStep[] }
  | { op: "DOM"; plan: DomPlan }
  | { op: "DELAY"; ms: number }
  | { op: "RETURN"; value: boolean }
  | { op: "AUTHORIZE" | "CHECKPOINT" }
  | { op: "BRIDGE"; plan: string };
export type FlowProgram = {
  targets: Record<string, FlowTarget>;
  conditions: Record<string, FlowCondition>;
  plans: Record<
    string,
    {
      realm: "LOCAL" | "MAIN";
      timeoutMs: number;
      steps: FlowStep[];
      stopWhen?: FlowCondition;
    }
  >;
};
const name = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z][a-zA-Z0-9]*$/.test(v) && v.length <= 64;
const object = (v: any) => v && typeof v === "object" && !Array.isArray(v);
const text = (v: any) => typeof v === "string" && v.length <= 2000;
const bounded = (v: any) => Number.isInteger(v) && v >= 0 && v <= 10000;
const keys = (v: any, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
export function validFlowProgram(value: unknown): value is FlowProgram {
  const p = value as FlowProgram;
  if (
    !object(p) ||
    !keys(p, ["targets", "conditions", "plans"]) ||
    ![p.targets, p.conditions, p.plans].every(
      (v) =>
        object(v) && Object.keys(v).length <= 32 && Object.keys(v).every(name),
    )
  )
    return false;
  const condition = (c: any, chain: string[] = [], depth = 0): boolean => {
    if (!object(c) || depth > 16) return false;
    if ("fact" in c)
      return (
        keys(c, ["fact", "equals"]) &&
        name(c.fact) &&
        typeof c.equals === "boolean"
      );
    if ("ref" in c)
      return (
        keys(c, ["ref"]) &&
        name(c.ref) &&
        Object.hasOwn(p.conditions, c.ref) &&
        !chain.includes(c.ref) &&
        condition(p.conditions[c.ref], [...chain, c.ref], depth + 1)
      );
    if ("all" in c || "any" in c) {
      const list = c.all ?? c.any;
      return (
        Object.keys(c).length === 1 &&
        Array.isArray(list) &&
        list.length > 0 &&
        list.length <= 16 &&
        list.every((x) => condition(x, chain, depth + 1))
      );
    }
    if ("not" in c)
      return keys(c, ["not"]) && condition(c.not, chain, depth + 1);
    if ("value" in c)
      return keys(c, ["value", "equals"]) && text(c.value) && text(c.equals);
    return (
      keys(c, ["target", "read", "name", "equals", "trim"]) &&
      name(c.target) &&
      [
        "EXISTS",
        "VALUE",
        "TEXT",
        "ATTRIBUTE",
        "STYLE",
        "ACTIVE",
        "MATCHES",
        "SAME",
      ].includes(c.read) &&
      text(c.equals) &&
      (c.trim === undefined || typeof c.trim === "boolean") &&
      (!["ATTRIBUTE", "STYLE", "MATCHES"].includes(c.read) ||
        (text(c.name) && c.name.length > 0))
    );
  };
  for (const [key, t] of Object.entries(p.targets)) {
    if (
      !object(t) ||
      !keys(t, ["from", "relation", "selector", "count", "depth"]) ||
      !name(t.from) ||
      !["CLOSEST", "QUERY", "PARENT", "CONTROLLED"].includes(t.relation)
    )
      return false;
    if (["CLOSEST", "QUERY"].includes(t.relation)) {
      if (!text(t.selector) || !t.selector) return false;
      try {
        if (typeof document !== "undefined")
          document.createDocumentFragment().querySelector(t.selector);
      } catch {
        return false;
      }
    }
    if (
      t.count !== undefined &&
      (!Number.isInteger(t.count) || t.count < 1 || t.count > 8)
    )
      return false;
    if (
      t.depth !== undefined &&
      (!Number.isInteger(t.depth) || t.depth < 1 || t.depth > 8)
    )
      return false;
    let next: string | undefined = key;
    const seen = new Set<string>();
    while (next && Object.hasOwn(p.targets, next)) {
      if (seen.has(next)) return false;
      seen.add(next);
      next = p.targets[next].from;
    }
  }
  let budget = 0;
  const steps = (list: any, realm: string, depth = 0): boolean =>
    Array.isArray(list) &&
    list.length <= 32 &&
    depth <= 8 &&
    list.every((s) => {
      if (++budget > 256 || !object(s)) return false;
      switch (s.op) {
        case "PIN":
          return (
            keys(s, ["op", "target", "attributes"]) &&
            name(s.target) &&
            Array.isArray(s.attributes) &&
            s.attributes.length <= 8 &&
            s.attributes.every(
              (v: unknown) =>
                typeof v === "string" && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v),
            )
          );
        case "ASSERT":
          return keys(s, ["op", "condition"]) && condition(s.condition);
        case "WAIT":
          return (
            keys(s, [
              "op",
              "condition",
              "timeoutMs",
              "pollMs",
              "stableTargets",
            ]) &&
            condition(s.condition) &&
            bounded(s.timeoutMs) &&
            bounded(s.pollMs) &&
            s.pollMs >= 10 &&
            (s.stableTargets === undefined ||
              (Array.isArray(s.stableTargets) &&
                s.stableTargets.length <= 8 &&
                s.stableTargets.every(name)))
          );
        case "IF":
          return (
            keys(s, ["op", "condition", "then", "else"]) &&
            condition(s.condition) &&
            steps(s.then, realm, depth + 1) &&
            (s.else === undefined || steps(s.else, realm, depth + 1))
          );
        case "DOM":
          return keys(s, ["op", "plan"]) && validDomPlan(s.plan);
        case "DELAY":
          return keys(s, ["op", "ms"]) && bounded(s.ms);
        case "RETURN":
          return keys(s, ["op", "value"]) && typeof s.value === "boolean";
        case "AUTHORIZE":
        case "CHECKPOINT":
          return keys(s, ["op"]) && realm === "LOCAL";
        case "BRIDGE":
          return (
            keys(s, ["op", "plan"]) &&
            realm === "LOCAL" &&
            name(s.plan) &&
            Object.hasOwn(p.plans, s.plan) &&
            p.plans[s.plan].realm === "MAIN"
          );
        default:
          return false;
      }
    });
  return (
    Object.values(p.conditions).every((c) => condition(c)) &&
    Object.values(p.plans).every(
      (v) =>
        object(v) &&
        keys(v, ["realm", "timeoutMs", "steps", "stopWhen"]) &&
        ["LOCAL", "MAIN"].includes(v.realm) &&
        bounded(v.timeoutMs) &&
        v.timeoutMs > 0 &&
        (v.stopWhen === undefined || condition(v.stopWhen)) &&
        steps(v.steps, v.realm),
    )
  );
}
export async function runFlowProgram(
  program: FlowProgram,
  planName: string,
  context: {
    targets: Record<string, HTMLElement | null | undefined>;
    values?: Record<string, string>;
    facts?: Record<string, () => boolean>;
    current: () => boolean;
    realm?: "LOCAL" | "MAIN";
    authorize?: () => Promise<boolean>;
    checkpoint?: () => Promise<boolean>;
    bridge?: (plan: string, current: () => boolean) => Promise<boolean>;
  },
): Promise<boolean> {
  const plan = program.plans[planName];
  if (!plan || plan.realm !== (context.realm ?? "LOCAL")) return false;
  const end = Date.now() + plan.timeoutMs;
  let active = true;
  const pins: (() => boolean)[] = [];
  const current = () =>
    active &&
    Date.now() <= end &&
    context.current() &&
    pins.every((check) => check());
  const values = context.values ?? {};
  const expand = (v: string) =>
    v.replace(/\{([a-zA-Z]+)\}/g, (_, k) => {
      if (!Object.hasOwn(values, k)) throw Error("Missing flow value");
      return values[k];
    });
  const target = (key: string, depth = 0): HTMLElement | null => {
    if (depth > 16) return null;
    if (Object.hasOwn(context.targets, key))
      return context.targets[key] ?? null;
    const rule = program.targets[key];
    if (!rule) return null;
    let node = target(rule.from, depth + 1);
    if (!node) return null;
    if (rule.relation === "CLOSEST")
      return node.closest<HTMLElement>(rule.selector!);
    if (rule.relation === "QUERY") {
      const found = node.querySelectorAll<HTMLElement>(rule.selector!);
      return found.length === (rule.count ?? 1) ? found[0] : null;
    }
    if (rule.relation === "PARENT") {
      for (let i = 0; i < (rule.depth ?? 1); i++)
        node = node?.parentElement ?? null;
      return node;
    }
    const id = node.getAttribute("aria-controls");
    if (!id) return null;
    const found = [
      ...node.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
    ].filter((n) => n.id === id);
    return found.length === 1 ? found[0] : null;
  };
  const passes = (c: FlowCondition): boolean => {
    if ("fact" in c) {
      if (!context.facts || !Object.hasOwn(context.facts, c.fact))
        throw Error("Missing flow fact");
      return context.facts[c.fact]() === c.equals;
    }
    if ("ref" in c) return passes(program.conditions[c.ref]);
    if ("all" in c) return c.all.every(passes);
    if ("any" in c) return c.any.some(passes);
    if ("not" in c) return !passes(c.not);
    if ("value" in c) return expand(c.value) === expand(c.equals);
    const node = target(c.target);
    if (c.read === "EXISTS")
      return String(Boolean(node?.isConnected)) === expand(c.equals);
    if (!node?.isConnected) return false;
    const actual =
      c.read === "SAME"
        ? String(node === target(c.equals))
        : c.read === "VALUE"
          ? (node as HTMLInputElement).value
          : c.read === "TEXT"
            ? (node.textContent ?? "")
            : c.read === "ATTRIBUTE"
              ? (node.getAttribute(c.name!) ?? "")
              : c.read === "STYLE"
                ? (node.ownerDocument.defaultView
                    ?.getComputedStyle(node)
                    .getPropertyValue(c.name!) ?? "")
                : c.read === "ACTIVE"
                  ? String(node.ownerDocument.activeElement === node)
                  : String(node.matches(c.name!));
    return (
      (c.trim ? actual.trim() : actual) ===
      (c.read === "SAME" ? "true" : expand(c.equals))
    );
  };
  const stopped = () => plan.stopWhen !== undefined && passes(plan.stopWhen);
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const execute = async (steps: FlowStep[]): Promise<boolean | undefined> => {
    for (const step of steps) {
      if (!current()) return false;
      if (stopped()) return true;
      switch (step.op) {
        case "PIN": {
          const node = target(step.target);
          if (!node?.isConnected) return false;
          const attributes = step.attributes.map(
            (name) => [name, node.getAttribute(name)] as const,
          );
          pins.push(
            () =>
              target(step.target) === node &&
              node.isConnected &&
              attributes.every(
                ([name, value]) => node.getAttribute(name) === value,
              ),
          );
          break;
        }
        case "ASSERT":
          if (!passes(step.condition)) return false;
          break;
        case "RETURN":
          return step.value;
        case "IF": {
          const result = await execute(
            passes(step.condition) ? step.then : (step.else ?? []),
          );
          if (result !== undefined) return result;
          break;
        }
        case "DOM": {
          const names = new Set([
            ...Object.keys(context.targets),
            ...Object.keys(program.targets),
          ]);
          if (
            !runDomPlan(
              step.plan,
              Object.fromEntries([...names].map((n) => [n, target(n)])),
              values,
              current,
            )
          )
            return false;
          break;
        }
        case "DELAY":
          await sleep(Math.min(step.ms, Math.max(0, end - Date.now())));
          break;
        case "AUTHORIZE":
          if (context.authorize && !(await context.authorize())) return false;
          break;
        case "CHECKPOINT":
          if (!context.checkpoint || !(await context.checkpoint()))
            return false;
          break;
        case "BRIDGE":
          if (!context.bridge || !(await context.bridge(step.plan, current)))
            return false;
          break;
        case "WAIT": {
          const stable = (step.stableTargets ?? []).map(
            (n) => [n, target(n)] as const,
          );
          if (stable.some(([, node]) => !node?.isConnected)) return false;
          const deadline = Math.min(end, Date.now() + step.timeoutMs);
          const ready = () => passes(step.condition) || stopped();
          const valid = () =>
            current() && stable.every(([n, node]) => target(n) === node);
          if (!valid()) return false;
          if (ready()) break;
          const doc = Object.values(context.targets).find(
            (node) => node?.isConnected,
          )?.ownerDocument;
          if (!doc?.defaultView) return false;
          const observed = await new Promise<boolean>((resolve) => {
            let done = false;
            const finish = (ok: boolean) => {
              if (done) return;
              done = true;
              observer.disconnect();
              clearTimeout(timer);
              clearInterval(poll);
              resolve(ok);
            };
            const check = () => {
              try {
                if (!valid()) finish(false);
                else if (ready()) finish(true);
              } catch {
                finish(false);
              }
            };
            const observer = new doc.defaultView!.MutationObserver(check);
            const timer = setTimeout(
              () => finish(false),
              Math.max(0, deadline - Date.now()),
            );
            const poll = setInterval(check, step.pollMs);
            observer.observe(doc, {
              subtree: true,
              childList: true,
              attributes: true,
              characterData: true,
            });
            check();
          });
          if (!observed) return false;
          break;
        }
      }
    }
    return undefined;
  };
  try {
    const result = await execute(plan.steps);
    return current() && result === true;
  } catch {
    return false;
  } finally {
    active = false;
  }
}
