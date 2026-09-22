import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import { matchesResultValue } from "./result-value-match";

export interface WriteProgress {
  id: string;
  label: string;
  category: string;
  status: "written" | "skipped";
  candidateId?: string;
  unchanged?: boolean;
}
export type WorkflowActivity = "matching" | "preparing" | "address";
function uniqueDomId(element: Element): string | undefined {
  return element.id &&
    Array.from(element.ownerDocument.querySelectorAll("[id]")).filter(
      (node) => node.id === element.id,
    ).length === 1
    ? `${element.tagName}:${element.getAttribute("type") ?? ""}:${element.getAttribute("name") ?? ""}:${element.id}`
    : undefined;
}
export function progressCategory(item: ReviewPlanItem): string {
  const binding = item.analysis?.valueBinding;
  const key = binding?.profileFieldKey ?? item.profileFieldKey;
  const categoryId =
    key?.split(".")[0] ??
    (binding?.type === "DERIVED" && binding.recipe.includes("FULL_NAME")
      ? "personal"
      : undefined);
  return (
    PROFILE_CATEGORIES.find((category) => category.id === categoryId)?.label ??
    "기타 항목"
  ).replaceAll("·", "/");
}
function stillReflected(
  item: ReviewPlanItem,
  registry: CandidateRegistry,
): boolean {
  if (
    (item.status === "needs-review" ||
      item.analysis?.mappingStatus === "LLM_SUGGESTED") &&
    item.analysis?.mappingStatus !== "ADAPTER_VERIFIED"
  )
    return false;
  const lookup = registry.lookupField(item.candidateId);
  if (lookup.status !== "ready" && lookup.status !== "blocked") return false;
  const handle = lookup.handle;
  const element = handle.elements[0];
  let value =
    element instanceof HTMLSelectElement
      ? (element.selectedOptions[0]?.textContent ?? "")
      : (element?.value ?? "");
  if (
    handle.candidate.control === "radio" ||
    handle.candidate.control === "checkbox"
  ) {
    value =
      handle.candidate.options
        ?.filter((option) => {
          const control = handle.optionElements.get(option.optionId);
          return control instanceof HTMLInputElement && control.checked;
        })
        .map((option) => option.displayName)
        .join(", ") ?? "";
  }
  return matchesResultValue(item, value, item.profileValue ?? "");
}
export function createProgressTracker() {
  const entries = new Map<string, WriteProgress>();
  const elements = new WeakMap<Element, string>();
  const domIds = new Map<
    string,
    { id: string; element: Element; scope: string }
  >();
  const candidateIds = new WeakMap<CandidateRegistry, Map<string, string>>();
  const verifiers = new Map<string, () => boolean>();
  let sequence = 0;
  const progressIdFor = (candidateId: string, registry: CandidateRegistry) => {
    const lookup = registry.lookupField(candidateId);
    const element =
      lookup.status === "ready" || lookup.status === "blocked"
        ? lookup.handle.elements[0]
        : undefined;
    return (
      (element && elements.get(element)) ??
      candidateIds.get(registry)?.get(candidateId)
    );
  };
  return {
    progressIdFor,
    progressStateFor(id: string): boolean {
      return verifiers.get(id)?.() ?? false;
    },
    wasWritten(candidateId: string, registry: CandidateRegistry): boolean {
      const id = progressIdFor(candidateId, registry);
      return !!id && entries.get(id)?.status === "written";
    },
    record(
      item: ReviewPlanItem,
      result: ApprovedWriteResult,
      registry: CandidateRegistry,
    ): WriteProgress[] {
      const lookup = registry.lookupField(item.candidateId);
      const handle =
        lookup.status === "ready" || lookup.status === "blocked"
          ? lookup.handle
          : undefined;
      const element = handle?.elements[0];
      const registryIds =
        candidateIds.get(registry) ?? new Map<string, string>();
      let id = progressIdFor(item.candidateId, registry);
      if (element) {
        const uniqueId = uniqueDomId(element);
        const binding = item.analysis?.valueBinding;
        const bindingKey = binding?.profileFieldKey ?? item.profileFieldKey;
        const recipe = binding?.type === "DERIVED" ? binding.recipe : undefined;
        const scope = JSON.stringify([
          binding?.type,
          bindingKey,
          recipe,
          item.profileEntryId,
          item.itemIndex ?? handle?.itemIndex,
          handle?.itemGroupId,
        ]);
        const previous = uniqueId ? domIds.get(uniqueId) : undefined;
        if (
          !id &&
          previous &&
          (bindingKey || recipe) &&
          !previous.element.isConnected &&
          previous.scope === scope
        )
          id = previous.id;
        id ??= `field-${sequence++}`;
        elements.set(element, id);
        if (uniqueId) domIds.set(uniqueId, { id, element, scope });
      }
      id ??= `field-${sequence++}`;
      registryIds.set(item.candidateId, id);
      candidateIds.set(registry, registryIds);
      const previous = entries.get(id);
      const currentlyEqual = matchesResultValue(
        item,
        item.currentValue,
        item.profileValue ?? "",
      );
      const unchanged = previous
        ? previous.unchanged === true &&
          (result.status !== "written" || currentlyEqual)
        : currentlyEqual;
      entries.set(id, {
        id,
        candidateId: item.candidateId,
        label: item.fieldLabel,
        category: progressCategory(item),
        status: result.status,
        unchanged,
      });
      verifiers.set(
        id,
        () => result.status === "written" && stillReflected(item, registry),
      );
      return [...entries.values()];
    },
  };
}
