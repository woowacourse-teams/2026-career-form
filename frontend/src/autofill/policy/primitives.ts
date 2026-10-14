import type { MatchedFieldAnalysis } from "../api/types";
import type { FieldRule } from "./types";
export const text = (value: string | null | undefined) =>
  value?.normalize("NFKC").replace(/\s+/g, " ").trim() ?? "";
export function visible(element: Element, allowDisabled = false): boolean {
  if (!element.isConnected || (!allowDisabled && element.matches(":disabled"))) return false;
  for (let p: Element | null = element; p; p = p.parentElement) {
    if (p.matches('[hidden],[inert],[aria-hidden="true"]')) return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(p);
    if (style?.display === "none" || style?.visibility === "hidden")
      return false;
  }
  return true;
}
export function named(document: Document, name: string): Element[] {
  return Array.from(document.querySelectorAll(`[name="${CSS.escape(name)}"]`));
}
export function matchesBinding(
  rule: FieldRule,
  analysis?: MatchedFieldAnalysis,
): boolean {
  const binding = analysis?.valueBinding;
  return (
    !!binding &&
    binding.type === rule.binding &&
    binding.profileFieldKey === rule.key &&
    (!rule.recipe ||
      (binding.type === "DERIVED" &&
        binding.recipe === rule.recipe &&
        (!rule.positiveLabel ||
          (binding.trueLabel === rule.positiveLabel &&
            binding.falseLabel === rule.negativeLabel))))
  );
}
export function radioGroup(
  document: Document,
  rule: FieldRule,
): HTMLInputElement[] | undefined {
  const group = named(document, rule.name);
  const options = Object.entries(rule.options ?? {});
  if (
    !options.length ||
    group.length !== options.length ||
    !group.every((el) => el instanceof HTMLInputElement && el.type === "radio")
  )
    return;
  const radios = group as HTMLInputElement[];
  return options.every(
    ([label, code]) =>
      radios.filter(
        (el) =>
          text(el.labels?.[0]?.textContent) === label && el.value === code,
      ).length === 1,
  )
    ? radios
    : undefined;
}
export function gatesPass(
  document: Document,
  rule: FieldRule,
  rules: FieldRule[],
): boolean {
  return (rule.gates ?? []).every((gate) => {
    const target = rules.find((r) => r.name === gate.name);
    if (target?.kind === "radio")
      return (
        radioGroup(document, target)?.some(
          (el) =>
            el.checked &&
            visible(el) &&
            gate.labels.includes(text(el.labels?.[0]?.textContent)),
        ) === true
      );
    const controls = named(document, gate.name);
    return (
      controls.length === 1 &&
      controls[0] instanceof HTMLSelectElement &&
      visible(controls[0]) &&
      gate.labels.includes(text(controls[0].selectedOptions[0]?.textContent))
    );
  });
}
export function option(
  select: HTMLSelectElement,
  value: string,
  rule: FieldRule,
): HTMLOptionElement | undefined {
  if (!visible(select) || !rule.labels?.includes(value)) return;
  const all = Array.from(select.options);
  if (
    rule.requireAllOptions &&
    !rule.labels.every(
      (label) => all.filter((o) => text(o.textContent) === label).length === 1,
    )
  )
    return;
  const matches = all.filter((o) => text(o.textContent) === value);
  return matches.length === 1 &&
    !matches[0].disabled &&
    !matches[0].closest("optgroup:disabled")
    ? matches[0]
    : undefined;
}
export function setNative(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
): boolean {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
    element,
    value,
  );
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return element.isConnected;
}
