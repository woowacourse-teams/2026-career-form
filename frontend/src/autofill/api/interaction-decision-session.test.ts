import { describe, expect, it } from "vitest";
import {
  InteractionDecisionBudgetError,
  createInteractionDecisionSession,
} from "./interaction-decision-session";
import type { InteractionDecisionRequest } from "./interaction-types";

const request: InteractionDecisionRequest = {
  schemaVersion: 2,
  snapshotId: "snapshot-1",
  site: { host: "example.test", pathPattern: "/" },
  decisions: [],
};

const unavailable = {
  schemaVersion: 2 as const,
  snapshotId: "snapshot-1",
  status: "POLICY_UNAVAILABLE" as const,
  mode: null,
  decisions: [],
};

describe("interaction decision session", () => {
  it("rejects invalid budgets before creating a session", () => {
    for (const budget of [-1, 1.5, 5]) {
      expect(() =>
        createInteractionDecisionSession(async () => unavailable, budget),
      ).toThrow(RangeError);
    }
  });

  it("validates provider responses and enforces the call budget", async () => {
    const session = createInteractionDecisionSession(
      async () => unavailable,
      1,
    );
    await expect(session(request)).resolves.toMatchObject({
      status: "POLICY_UNAVAILABLE",
    });
    await expect(session(request)).rejects.toBeInstanceOf(
      InteractionDecisionBudgetError,
    );
  });

  it("allows a zero-call session to fail closed without invoking the provider", async () => {
    let calls = 0;
    const session = createInteractionDecisionSession(async () => {
      calls++;
      return unavailable;
    }, 0);
    await expect(session(request)).rejects.toMatchObject({ maxCalls: 0 });
    expect(calls).toBe(0);
  });
});
