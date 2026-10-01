import type { MatchedFieldAnalysis } from "../../api/types";
import type { FieldCandidateHandle } from "../../dom/types";

const STATUS_KEYS = new Map([
  ["prsVeteranBenefitYN", "veteran.veteran.veteranStatus"],
  ["prsDisabledYN", "disability.disability.disabilityStatus"],
]);
export function isProfilePriorityStatus(name: string | undefined): boolean {
  return STATUS_KEYS.has(name ?? "");
}
export function matchesProfilePriorityKey(
  name: string | undefined,
  key: string,
): boolean {
  return STATUS_KEYS.get(name ?? "") === key;
}
export function isVerifiedProfilePriorityStatus(
  name: string | undefined,
  analysis: MatchedFieldAnalysis | undefined,
): boolean {
  const key = STATUS_KEYS.get(name ?? "");
  const binding = analysis?.valueBinding;
  return Boolean(
    key &&
    analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
    analysis.interactionStatus === "READY" &&
    analysis.writePlan?.command === "CHECK_RADIO" &&
    binding?.type === "DERIVED" &&
    binding.recipe === "BOOLEAN_YN" &&
    binding.profileFieldKey === key &&
    binding.trueLabel === "대상" &&
    binding.falseLabel === "비대상",
  );
}

const DETAIL_NAMES = new Map([
  [
    "prsVeteranBenefitYN",
    ["prsVeteranBenefitNumber", "prsVeteranBenefitRelation"],
  ],
  ["prsDisabledYN", ["prsDisabledType", "prsDisabledTypeDtl"]],
]);
function usableDetail(element: Element): boolean {
  if (!element.isConnected || element.matches(":disabled")) return false;
  const view = element.ownerDocument.defaultView;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (current.matches('[hidden], [inert], [aria-hidden="true"]'))
      return false;
    const style = view?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden")
      return false;
  }
  return true;
}
export function settleProfilePriorityStatus(
  document: Document,
  handle: FieldCandidateHandle,
): Promise<boolean> {
  const name = handle.candidate.domName ?? "";
  const fields = DETAIL_NAMES.get(name);
  const selected = handle.elements.filter(
    (el): el is HTMLInputElement =>
      el instanceof HTMLInputElement && el.checked,
  );
  if (!fields || selected.length !== 1) return Promise.resolve(false);
  const target = selected[0];
  const code = target.value;
  const ready = () => {
    const group = Array.from(
      document.querySelectorAll('[name="' + name + '"]'),
    );
    if (
      group.length !== 2 ||
      !group.every((el) => handle.elements.includes(el as HTMLInputElement)) ||
      !target.isConnected ||
      !target.checked ||
      target.value !== code
    )
      return false;
    return fields.every((field) => {
      const controls = Array.from(
        document.querySelectorAll('[name="' + field + '"]'),
      );
      return code === "1"
        ? controls.length === 1 && usableDetail(controls[0])
        : controls.every((el) => !usableDetail(el));
    });
  };
  if (ready()) return Promise.resolve(true);
  const view = document.defaultView;
  if (!view) return Promise.resolve(false);
  return new Promise((resolve) => {
    const observer = new view.MutationObserver(() => {
      if (ready()) {
        observer.disconnect();
        view.clearTimeout(timeout);
        resolve(true);
      }
    });
    const timeout = view.setTimeout(() => {
      observer.disconnect();
      resolve(ready());
    }, 1000);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "hidden",
        "inert",
        "disabled",
        "style",
        "class",
        "aria-hidden",
        "name",
        "value",
      ],
    });
  });
}
