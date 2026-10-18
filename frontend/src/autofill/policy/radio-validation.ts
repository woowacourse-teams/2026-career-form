import { executionPolicy } from "../workflow/execution-policy";
export function targetOnlyRadio(elements: readonly Element[]): boolean {
  const first = elements[0];
  if (!(first instanceof HTMLInputElement) || first.type !== "radio" ||
      !elements.every((el) => el instanceof HTMLInputElement && el.type === "radio" && el.name === first.name && el.ownerDocument === first.ownerDocument)) return false;
  return executionPolicy(first.ownerDocument)?.browserPolicy?.fields.some(
    (rule) => rule.name === first.name && rule.kind === "radio" && rule.radioValidation === "TARGET_ONLY",
  ) === true;
}
