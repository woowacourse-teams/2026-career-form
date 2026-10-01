import type { ReviewPlanItem } from "../review/review-plan";

export function executionItemsForAction(
  items: readonly ReviewPlanItem[],
): ReviewPlanItem[] {
  return [...items];
}
