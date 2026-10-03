import { describe, expect, it } from "vitest";
import { validateInteractionDecisionResponse } from "./validate-interaction-response";
import { calendarRequestWithinBounds } from "./calendar-role-contract";
import type {
  CalendarStructure,
  InteractionDecisionRequest,
  InteractionRole,
} from "./interaction-types";

function request(
  role: InteractionRole = "CALENDAR_YEAR_CONTROL",
  shape: Partial<CalendarStructure> = {},
): InteractionDecisionRequest {
  return {
    schemaVersion: 2,
    snapshotId: "calendar-snapshot",
    site: { host: "example.test", pathPattern: "/" },
    decisions: [
      {
        decisionId: "role-1",
        role,
        canonicalFieldKey: "calendar-month",
        candidates: [
          {
            candidateId: "c1",
            element: "custom",
            control: "button",
            visibility: "visible",
            relationToTarget: "DIALOG_CONTROL",
            calendarStructure: {
              tag: "select",
              activation: "change",
              ownership: "adjacent-trigger",
              unit: "month",
              unitEvidence: "target-label",
              valueShape: "year-options",
              ...shape,
            },
          },
        ],
      },
    ],
  };
}

function response(input: InteractionDecisionRequest) {
  return {
    schemaVersion: 2,
    snapshotId: input.snapshotId,
    status: "COMPLETE",
    mode: "GENERIC",
    decisions: input.decisions.map((decision) => ({
      decisionId: decision.decisionId,
      role: decision.role,
      selection: "SELECTED",
      candidateId: decision.candidates[0]?.candidateId,
    })),
  };
}

describe("finite calendar response contract", () => {
  it.each([
    [
      "CALENDAR_YEAR_CONTROL",
      { tag: "select", activation: "change", valueShape: "year-options" },
    ],
    [
      "CALENDAR_MONTH_CONTROL",
      { tag: "select", activation: "change", valueShape: "month-options" },
    ],
    [
      "CALENDAR_DAY_CONTROL",
      { tag: "a", activation: "click", valueShape: "day-grid", unit: "day" },
    ],
    [
      "CALENDAR_NAVIGATION",
      { tag: "a", activation: "click", valueShape: "previous" },
    ],
    [
      "CALENDAR_APPLY",
      { tag: "button", activation: "click", valueShape: "apply" },
    ],
  ] as const)("accepts only a finite candidate for %s", (role, shape) => {
    const input = request(role, shape);
    expect(
      validateInteractionDecisionResponse(input, response(input)).decisions[0]
        ?.candidateId,
    ).toBe("c1");
  });

  it.each(["date", "selector", "code", "procedure"])(
    "rejects injected %s even beside a valid candidateId",
    (extra) => {
      const input = request();
      const value = response(input);
      Object.assign(value.decisions[0] ?? {}, { [extra]: "untrusted" });
      expect(() => validateInteractionDecisionResponse(input, value)).toThrow();
    },
  );

  it("rejects role/evidence disagreement", () => {
    const input = request("CALENDAR_MONTH_CONTROL");
    expect(() =>
      validateInteractionDecisionResponse(input, response(input)),
    ).toThrow();
  });

  it.each(["missing", "labels", "extra"])(
    "rejects %s structural evidence",
    (failure) => {
      const input = request();
      const candidate = input.decisions[0]?.candidates[0];
      if (!candidate) throw new Error("Missing fixture");
      if (failure === "missing") delete candidate.calendarStructure;
      if (failure === "labels")
        candidate.semanticContext = {
          labels: [{ source: "label", text: "private date" }],
        };
      if (failure === "extra")
        Object.assign(candidate.calendarStructure ?? {}, {
          selectedDate: "private date",
        });
      expect(() =>
        validateInteractionDecisionResponse(input, response(input)),
      ).toThrow();
    },
  );

  it.each(["per-role", "decisions", "total", "bytes"])(
    "rejects request overflow: %s",
    (limit) => {
      const input = request();
      const decision = input.decisions[0];
      if (!decision) throw new Error("Missing fixture");
      const candidate = decision.candidates[0];
      if (!candidate) throw new Error("Missing fixture");
      if (limit === "per-role")
        decision.candidates = Array.from({ length: 9 }, (_, index) => ({
          ...candidate,
          candidateId: `c${index}`,
        }));
      if (limit === "decisions")
        input.decisions = Array.from({ length: 9 }, (_, index) => ({
          ...decision,
          decisionId: `d${index}`,
        }));
      if (limit === "total")
        input.decisions = Array.from({ length: 5 }, (_, index) => ({
          ...decision,
          decisionId: `d${index}`,
          candidates: Array.from({ length: 7 }, (_, offset) => ({
            ...candidate,
            candidateId: `c${index}-${offset}`,
          })),
        }));
      if (limit === "bytes") decision.canonicalFieldKey = "x".repeat(16_384);
      expect(calendarRequestWithinBounds(input)).toBe(false);
      expect(() =>
        validateInteractionDecisionResponse(input, response(input)),
      ).toThrow();
    },
  );
});
