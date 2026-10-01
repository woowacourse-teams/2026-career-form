import { describe, expect, it } from "vitest";
import type { ReviewPlanItem } from "../review/review-plan";
import { executionItemsForAction } from "./calendar-routing";

function item(candidateId: string, command: string, selected = true) {
  return {
    candidateId,
    selected,
    disabled: false,
    analysis: { writePlan: { command } },
  } as ReviewPlanItem;
}

describe("unified review execution action", () => {
  const items = [
    item("date-selected", "SELECT_DATE"),
    item("date-unselected", "SELECT_DATE", false),
    item("school", "SEARCH_SELECTION"),
    item("name", "SET_TEXT"),
  ];

  it("routes selected dates and ordinary controls through one execution", () => {
    expect(executionItemsForAction(items).map((x) => x.candidateId)).toEqual([
      "date-selected",
      "date-unselected",
      "school",
      "name",
    ]);
  });
});
