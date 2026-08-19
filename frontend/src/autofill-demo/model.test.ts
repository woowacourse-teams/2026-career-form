import { describe, expect, it } from "vitest";

import { createMockReviewItems, toggleReviewItem } from "./model";

describe("autofill demo review policy", () => {
  it("selects only clearly available fields by default", () => {
    const items = createMockReviewItems();

    expect(
      items.filter((item) => item.selected).map((item) => item.status),
    ).toEqual(["available"]);
    expect(items.find((item) => item.status === "needs-review")?.selected).toBe(
      false,
    );
    expect(items.find((item) => item.status === "conflict")?.selected).toBe(
      false,
    );
    expect(items.find((item) => item.status === "sensitive")?.selected).toBe(
      false,
    );
    expect(items.find((item) => item.status === "unavailable")?.disabled).toBe(
      true,
    );
  });

  it("allows explicit optional selection but never selects unavailable fields", () => {
    const items = createMockReviewItems();
    const reviewItem = items.find((item) => item.status === "needs-review")!;
    const unavailableItem = items.find(
      (item) => item.status === "unavailable",
    )!;

    expect(
      toggleReviewItem(items, reviewItem.id).find(
        (item) => item.id === reviewItem.id,
      )?.selected,
    ).toBe(true);
    expect(toggleReviewItem(items, unavailableItem.id)).toEqual(items);
  });
});
