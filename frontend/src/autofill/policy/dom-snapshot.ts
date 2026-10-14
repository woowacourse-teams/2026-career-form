/** Capture only policy-selected properties. Restoration is allowed only by the caller's ownership guard. */
export interface SnapshotRule {
  target: string;
  kind: "VALUE" | "ATTRIBUTE" | "CLASS";
  name?: string;
  optional?: boolean;
}
export type DomSnapshot = {
  rule: SnapshotRule;
  element: HTMLElement;
  value: string | boolean | null;
}[];
export function captureDomSnapshot(
  rules: SnapshotRule[],
  targets: Record<string, HTMLElement | null | undefined>,
): DomSnapshot {
  return rules.flatMap((rule) => {
    const element = targets[rule.target];
    if (!element) {
      if (rule.optional) return [];
      throw new Error("Missing snapshot target");
    }
    const value =
      rule.kind === "VALUE"
        ? (element as HTMLInputElement).value
        : rule.kind === "CLASS"
          ? element.classList.contains(rule.name!)
          : element.getAttribute(rule.name!);
    return [{ rule, element, value }];
  });
}
export function restoreDomSnapshot(
  snapshot: DomSnapshot,
  current: () => boolean,
): boolean {
  if (!current() || snapshot.some((s) => !s.element.isConnected)) return false;
  for (const { rule, element, value } of snapshot) {
    if (!element.isConnected) return false;
    if (rule.kind === "ATTRIBUTE") {
      if (value === null) element.removeAttribute(rule.name!);
      else element.setAttribute(rule.name!, String(value));
    } else if (rule.kind === "CLASS")
      element.classList.toggle(rule.name!, value === true);
    else {
      const proto =
        element instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : undefined;
      const setter =
        proto && Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (!setter) return false;
      setter.call(element, value);
    }
  }
  return true;
}
