import type { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { executionItemsForAction } from "./calendar-routing";

export function approvedReviewExecution(
  items: readonly ReviewPlanItem[],
  retainedCandidateIds: ReadonlySet<string>,
) {
  const executableReviewItems = executionItemsForAction(
    items.filter((item) => !retainedCandidateIds.has(item.candidateId)),
  );
  const approvedCandidateIds = new Set(
    executableReviewItems
      .filter((item) => item.selected && !item.disabled)
      .map((item) => item.candidateId),
  );
  return { executableReviewItems, approvedCandidateIds };
}

/** Developer setting: selects an item the generic grades left to the applicant. */
export function includeNeedsReviewItem(item: ReviewPlanItem): ReviewPlanItem {
  return item.selected ||
    item.disabled ||
    item.hiddenFromReview ||
    item.status === "unavailable" ||
    item.genericGrade === "BLOCKED"
    ? item
    : { ...item, selected: true, includedByDeveloper: true };
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
      [...lookup.handle.elements, ...(lookup.handle.customElements ?? [])].some(
        (element) => group.contains(element),
      ),
    )
  );
}
