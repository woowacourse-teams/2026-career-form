import {
  runDomPlan,
  evaluatePlanConditions,
  validDomPlan,
  validPlanConditions,
  type DomPlan,
  type PlanCondition,
} from "./action-plan";
export type SyncStep =
  | { op: "IF"; condition: PlanCondition[]; then: SyncStep[] }
  | { op: "ASSERT"; condition: PlanCondition[] }
  | { op: "DOM"; plan: DomPlan }
  | { op: "BRIDGE"; name: string }
  | { op: "RETURN"; value: boolean };
export function validSyncPlan(value: unknown): value is SyncStep[] {
  let count = 0;
  const check = (v: any, depth = 0): boolean =>
    Array.isArray(v) &&
    v.length <= 32 &&
    depth <= 8 &&
    v.every((s) => {
      if (++count > 128 || !s || typeof s !== "object") return false;
      const keys = (allowed: string[]) =>
        Object.keys(s).every((k) => allowed.includes(k));
      if (s.op === "IF")
        return (
          keys(["op", "condition", "then"]) &&
          validPlanConditions(s.condition) &&
          check(s.then, depth + 1)
        );
      if (s.op === "ASSERT")
        return keys(["op", "condition"]) && validPlanConditions(s.condition);
      if (s.op === "DOM") return keys(["op", "plan"]) && validDomPlan(s.plan);
      if (s.op === "BRIDGE")
        return (
          keys(["op", "name"]) &&
          typeof s.name === "string" &&
          /^[a-z][a-zA-Z0-9]{0,63}$/.test(s.name)
        );
      return (
        s.op === "RETURN" &&
        keys(["op", "value"]) &&
        typeof s.value === "boolean"
      );
    });
  return check(value);
}
/** Synchronous execution preserves browser activation for MAIN-world text insertion. */
export function runSyncPlan(
  plan: SyncStep[],
  context: {
    targets: Record<string, HTMLElement | null | undefined>;
    values: Record<string, string>;
    current: () => boolean;
    bridges: Record<string, () => boolean>;
  },
): boolean {
  const passes = (c: PlanCondition[]) =>
    evaluatePlanConditions(c, context.targets, context.values);
  const run = (steps: SyncStep[]): boolean | undefined => {
    for (const s of steps) {
      if (!context.current()) return false;
      if (s.op === "RETURN") return s.value;
      if (s.op === "ASSERT" && !passes(s.condition)) return false;
      if (s.op === "IF" && passes(s.condition)) {
        const result = run(s.then);
        if (result !== undefined) return result;
      }
      if (
        s.op === "DOM" &&
        !runDomPlan(s.plan, context.targets, context.values, context.current)
      )
        return false;
      if (
        s.op === "BRIDGE" &&
        (!Object.hasOwn(context.bridges, s.name) || !context.bridges[s.name]())
      )
        return false;
    }
  };
  try {
    return run(plan) === true && context.current();
  } catch {
    return false;
  }
}
