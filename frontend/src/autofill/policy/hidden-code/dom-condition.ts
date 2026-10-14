// Bounded DOM checks. Policies declare relationships, never JavaScript expressions.
export interface DomStep {
  query?: string;
  closest?: string;
  parent?: boolean;
}
export type DomCondition =
  | { all: DomCondition[] }
  | { any: DomCondition[] }
  | {
      path: DomStep[];
      minCount?: number;
      maxCount?: number;
      enabled?: boolean;
      required?: boolean;
      value?: string;
      nonEmpty?: boolean;
      text?: string;
      attributes?: Record<string, string>;
      attributePatterns?: Record<string, string>;
    };
export function evaluateDomCondition(
  root: Element,
  rule: DomCondition,
): boolean {
  if ("all" in rule)
    return rule.all.every((child) => evaluateDomCondition(root, child));
  if ("any" in rule)
    return rule.any.some((child) => evaluateDomCondition(root, child));
  let nodes: Element[] = [root];
  for (const step of rule.path) {
    if (nodes.length !== 1) return false;
    const node = nodes[0];
    if (step.query) nodes = Array.from(node.querySelectorAll(step.query));
    else if (step.closest) {
      const target = node.closest(step.closest);
      nodes = target ? [target] : [];
    } else if (step.parent)
      nodes = node.parentElement ? [node.parentElement] : [];
    else return false;
  }
  if (
    nodes.length < (rule.minCount ?? 1) ||
    nodes.length > (rule.maxCount ?? 1)
  )
    return false;
  return nodes.every((node) => {
    if (rule.text !== undefined && node.textContent?.trim() !== rule.text)
      return false;
    if (
      rule.attributes &&
      !Object.entries(rule.attributes).every(
        ([key, value]) => node.getAttribute(key) === value,
      )
    )
      return false;
    if (
      rule.attributePatterns &&
      !Object.entries(rule.attributePatterns).every(([key, pattern]) =>
        new RegExp(pattern).test(node.getAttribute(key) ?? ""),
      )
    )
      return false;
    if (
      rule.enabled !== undefined &&
      !node.matches(":disabled") !== rule.enabled
    )
      return false;
    if (
      rule.required !== undefined &&
      (!(
        node instanceof HTMLInputElement ||
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLSelectElement
      ) ||
        node.required !== rule.required)
    )
      return false;
    if (rule.value !== undefined || rule.nonEmpty !== undefined) {
      if (!(
        node instanceof HTMLInputElement ||
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLSelectElement
      ))
        return false;
      if (rule.value !== undefined && node.value !== rule.value) return false;
      if (rule.nonEmpty !== undefined && !!node.value.trim() !== rule.nonEmpty)
        return false;
    }
    return true;
  });
}
