import type { ReviewPlanItem } from "../review/review-plan";

export function executionItemsForAction(
  items: readonly ReviewPlanItem[],
  action: "ordinary" | "calendar",
): ReviewPlanItem[] {
  return items.filter(
    (item) =>
      (item.analysis?.writePlan?.command === "SELECT_DATE") ===
      (action === "calendar"),
  );
}
