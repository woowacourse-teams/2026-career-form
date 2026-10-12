import { expect, it } from "vitest";
import type { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { belongsToFailedGroup } from "./workflow-write-items";

it("defers a failed driver whose control is only a custom element", () => {
  const group = document.createElement("div");
  const trigger = group.appendChild(document.createElement("button"));
  const snapshot = {
    registry: {
      lookupField: () => ({
        status: "ready",
        handle: { elements: [], customElements: [trigger] },
      }),
    },
  } as unknown as ReturnType<typeof collectFieldsSnapshot>;

  expect(
    belongsToFailedGroup(
      { candidateId: "date" } as ReviewPlanItem,
      snapshot,
      new Set([group]),
    ),
  ).toBe(true);
});
