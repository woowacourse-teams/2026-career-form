import { describe, expect, it } from "vitest";
import type { InteractionDecisionRequest } from "./interaction-types";
import { validateInteractionDecisionResponse } from "./validate-interaction-response";

function request(structure: unknown, role = "SEARCH_RESULT_ACTION") {
  return {
    schemaVersion: 2,
    snapshotId: "result-snapshot",
    site: { host: "example.test", pathPattern: "/apply" },
    decisions: [
      {
        decisionId: "structure",
        role,
        canonicalFieldKey: "education.university.schoolName",
        candidates: [
          {
            candidateId: "shape",
            element: "custom",
            control: "button",
            visibility: "visible",
            relationToTarget: "DIALOG_CONTROL",
            structure,
          },
        ],
      },
    ],
  } as unknown as InteractionDecisionRequest;
}
function response(input: InteractionDecisionRequest) {
  return {
    schemaVersion: 2,
    snapshotId: input.snapshotId,
    status: "COMPLETE",
    mode: "GENERIC",
    decisions: [
      {
        decisionId: "structure",
        role: input.decisions[0]!.role,
        selection: "SELECTED",
        candidateId: "shape",
      },
    ],
  };
}

describe("result role eligibility", () => {
  it.each([
    { activation: "script" },
    { tag: "custom-script" },
    { ariaRole: "unknown" },
    { depth: 7 },
    { childCount: -1 },
    { selector: "#private" },
  ])("rejects non-finite structural evidence %j", (invalid) => {
    const input = request({
      tag: "div",
      ariaRole: "none",
      activation: "inline-click",
      depth: 1,
      childCount: 0,
      ...invalid,
    });
    expect(() =>
      validateInteractionDecisionResponse(input, response(input)),
    ).toThrow();
  });
  it.each([
    undefined,
    {
      tag: "div",
      ariaRole: "none",
      activation: "none",
      depth: 1,
      childCount: 0,
    },
  ])(
    "rejects roleless result actions without mechanical evidence",
    (structure) => {
      const input = request(structure);
      expect(() =>
        validateInteractionDecisionResponse(input, response(input)),
      ).toThrow();
    },
  );
  it("accepts an opaque structural action with inline click evidence", () => {
    const input = request({
      tag: "div",
      ariaRole: "none",
      activation: "inline-click",
      depth: 1,
      childCount: 0,
    });
    expect(
      validateInteractionDecisionResponse(input, response(input)).decisions[0]
        ?.candidateId,
    ).toBe("shape");
  });
  it("rejects data-bearing semantic context on a result role", () => {
    const input = request({
      tag: "div",
      ariaRole: "none",
      activation: "inline-click",
      depth: 1,
      childCount: 0,
    });
    input.decisions[0]!.candidates[0]!.semanticContext = {
      labels: [{ source: "title", text: "가상대학교" }],
    };
    expect(() =>
      validateInteractionDecisionResponse(input, response(input)),
    ).toThrow();
  });
});
