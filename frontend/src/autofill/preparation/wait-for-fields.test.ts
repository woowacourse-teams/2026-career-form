import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForExpectedFields } from "./wait-for-fields";

describe("waitForExpectedFields", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("observes a newly visible policy-named field", async () => {
    const pending = waitForExpectedFields(document, ["dependent-field"]);
    const field = document.createElement("input");
    field.name = "dependent-field";
    document.body.append(field);

    await expect(pending).resolves.toBe(true);
  });

  it("waits for a hidden parent class to be removed", async () => {
    const wrapper = document.createElement("div");
    wrapper.hidden = true;
    const field = document.createElement("input");
    field.name = "dependent-conditional-field";
    wrapper.append(field);
    document.body.append(wrapper);

    const pending = waitForExpectedFields(document, ["dependent-conditional-field"]);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    wrapper.hidden = false;

    await expect(pending).resolves.toBe(true);
  });

  it("returns immediately when a caller opts out of waiting", async () => {
    vi.useFakeTimers();
    let settled = false;
    void waitForExpectedFields(document, ["not-yet-visible"], 0).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(true);
  });

});
