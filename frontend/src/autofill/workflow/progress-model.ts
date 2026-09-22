import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";

export interface WriteProgress {
  id: string;
  label: string;
  category: string;
  status: "written" | "skipped";
}
export type WorkflowActivity = "matching" | "preparing" | "address";
function uniqueDomId(element: Element): string | undefined {
  return element.id &&
    Array.from(element.ownerDocument.querySelectorAll("[id]")).filter(
      (node) => node.id === element.id,
    ).length === 1
    ? `${element.tagName}:${element.getAttribute("type") ?? ""}:${element.id}`
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
export function createProgressTracker() {
  const entries = new Map<string, WriteProgress>();
  const elements = new WeakMap<Element, string>();
  const domIds = new Map<string, string>();
  const candidateIds = new Map<string, string>();
  let sequence = 0;
  return {
    wasWritten(candidateId: string, registry: CandidateRegistry): boolean {
      const lookup = registry.lookupField(candidateId);
      const element =
        lookup.status === "ready" || lookup.status === "blocked"
          ? lookup.handle.elements[0]
          : undefined;
      const domId = element && uniqueDomId(element);
      const id =
        candidateIds.get(candidateId) ??
        (element && elements.get(element)) ??
        (domId && domIds.get(domId));
      return !!id && entries.get(id)?.status === "written";
    },
    record(
      item: ReviewPlanItem,
      result: ApprovedWriteResult,
      registry: CandidateRegistry,
    ): WriteProgress[] {
      const lookup = registry.lookupField(item.candidateId);
      const element =
        lookup.status === "ready" || lookup.status === "blocked"
          ? lookup.handle.elements[0]
          : undefined;
      let id = candidateIds.get(item.candidateId);
      if (element) {
        const uniqueId = uniqueDomId(element);
        id =
          elements.get(element) ??
          (uniqueId ? domIds.get(uniqueId) : undefined) ??
          id ??
          `field-${sequence++}`;
        elements.set(element, id);
        if (uniqueId) domIds.set(uniqueId, id);
      }
      id ??= `field-${sequence++}`;
      candidateIds.set(item.candidateId, id);
      entries.set(id, {
        id,
        label: item.fieldLabel,
        category: progressCategory(item),
        status: result.status,
      });
      return [...entries.values()];
    },
  };
}
