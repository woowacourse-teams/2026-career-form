import type { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { executionItemsForAction } from "./calendar-routing";

export function approvedReviewExecution(
  items: readonly ReviewPlanItem[],
  retainedCandidateIds: ReadonlySet<string>,
  action: "ordinary" | "calendar",
) {
  const executableReviewItems = executionItemsForAction(
    items.filter((item) => !retainedCandidateIds.has(item.candidateId)),
    action,
  );
  const approvedCandidateIds = new Set(
    executableReviewItems
      .filter((item) => item.selected && !item.disabled)
      .map((item) => item.candidateId),
  );
  return { executableReviewItems, approvedCandidateIds };
}

export function belongsToFailedGroup(
  item: ReviewPlanItem,
  snapshot: ReturnType<typeof collectFieldsSnapshot>,
  failedGroups: ReadonlySet<Element>,
): boolean {
  const lookup = snapshot.registry.lookupField(item.candidateId);
  return (
    (lookup.status === "ready" || lookup.status === "blocked") &&
    [...failedGroups].some((group) =>
      lookup.handle.elements.some((element) => group.contains(element)),
    )
  );
}
