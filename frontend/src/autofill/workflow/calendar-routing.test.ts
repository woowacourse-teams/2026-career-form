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

describe("separate calendar execution action", () => {
  const items = [
    item("date-selected", "SELECT_DATE"),
    item("date-unselected", "SELECT_DATE", false),
    item("school", "SEARCH_SELECTION"),
    item("name", "SET_TEXT"),
  ];

  it("does not include date selections in the ordinary action", () => {
    expect(
      executionItemsForAction(items, "ordinary").map((x) => x.candidateId),
    ).toEqual(["school", "name"]);
  });

  it("never includes searches or ordinary controls in the calendar action", () => {
    expect(
      executionItemsForAction(items, "calendar").map((x) => x.candidateId),
    ).toEqual(["date-selected", "date-unselected"]);
  });
});
